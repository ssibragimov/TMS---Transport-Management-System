import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertSeverity,
  AlertType,
  MeterSource,
  Prisma,
  WaybillStatus,
} from '@prisma/client';
import {
  CLEARANCE_LABEL,
  DocumentKind,
  PERMISSIONS,
  TECHNICAL_LABEL,
  VehicleCondition,
  needsConditionAct,
  calculateClosingFuel,
  calculateDeviation,
  type PaginatedResult,
  type WorkVolume,
} from '@gsm/shared';

import { paginate } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { DocumentNumberService } from '@/common/services/document-number.service';
import { TenantStore } from '@/common/tenancy/tenant-context';
import { DriversService } from '@/modules/drivers/drivers.service';
import { FuelNormsService } from '@/modules/fuel/fuel-norms.service';
import { VehiclesService } from '@/modules/vehicles/vehicles.service';

import type {
  CloseWaybillDto,
  CreateWaybillDto,
  IssueWaybillDto,
  WaybillQueryDto,
} from './dto/waybill.dto';

/** Перерасход свыше этого процента поднимает алерт. */
const OVERCONSUMPTION_ALERT_PCT = 10;

const SORTABLE = ['number', 'validFrom', 'status', 'createdAt', 'fuelDeviationPct'] as const;

/** Допустимые переходы состояний путевого листа. */
const TRANSITIONS: Record<WaybillStatus, WaybillStatus[]> = {
  DRAFT: [WaybillStatus.ISSUED, WaybillStatus.CANCELLED],
  ISSUED: [WaybillStatus.IN_PROGRESS, WaybillStatus.SUBMITTED, WaybillStatus.CANCELLED],
  IN_PROGRESS: [WaybillStatus.SUBMITTED, WaybillStatus.CANCELLED],
  SUBMITTED: [WaybillStatus.CLOSED, WaybillStatus.IN_PROGRESS, WaybillStatus.CANCELLED],
  CLOSED: [],
  CANCELLED: [],
};

@Injectable()
export class WaybillsService {
  private readonly logger = new Logger(WaybillsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: DocumentNumberService,
    private readonly norms: FuelNormsService,
    private readonly drivers: DriversService,
    private readonly vehicles: VehiclesService,
  ) {}

  async list(officeId: number, query: WaybillQueryDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.WaybillWhereInput = {
      officeId,
      deletedAt: null,
      ...(query.status && { status: query.status }),
      ...(query.type && { type: query.type }),
      ...(query.vehicleId && { vehicleId: query.vehicleId }),
      ...(query.driverId && { driverId: query.driverId }),
      ...(query.deviationOver !== undefined && {
        fuelDeviationPct: { gte: query.deviationOver },
      }),
      ...((query.dateFrom || query.dateTo) && {
        validFrom: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
      ...(query.search && { number: { contains: query.search, mode: 'insensitive' } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.waybill.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: query.orderBy(SORTABLE, 'validFrom'),
        include: {
          vehicle: { select: { id: true, garageNumber: true, plateNumber: true, category: true } },
          driver: { select: { id: true, lastName: true, firstName: true, personnelNumber: true } },
          _count: { select: { tasks: true, fuelIssues: true } },
        },
      }),
      this.prisma.db.waybill.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  /** Акты о повреждении техники — журнал для разбора и удержаний. */
  async listConditionActs(
    officeId: number,
    query: { skip: number; take: number; page: number; pageSize: number },
  ): Promise<PaginatedResult<unknown>> {
    const where = { officeId };

    const [items, total] = await Promise.all([
      this.prisma.db.vehicleConditionAct.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { reportedAt: 'desc' },
        include: {
          vehicle: { select: { id: true, garageNumber: true, plateNumber: true } },
          driver: {
            select: { id: true, lastName: true, firstName: true, personnelNumber: true },
          },
          waybill: { select: { id: true, number: true, validFrom: true, validTo: true } },
        },
      }),
      this.prisma.db.vehicleConditionAct.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  async findOne(officeId: number, id: number) {
    const waybill = await this.prisma.db.waybill.findFirst({
      where: { id, officeId, deletedAt: null },
      include: {
        vehicle: { include: { model: true, fuelType: true } },
        driver: true,
        tasks: { orderBy: { sequence: 'asc' } },
        fuelIssues: {
          where: { deletedAt: null },
          orderBy: { issuedAt: 'asc' },
          include: { tank: { select: { code: true, name: true } } },
        },
      },
    });

    if (!waybill) {
      throw new NotFoundException({
        code: 'waybill.not_found',
        message: 'Путевой лист не найден',
      });
    }
    return waybill;
  }

  /**
   * Создание путевого листа (черновик).
   *
   * Номер выдаётся сразу и в той же транзакции: нумерация должна быть
   * без пропусков, а откат создания должен откатывать и номер.
   */
  async create(officeId: number, dto: CreateWaybillDto) {
    const userId = TenantStore.get()?.userId ?? null;
    const validFrom = new Date(dto.validFrom);
    const validTo = new Date(dto.validTo);

    if (validTo <= validFrom) {
      throw new BadRequestException({
        code: 'waybill.invalid_period',
        message: 'Окончание периода должно быть позже начала',
      });
    }

    /*
     * Медицинский допуск проверяется уже на создании листа.
     *
     * Порядок в службе такой: водитель проходит здравпункт и только потом
     * идёт за техникой. Значит, к моменту оформления листа заключение врача
     * обязано существовать — лист без него не создаётся вовсе, а не создаётся
     * с предупреждением. Отсутствие осмотра снимается тем же правом
     * waybill.override_medical, что и при выдаче: иначе при закрытом
     * здравпункте нельзя было бы даже дойти до шага выдачи. Отказ врача
     * не снимается ничем.
     *
     * До транзакции, а не внутри: запрос из открытой транзакции уходит
     * по другому соединению, где переменные сессии для RLS не выставлены,
     * и выборка молча возвращается пустой (см. PrismaService.db).
     */
    const { verdict } = await this.drivers.preTripClearance(dto.driverId, new Date());
    if (!verdict.allowed) {
      const canOverride =
        verdict.overridable &&
        TenantStore.get()?.permissions?.includes(PERMISSIONS.WAYBILL_OVERRIDE_MEDICAL);

      if (!canOverride) {
        throw new ConflictException({
          code: 'waybill.medical_clearance_required',
          message:
            verdict.state === 'FAILED'
              ? 'Врач не допустил водителя к работе — путевой лист не создаётся'
              : `${CLEARANCE_LABEL[verdict.state]} — путевой лист не создаётся`,
          details: {
            hint: [
              verdict.state === 'FAILED'
                ? 'Требуется замена водителя'
                : 'Водитель должен пройти предрейсовый осмотр в здравпункте',
            ],
          },
        });
      }
    }

    return this.prisma.transaction(async (tx) => {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: dto.vehicleId, officeId, deletedAt: null },
      });
      if (!vehicle) {
        throw new NotFoundException({
          code: 'vehicle.not_found',
          message: 'Единица техники не найдена',
        });
      }
      if (vehicle.status !== 'ACTIVE') {
        throw new ConflictException({
          code: 'waybill.vehicle_not_available',
          message: `Техника недоступна: статус ${vehicle.status}`,
        });
      }

      // Одна единица техники не может работать по двум путевым листам
      // одновременно — иначе пробег и топливо задваиваются.
      const overlapping = await tx.waybill.findFirst({
        where: {
          vehicleId: dto.vehicleId,
          deletedAt: null,
          status: { in: [WaybillStatus.ISSUED, WaybillStatus.IN_PROGRESS] },
          validFrom: { lt: validTo },
          validTo: { gt: validFrom },
        },
        select: { id: true, number: true },
      });
      if (overlapping) {
        throw new ConflictException({
          code: 'waybill.vehicle_busy',
          message: `На этот период уже выдан путевой лист ${overlapping.number}`,
        });
      }

      const driver = await tx.driver.findFirst({
        where: { id: dto.driverId, officeId, deletedAt: null },
        select: { id: true },
      });
      if (!driver) {
        throw new NotFoundException({
          code: 'driver.not_found',
          message: 'Водитель не найден',
        });
      }

      const number = await this.numbers.next(tx, officeId, DocumentKind.WAYBILL, validFrom);

      return tx.waybill.create({
        data: {
          officeId,
          number,
          type: dto.type,
          status: WaybillStatus.DRAFT,
          vehicleId: vehicle.id,
          driverId: dto.driverId,
          coDriverId: dto.coDriverId ?? null,
          validFrom,
          validTo,
          // Показания на выезд по умолчанию берутся из карточки техники:
          // диспетчер не должен переписывать их с одометра вручную.
          odometerStart: dto.odometerStart ?? vehicle.currentOdometer,
          engineHoursStart: dto.engineHoursStart ?? vehicle.currentEngineHours,
          fuelOpening: vehicle.currentFuelLevel,
          notes: dto.notes ?? null,
          createdBy: userId,
          ...(dto.tasks?.length && {
            tasks: {
              create: dto.tasks.map((task) => ({
                sequence: task.sequence,
                fromPoint: task.fromPoint ?? null,
                toPoint: task.toPoint ?? null,
                flightNumber: task.flightNumber ?? null,
                aircraftReg: task.aircraftReg ?? null,
                standNumber: task.standNumber ?? null,
                startedAt: task.startedAt ? new Date(task.startedAt) : null,
                endedAt: task.endedAt ? new Date(task.endedAt) : null,
                distanceKm: task.distanceKm ?? null,
                engineHours: task.engineHours ?? null,
                cargoTons: task.cargoTons ?? null,
                passengers: task.passengers ?? null,
                operations: task.operations ?? null,
              })),
            },
          }),
        },
        include: { tasks: true },
      });
    });
  }

  /**
   * Выдача путевого листа водителю.
   *
   * Единственное место, где система может остановить выпуск недопущенного
   * водителя — дальше он уже на перроне.
   *
   * Медицинский допуск сюда не передаётся формой: он берётся из заключения
   * врача. Раньше диспетчер сам ставил галочку «медосмотр пройден» — то есть
   * заинтересованная сторона сама себя и проверяла. Теперь основанием служит
   * запись здравпункта, и на неё же ссылается выданный лист.
   */
  async issue(officeId: number, id: number, dto: IssueWaybillDto) {
    const userId = TenantStore.get()?.userId ?? null;
    const waybill = await this.loadForTransition(officeId, id, WaybillStatus.ISSUED);

    const vehicle = await this.prisma.db.vehicle.findUniqueOrThrow({
      where: { id: waybill.vehicleId },
      select: { requiresAirsidePermit: true },
    });

    const issues = await this.drivers.checkEligibility(waybill.driverId, {
      requiresAirsidePermit: vehicle.requiresAirsidePermit,
      onDate: new Date(),
    });

    // Замечания разделены по тому, чем они снимаются: отказ врача — ничем,
    // отсутствие осмотра — отдельным правом, просроченная бумага — обычным
    // правом выдачи. Раньше один флаг снимал всё сразу.
    const blocking = issues.filter((i) => !i.overridable);
    if (blocking.length > 0) {
      throw new ConflictException({
        code: 'waybill.driver_not_eligible',
        message: blocking[0].message,
        details: { issues: blocking.map((i) => i.message) },
      });
    }

    const medicalIssues = issues.filter((i) => i.medical);
    if (medicalIssues.length > 0) {
      const canOverride = TenantStore.get()?.permissions?.includes(
        PERMISSIONS.WAYBILL_OVERRIDE_MEDICAL,
      );

      if (!canOverride || !dto.medicalOverrideReason) {
        throw new ConflictException({
          code: 'waybill.medical_clearance_required',
          message: medicalIssues[0].message,
          details: {
            issues: medicalIssues.map((i) => i.message),
            hint: canOverride
              ? ['Укажите причину выдачи без медосмотра']
              : ['Водитель должен пройти предрейсовый осмотр в здравпункте'],
          },
        });
      }
    }

    const otherIssues = issues.filter((i) => i.overridable && !i.medical);
    if (otherIssues.length > 0 && !dto.overrideEligibility) {
      throw new ConflictException({
        code: 'waybill.driver_not_eligible',
        message: 'Водитель не допущен к работе',
        details: { issues: otherIssues.map((i) => i.message) },
      });
    }

    /*
     * Заключение механика — так же, как медицинское: берётся из базы,
     * а не с формы. Диспетчер больше не подтверждает исправность техники
     * собственной галочкой.
     */
    /*
     * Оба допуска берутся на ТЕКУЩИЙ момент, а не на начало смены.
     *
     * По validFrom заключение, выданное после составления листа, оказывалось
     * невидимым: механик признавал технику неисправной, а выдача этого
     * не замечала, потому что смотрела в прошлое. Выпуск происходит сейчас —
     * и решение принимается по тому, что известно сейчас.
     */
    const releasedAt = new Date();
    const technical = await this.vehicles.technicalClearance(waybill.vehicleId, releasedAt);

    if (!technical.verdict.allowed) {
      const canOverride =
        technical.verdict.overridable &&
        TenantStore.get()?.permissions?.includes(PERMISSIONS.WAYBILL_OVERRIDE_TECHNICAL);

      if (!canOverride || !dto.technicalOverrideReason) {
        throw new ConflictException({
          code: 'waybill.technical_clearance_required',
          message: TECHNICAL_LABEL[technical.verdict.state],
          details: {
            hint: [
              technical.verdict.state === 'FAILED'
                ? 'Неисправная техника на линию не выпускается — нужна замена'
                : canOverride
                  ? 'Укажите причину выпуска без заключения механика'
                  : 'Технику должен осмотреть механик',
            ],
          },
        });
      }
    }

    const { check, verdict } = await this.drivers.preTripClearance(
      waybill.driverId,
      releasedAt,
    );

    if (issues.length > 0) {
      this.logger.warn(
        `Путевой лист ${waybill.number} выдан вопреки ${issues.length} замечаниям ` +
          `по водителю ${waybill.driverId} (пользователь ${userId})`,
      );
    }

    return this.prisma.db.waybill.update({
      where: { id },
      data: {
        status: WaybillStatus.ISSUED,
        preTripMedicalOk: verdict.allowed,
        // Ссылку сохраняем и при выдаче в обход: тогда видно, что заключения
        // не было вовсе, а не что его потеряли.
        preTripMedicalCheckId: verdict.allowed ? (check?.id ?? null) : null,
        medicalOverrideReason: verdict.allowed ? null : (dto.medicalOverrideReason ?? null),
        preTripTechnicalOk: technical.verdict.allowed,
        preTripTechnicalInspectionId: technical.verdict.allowed
          ? (technical.check?.id ?? null)
          : null,
        technicalOverrideReason: technical.verdict.allowed
          ? null
          : (dto.technicalOverrideReason ?? null),
        preTripChecklist: (dto.preTripChecklist ?? undefined) as Prisma.InputJsonValue,
        preTripCheckedAt: new Date(),
        preTripCheckedBy: userId,
        // Состояние на выдаче — точка отсчёта для акта при возврате.
        // По умолчанию исправна: именно так технику и обязаны выдавать.
        conditionOnIssue: dto.conditionOnIssue ?? VehicleCondition.SERVICEABLE,
        conditionIssueNotes: dto.conditionIssueNotes ?? null,
        issuedBy: userId,
        issuedAt: new Date(),
      },
    });
  }

  /**
   * Сдача путевого листа водителем по возвращении.
   *
   * Отдельный шаг между «выдан» и «закрыт»: водитель фиксирует показания
   * счётчиков, диспетчер потом проверяет и закрывает с расчётом. Разделение
   * нужно, чтобы расход считался по проверенным цифрам, а не по тем,
   * что водитель ввёл в спешке на перроне.
   *
   * В мобильном приложении сюда же приедут фото одометра.
   */
  async submit(
    officeId: number,
    id: number,
    data: { odometerEnd?: number; engineHoursEnd?: number; notes?: string },
  ) {
    const waybill = await this.loadForTransition(officeId, id, WaybillStatus.SUBMITTED);

    return this.prisma.db.waybill.update({
      where: { id: waybill.id },
      data: {
        status: WaybillStatus.SUBMITTED,
        submittedAt: new Date(),
        ...(data.odometerEnd !== undefined && { odometerEnd: data.odometerEnd }),
        ...(data.engineHoursEnd !== undefined && { engineHoursEnd: data.engineHoursEnd }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });
  }

  /**
   * Закрытие путевого листа — главный расчёт системы.
   *
   * Порядок:
   *   1. объём работы собирается из показаний счётчиков и заданий;
   *   2. по нормам, действовавшим НА ДАТУ ЛИСТА, считается норматив;
   *   3. фактический расход берётся из остатка в баке, если он замерен,
   *      иначе принимается равным нормативу;
   *   4. расшифровка расчёта сохраняется в norm_breakdown — чтобы спор
   *      через год разбирался по сохранённым цифрам, а не по текущим нормам.
   */
  async close(officeId: number, id: number, dto: CloseWaybillDto) {
    const userId = TenantStore.get()?.userId ?? null;
    const waybill = await this.loadForTransition(officeId, id, WaybillStatus.CLOSED);

    // Показания на возврат: из запроса, иначе — уже сохранённые в листе.
    const odometerEnd =
      dto.odometerEnd ??
      (waybill.odometerEnd === null ? null : Number(waybill.odometerEnd));
    const engineHoursEnd =
      dto.engineHoursEnd ??
      (waybill.engineHoursEnd === null ? null : Number(waybill.engineHoursEnd));

    const odometerStart =
      waybill.odometerStart === null ? null : Number(waybill.odometerStart);
    const engineHoursStart =
      waybill.engineHoursStart === null ? null : Number(waybill.engineHoursStart);

    if (odometerEnd !== null && odometerStart !== null && odometerEnd < odometerStart) {
      throw new BadRequestException({
        code: 'waybill.odometer_decreased',
        message:
          `Одометр на возврат (${odometerEnd}) меньше показания на выезд (${odometerStart}). ` +
          'Если счётчик заменён, оформите корректировку показаний.',
      });
    }
    if (engineHoursEnd !== null && engineHoursStart !== null && engineHoursEnd < engineHoursStart) {
      throw new BadRequestException({
        code: 'waybill.engine_hours_decreased',
        message: 'Счётчик моточасов на возврат меньше показания на выезд',
      });
    }

    const distanceKm =
      odometerEnd !== null && odometerStart !== null ? odometerEnd - odometerStart : 0;
    const engineHours =
      engineHoursEnd !== null && engineHoursStart !== null
        ? engineHoursEnd - engineHoursStart
        : 0;

    const tasks = dto.tasks ?? (await this.loadTasks(id));
    const operations = tasks.reduce((sum, t) => sum + (t.operations ?? 0), 0);
    const tonKm = tasks.reduce(
      (sum, t) => sum + (t.cargoTons ?? 0) * (t.distanceKm ?? 0),
      0,
    );

    const volume: WorkVolume = {
      distanceKm,
      engineHours,
      operations,
      tonKm,
      shifts: 1,
    };

    const calculation = await this.norms.calculateForVehicle(
      officeId,
      waybill.vehicleId,
      volume,
      waybill.validFrom,
    );

    const fuelOpening = Number(waybill.fuelOpening);
    const fuelIssued = Number(waybill.fuelIssued);

    // Если фактический остаток замерен — расход считается по нему.
    // Если нет, принимается нормативный: так делает большинство автобаз,
    // но тогда перерасход по определению нулевой, и это надо понимать.
    const fuelConsumed =
      dto.fuelClosing !== undefined
        ? fuelOpening + fuelIssued - dto.fuelClosing
        : calculation.totalLitres;

    if (fuelConsumed < 0) {
      throw new BadRequestException({
        code: 'waybill.negative_consumption',
        message:
          `Отрицательный расход: остаток на начало ${fuelOpening} л + выдано ${fuelIssued} л ` +
          `− остаток на конец ${dto.fuelClosing} л. Проверьте замер остатка.`,
      });
    }

    const fuelClosing =
      dto.fuelClosing ?? calculateClosingFuel(fuelOpening, fuelIssued, fuelConsumed);

    const deviation = calculateDeviation(fuelConsumed, calculation.totalLitres);

    const closed = await this.prisma.transaction(async (tx) => {
      if (dto.tasks) {
        await tx.waybillTask.deleteMany({ where: { waybillId: id } });
        await tx.waybillTask.createMany({
          data: dto.tasks.map((task) => ({
            waybillId: id,
            sequence: task.sequence,
            fromPoint: task.fromPoint ?? null,
            toPoint: task.toPoint ?? null,
            flightNumber: task.flightNumber ?? null,
            aircraftReg: task.aircraftReg ?? null,
            standNumber: task.standNumber ?? null,
            startedAt: task.startedAt ? new Date(task.startedAt) : null,
            endedAt: task.endedAt ? new Date(task.endedAt) : null,
            distanceKm: task.distanceKm ?? null,
            engineHours: task.engineHours ?? null,
            cargoTons: task.cargoTons ?? null,
            passengers: task.passengers ?? null,
            operations: task.operations ?? null,
          })),
        });
      }

      const updated = await tx.waybill.update({
        where: { id },
        data: {
          status: WaybillStatus.CLOSED,
          odometerEnd,
          engineHoursEnd,
          distanceKm,
          engineHours,
          operations,
          tonKm,
          fuelConsumed,
          fuelClosing,
          fuelNorm: calculation.totalLitres,
          fuelDeviation: deviation.absolute,
          fuelDeviationPct: deviation.percent,
          normBreakdown: calculation as unknown as Prisma.InputJsonValue,
          closedBy: userId,
          closedAt: new Date(),
          ...(dto.conditionOnReturn !== undefined && {
            conditionOnReturn: dto.conditionOnReturn,
          }),
          ...(dto.conditionReturnNotes !== undefined && {
            conditionReturnNotes: dto.conditionReturnNotes,
          }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
      });

      /*
       * Техника вернулась хуже, чем ушла, — составляем акт.
       *
       * Автоматически, а не по кнопке: акт, который надо не забыть создать,
       * не создаётся. Он привязан к водителю, принявшему технику исправной, —
       * ровно к тому факту, без которого спор «сломалось при мне или до меня»
       * разрешить нечем.
       */
      const conditionOnIssue = waybill.conditionOnIssue ?? VehicleCondition.SERVICEABLE;
      if (needsConditionAct(conditionOnIssue, dto.conditionOnReturn)) {
        const actNumber = await this.numbers.next(
          tx,
          officeId,
          DocumentKind.CONDITION_ACT,
          new Date(),
        );

        await tx.vehicleConditionAct.create({
          data: {
            officeId,
            number: actNumber,
            waybillId: id,
            vehicleId: waybill.vehicleId,
            driverId: waybill.driverId,
            conditionOnIssue,
            conditionOnReturn: dto.conditionOnReturn!,
            description:
              dto.conditionReturnNotes?.trim() ||
              `Состояние при возврате ухудшилось: ${conditionOnIssue} → ${dto.conditionOnReturn}`,
            medicalCheckId: waybill.preTripMedicalCheckId,
            reportedBy: userId,
          },
        });

        this.logger.warn(
          `Составлен акт ${actNumber}: техника ${waybill.vehicleId} возвращена ` +
            `в состоянии ${dto.conditionOnReturn} по листу ${waybill.number}`,
        );
      }

      // Показания счётчиков техники подтягиваются из закрытого листа —
      // он единственный достоверный источник пробега за смену.
      await tx.vehicle.update({
        where: { id: waybill.vehicleId },
        data: {
          ...(odometerEnd !== null && { currentOdometer: odometerEnd }),
          ...(engineHoursEnd !== null && { currentEngineHours: engineHoursEnd }),
          currentFuelLevel: fuelClosing,
        },
      });

      if (odometerEnd !== null || engineHoursEnd !== null) {
        await tx.vehicleMeterReading.create({
          data: {
            vehicleId: waybill.vehicleId,
            recordedAt: waybill.validTo,
            odometer: odometerEnd,
            engineHours: engineHoursEnd,
            source: MeterSource.WAYBILL,
            waybillId: id,
            comment: `Закрытие путевого листа ${waybill.number}`,
            createdBy: userId,
          },
        });
      }

      return updated;
    });

    if (deviation.percent !== null && deviation.percent > OVERCONSUMPTION_ALERT_PCT) {
      void this.raiseOverconsumptionAlert(officeId, closed.id, waybill.vehicleId, {
        norm: calculation.totalLitres,
        actual: fuelConsumed,
        percent: deviation.percent,
        number: waybill.number,
      });
    }

    return closed;
  }

  async cancel(officeId: number, id: number, reason: string) {
    await this.loadForTransition(officeId, id, WaybillStatus.CANCELLED);

    return this.prisma.db.waybill.update({
      where: { id },
      data: { status: WaybillStatus.CANCELLED, cancelReason: reason },
    });
  }

  /**
   * Данные для печатной формы.
   *
   * Отдельный метод, потому что печатная форма — это отдельный контракт
   * с бухгалтерией: набор полей в ней меняется независимо от карточки.
   */
  async printData(officeId: number, id: number) {
    const waybill = await this.findOne(officeId, id);
    const office = await this.prisma.db.office.findUniqueOrThrow({
      where: { id: officeId },
      select: { nameRu: true, nameUz: true, code: true, address: true, phone: true },
    });

    return {
      office,
      waybill,
      // Расшифровка расчёта сохранена на момент закрытия: пересчёт
      // по текущим нормам дал бы другую цифру, и это было бы ошибкой.
      normBreakdown: waybill.normBreakdown,
      printedAt: new Date().toISOString(),
    };
  }

  // ─── Внутреннее ──────────────────────────────────────────────────────────

  private async loadForTransition(officeId: number, id: number, target: WaybillStatus) {
    const waybill = await this.prisma.db.waybill.findFirst({
      where: { id, officeId, deletedAt: null },
    });

    if (!waybill) {
      throw new NotFoundException({
        code: 'waybill.not_found',
        message: 'Путевой лист не найден',
      });
    }

    if (!TRANSITIONS[waybill.status].includes(target)) {
      throw new ConflictException({
        code: 'waybill.invalid_transition',
        message: `Недопустимый переход состояния: ${waybill.status} → ${target}`,
      });
    }

    return waybill;
  }

  private async loadTasks(waybillId: number) {
    const tasks = await this.prisma.db.waybillTask.findMany({
      where: { waybillId },
      select: { operations: true, cargoTons: true, distanceKm: true },
    });
    return tasks.map((t) => ({
      operations: t.operations ?? 0,
      cargoTons: t.cargoTons ? Number(t.cargoTons) : 0,
      distanceKm: t.distanceKm ? Number(t.distanceKm) : 0,
    }));
  }

  private async raiseOverconsumptionAlert(
    officeId: number,
    waybillId: number,
    vehicleId: number,
    data: { norm: number; actual: number; percent: number; number: string },
  ): Promise<void> {
    try {
      await this.prisma.db.alert.create({
        data: {
          officeId,
          type: AlertType.FUEL_OVERCONSUMPTION,
          severity: data.percent > 25 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
          vehicleId,
          entityType: 'Waybill',
          entityId: waybillId,
          title: `Перерасход по путевому листу ${data.number}`,
          message:
            `Норма ${data.norm} л, факт ${data.actual} л, ` +
            `перерасход ${data.percent.toFixed(1)} %`,
          payload: data,
          occurredAt: new Date(),
          dedupeKey: `overconsumption:${waybillId}`,
        },
      });
    } catch (error) {
      this.logger.error(`Алерт о перерасходе не создан: ${(error as Error).message}`);
    }
  }
}
