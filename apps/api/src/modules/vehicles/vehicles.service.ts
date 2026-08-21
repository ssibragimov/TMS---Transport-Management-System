import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MeterSource, Prisma, VehicleStatus } from '@prisma/client';
import {
  TECHNICAL_DEFAULT_HOURS,
  TECHNICAL_LABEL,
  evaluateTechnicalClearance,
  type PaginatedResult,
} from '@gsm/shared';

import { paginate } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { TenantStore } from '@/common/tenancy/tenant-context';

import type {
  CreateVehicleDto,
  MeterAdjustmentDto,
  TechnicalInspectionDto,
  TransferVehicleDto,
  UpdateVehicleDto,
  VehicleDocumentDto,
  VehicleQueryDto,
} from './dto/vehicle.dto';

/** Поля, по которым разрешена сортировка списка. */
const SORTABLE = [
  'garageNumber',
  'plateNumber',
  'category',
  'status',
  'currentOdometer',
  'createdAt',
] as const;

/**
 * Транспорт — эталонный модуль. Остальные CRUD-модули (водители, ёмкости,
 * контрагенты) строятся по этому же образцу:
 *   • office_id проставляется из контекста, а не из тела запроса;
 *   • списки фильтруются по office_id явно, даже при включённом RLS —
 *     RLS это страховка от ошибки, а не замена бизнес-логике;
 *   • удаление мягкое;
 *   • операции, меняющие несколько таблиц, идут через prisma.transaction().
 */
@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(officeId: number, query: VehicleQueryDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.VehicleWhereInput = {
      officeId,
      deletedAt: null,
      ...(query.category && { category: query.category }),
      ...(query.status && { status: query.status }),
      ...(query.departmentId && { departmentId: query.departmentId }),
      ...(query.modelId && { modelId: query.modelId }),
      ...(query.search && {
        OR: [
          { garageNumber: { contains: query.search, mode: 'insensitive' } },
          { plateNumber: { contains: query.search, mode: 'insensitive' } },
          { vin: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.expiringWithinDays && {
        documents: {
          some: {
            deletedAt: null,
            expiresAt: {
              lte: this.daysFromNow(query.expiringWithinDays),
              gte: new Date(),
            },
          },
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.vehicle.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: query.orderBy(SORTABLE, 'garageNumber'),
        include: {
          model: { select: { id: true, manufacturer: true, model: true } },
          department: { select: { id: true, name: true } },
          fuelType: { select: { id: true, code: true, name: true } },
          // Только главное фото и только его идентификатор: списку нужно
          // лишь понять, есть ли снимок и какой открывать. Тянуть сюда все
          // фотографии значило бы утяжелить каждую страницу списка ради
          // колонки шириной в одну иконку.
          photos: { where: { isPrimary: true }, select: { id: true }, take: 1 },
        },
      }),
      this.prisma.db.vehicle.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  async findOne(officeId: number, id: number) {
    const vehicle = await this.prisma.db.vehicle.findFirst({
      where: { id, officeId, deletedAt: null },
      include: {
        model: true,
        department: { select: { id: true, name: true } },
        fuelType: true,
        documents: {
          where: { deletedAt: null },
          orderBy: { expiresAt: 'asc' },
        },
        assignments: { orderBy: { fromDate: 'desc' }, take: 10 },
        norms: {
          where: { deletedAt: null, OR: [{ validTo: null }, { validTo: { gte: new Date() } }] },
          include: { adjustments: true },
        },
        gpsDevices: { where: { removedAt: null } },
      },
    });

    if (!vehicle) {
      throw new NotFoundException({
        code: 'vehicle.not_found',
        message: 'Единица техники не найдена',
      });
    }
    return vehicle;
  }

  async create(officeId: number, dto: CreateVehicleDto) {
    const userId = TenantStore.get()?.userId ?? null;

    return this.prisma.transaction(async (tx) => {
      const duplicate = await tx.vehicle.findFirst({
        where: { officeId, garageNumber: dto.garageNumber, deletedAt: null },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException({
          code: 'vehicle.garage_number_taken',
          message: `Гаражный номер ${dto.garageNumber} уже занят в этом офисе`,
        });
      }

      const model = await tx.vehicleModel.findUnique({ where: { id: dto.modelId } });
      if (!model) {
        throw new BadRequestException({
          code: 'vehicle.model_not_found',
          message: 'Модель техники не найдена в справочнике',
        });
      }

      const vehicle = await tx.vehicle.create({
        data: {
          officeId,
          garageNumber: dto.garageNumber,
          plateNumber: dto.plateNumber ?? null,
          vin: dto.vin ?? null,
          inventoryNumber: dto.inventoryNumber ?? null,
          category: dto.category,
          modelId: dto.modelId,
          departmentId: dto.departmentId ?? null,
          // Тип счётчика и вид топлива по умолчанию берутся у модели:
          // диспетчер не должен помнить, что тягач считается по моточасам.
          fuelTypeId: dto.fuelTypeId ?? model.fuelTypeId,
          meterType: dto.meterType ?? model.meterType,
          ownership: dto.ownership,
          tankCapacity: dto.tankCapacity ?? model.tankCapacity,
          currentOdometer: dto.currentOdometer ?? null,
          currentEngineHours: dto.currentEngineHours ?? null,
          manufactureYear: dto.manufactureYear ?? null,
          commissionedAt: dto.commissionedAt ? new Date(dto.commissionedAt) : null,
          requiresAirsidePermit: dto.requiresAirsidePermit ?? true,
          notes: dto.notes ?? null,
        },
      });

      // Открываем первый период приписки. Отчёты за прошлые периоды
      // опираются на эту таблицу, а не на vehicles.office_id.
      await tx.vehicleAssignment.create({
        data: {
          vehicleId: vehicle.id,
          officeId,
          fromDate: dto.commissionedAt ? new Date(dto.commissionedAt) : new Date(),
          reason: 'Постановка на учёт',
        },
      });

      // Стартовые показания — как первая запись истории счётчика.
      if (dto.currentOdometer != null || dto.currentEngineHours != null) {
        await tx.vehicleMeterReading.create({
          data: {
            vehicleId: vehicle.id,
            recordedAt: new Date(),
            odometer: dto.currentOdometer ?? null,
            engineHours: dto.currentEngineHours ?? null,
            source: MeterSource.MANUAL,
            comment: 'Начальные показания при постановке на учёт',
            createdBy: userId,
          },
        });
      }

      return vehicle;
    });
  }

  async update(officeId: number, id: number, dto: UpdateVehicleDto) {
    await this.ensureExists(officeId, id);

    return this.prisma.db.vehicle.update({
      where: { id },
      data: {
        ...(dto.garageNumber !== undefined && { garageNumber: dto.garageNumber }),
        ...(dto.plateNumber !== undefined && { plateNumber: dto.plateNumber }),
        ...(dto.vin !== undefined && { vin: dto.vin }),
        ...(dto.inventoryNumber !== undefined && { inventoryNumber: dto.inventoryNumber }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.modelId !== undefined && { modelId: dto.modelId }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
        ...(dto.fuelTypeId !== undefined && { fuelTypeId: dto.fuelTypeId }),
        ...(dto.meterType !== undefined && { meterType: dto.meterType }),
        ...(dto.ownership !== undefined && { ownership: dto.ownership }),
        ...(dto.tankCapacity !== undefined && { tankCapacity: dto.tankCapacity }),
        ...(dto.manufactureYear !== undefined && { manufactureYear: dto.manufactureYear }),
        ...(dto.commissionedAt !== undefined && {
          commissionedAt: dto.commissionedAt ? new Date(dto.commissionedAt) : null,
        }),
        ...(dto.requiresAirsidePermit !== undefined && {
          requiresAirsidePermit: dto.requiresAirsidePermit,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });
  }

  /**
   * Мягкое удаление (списание с учёта).
   *
   * Физическое удаление невозможно: на технику ссылаются закрытые путевые листы
   * и выдачи ГСМ за прошлые периоды. Отчёт за позапрошлый год должен собираться
   * и после списания машины.
   */
  async remove(officeId: number, id: number) {
    await this.ensureExists(officeId, id);

    const openWaybills = await this.prisma.db.waybill.count({
      where: {
        vehicleId: id,
        status: { in: ['DRAFT', 'ISSUED', 'IN_PROGRESS', 'SUBMITTED'] },
        deletedAt: null,
      },
    });
    if (openWaybills > 0) {
      throw new ConflictException({
        code: 'vehicle.has_open_waybills',
        message: `Нельзя списать технику: есть незакрытых путевых листов — ${openWaybills}`,
      });
    }

    return this.prisma.transaction(async (tx) => {
      const now = new Date();

      await tx.vehicleAssignment.updateMany({
        where: { vehicleId: id, toDate: null },
        data: { toDate: now },
      });

      return tx.vehicle.update({
        where: { id },
        data: {
          deletedAt: now,
          status: VehicleStatus.DECOMMISSIONED,
          decommissionedAt: now,
        },
      });
    });
  }

  /**
   * Перевод техники в другой аэропорт.
   *
   * Закрывает текущий период приписки и открывает новый. Именно поэтому
   * office_id нельзя менять обычным update: без записи в истории отчёт
   * за прошлый месяц отнесёт весь пробег и топливо новому офису.
   *
   * Выполняется в системном контексте: пользователь Ташкента по определению
   * не видит Самарканд, а запись должна появиться в обоих.
   */
  async transfer(officeId: number, id: number, dto: TransferVehicleDto) {
    await this.ensureExists(officeId, id);

    if (dto.targetOfficeId === officeId) {
      throw new BadRequestException({
        code: 'vehicle.transfer_same_office',
        message: 'Техника уже приписана к этому офису',
      });
    }

    const effectiveFrom = new Date(dto.effectiveFrom);

    const openWaybills = await this.prisma.db.waybill.count({
      where: {
        vehicleId: id,
        status: { in: ['ISSUED', 'IN_PROGRESS', 'SUBMITTED'] },
        deletedAt: null,
      },
    });
    if (openWaybills > 0) {
      throw new ConflictException({
        code: 'vehicle.has_open_waybills',
        message: 'Перед переводом закройте все действующие путевые листы',
      });
    }

    return this.prisma.systemTransaction(async (tx) => {
      const target = await tx.office.findFirst({
        where: { id: dto.targetOfficeId, deletedAt: null, isActive: true },
      });
      if (!target) {
        throw new BadRequestException({
          code: 'office.not_found',
          message: 'Офис назначения не найден или неактивен',
        });
      }

      // День закрытия предыдущего периода — накануне перевода:
      // exclusion-constraint не допускает пересечения даже в один день.
      const previousEnd = new Date(effectiveFrom);
      previousEnd.setDate(previousEnd.getDate() - 1);

      await tx.vehicleAssignment.updateMany({
        where: { vehicleId: id, toDate: null },
        data: { toDate: previousEnd },
      });

      await tx.vehicleAssignment.create({
        data: {
          vehicleId: id,
          officeId: dto.targetOfficeId,
          fromDate: effectiveFrom,
          reason: dto.reason ?? null,
        },
      });

      return tx.vehicle.update({
        where: { id },
        data: {
          officeId: dto.targetOfficeId,
          // Подразделение принадлежит прежнему офису — связь рвём,
          // на новом месте технику распределят заново.
          departmentId: null,
          status: VehicleStatus.ACTIVE,
        },
      });
    });
  }

  // ─── Предрейсовый контроль технического состояния ────────────────────────

  /**
   * Запись заключения механика.
   *
   * Как и медосмотр, это допуск со сроком, а не отметка в журнале: именно
   * на него потом ссылается путевой лист. Подписывает вошедший пользователь —
   * раньше исправность подтверждал сам диспетчер галочкой в форме выдачи.
   */
  async addTechnicalInspection(
    officeId: number,
    vehicleId: number,
    dto: TechnicalInspectionDto,
  ) {
    await this.ensureExists(officeId, vehicleId);

    const checkedAt = dto.checkedAt ? new Date(dto.checkedAt) : new Date();
    const validUntil = dto.validUntil
      ? new Date(dto.validUntil)
      : new Date(checkedAt.getTime() + TECHNICAL_DEFAULT_HOURS * 3600_000);

    return this.prisma.db.technicalInspection.create({
      data: {
        vehicleId,
        checkedAt,
        validUntil,
        result: dto.result,
        isPreTrip: dto.isPreTrip ?? true,
        checkedByUserId: TenantStore.get()?.userId ?? null,
        mechanicName: dto.mechanicName ?? null,
        checklist: (dto.checklist ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        odometer: dto.odometer ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  /**
   * Действующее заключение механика на заданный момент.
   *
   * Берётся последнее по времени, а не последнее положительное: если механик
   * осмотрел повторно и не выпустил, прежнее разрешение не должно всплыть
   * и перекрыть отказ.
   */
  async technicalClearance(vehicleId: number, at: Date = new Date()) {
    const check = await this.prisma.db.technicalInspection.findFirst({
      where: { vehicleId, isPreTrip: true, checkedAt: { lte: at } },
      orderBy: { checkedAt: 'desc' },
      select: {
        id: true,
        checkedAt: true,
        validUntil: true,
        result: true,
        checklist: true,
        odometer: true,
        notes: true,
        mechanicName: true,
        checkedByUser: { select: { id: true, fullName: true } },
      },
    });

    const verdict = evaluateTechnicalClearance(
      check && { result: check.result, checkedAt: check.checkedAt, validUntil: check.validUntil },
      at,
    );

    return { check, verdict };
  }

  /** Допуск техники с проверкой офиса — для интерфейса диспетчера. */
  async technicalClearanceOf(officeId: number, vehicleId: number) {
    await this.ensureExists(officeId, vehicleId);
    const { check, verdict } = await this.technicalClearance(vehicleId);

    return {
      state: verdict.state,
      allowed: verdict.allowed,
      overridable: verdict.overridable,
      label: TECHNICAL_LABEL[verdict.state],
      validUntil: verdict.validUntil ?? null,
      check,
    };
  }

  /**
   * Очередь техконтроля: техника офиса и состояние её допуска.
   *
   * Возвращается вся активная, а не только неосмотренная: механику нужно
   * видеть и то, что он уже выпустил, иначе он не отличит «осмотрено»
   * от «ещё не подавали».
   */
  async technicalQueue(officeId: number, search?: string) {
    const vehicles = await this.prisma.db.vehicle.findMany({
      where: {
        officeId,
        deletedAt: null,
        status: VehicleStatus.ACTIVE,
        ...(search && {
          OR: [
            { garageNumber: { contains: search, mode: 'insensitive' } },
            { plateNumber: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { garageNumber: 'asc' },
      select: {
        id: true,
        garageNumber: true,
        plateNumber: true,
        category: true,
        currentOdometer: true,
        department: { select: { name: true } },
        technicalInspections: {
          where: { isPreTrip: true },
          orderBy: { checkedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            checkedAt: true,
            validUntil: true,
            result: true,
            notes: true,
            checkedByUser: { select: { fullName: true } },
          },
        },
      },
    });

    const now = new Date();

    return vehicles.map((vehicle) => {
      const last = vehicle.technicalInspections[0] ?? null;
      const verdict = evaluateTechnicalClearance(
        last && { result: last.result, checkedAt: last.checkedAt, validUntil: last.validUntil },
        now,
      );

      return {
        vehicleId: vehicle.id,
        garageNumber: vehicle.garageNumber,
        plateNumber: vehicle.plateNumber,
        category: vehicle.category,
        department: vehicle.department?.name ?? null,
        currentOdometer: vehicle.currentOdometer,
        state: verdict.state,
        allowed: verdict.allowed,
        label: TECHNICAL_LABEL[verdict.state],
        validUntil: verdict.validUntil ?? null,
        lastCheck: last,
      };
    });
  }

  /** История показаний счётчиков. */
  async meterHistory(officeId: number, id: number, limit = 100) {
    await this.ensureExists(officeId, id);

    const rows = await this.prisma.db.vehicleMeterReading.findMany({
      where: { vehicleId: id },
      orderBy: { recordedAt: 'desc' },
      take: Math.min(limit, 500),
    });

    // Идентификатор здесь bigint, а JSON.stringify такие значения не умеет
    // и роняет весь ответ. Клиент и так ждёт строку (см. MeterRow).
    return rows.map((row) => ({ ...row, id: String(row.id) }));
  }

  /**
   * Корректировка показаний счётчика.
   *
   * Пишет запись в историю и обновляет карточку в одной транзакции.
   * Уменьшение показаний разрешено (замена одометра), но обязательно
   * с основанием — оно останется в истории навсегда.
   */
  async adjustMeter(officeId: number, id: number, dto: MeterAdjustmentDto) {
    await this.ensureExists(officeId, id);
    const userId = TenantStore.get()?.userId ?? null;

    if (dto.odometer === undefined && dto.engineHours === undefined) {
      throw new BadRequestException({
        code: 'vehicle.meter_empty',
        message: 'Укажите хотя бы одно показание',
      });
    }

    return this.prisma.transaction(async (tx) => {
      await tx.vehicleMeterReading.create({
        data: {
          vehicleId: id,
          recordedAt: new Date(),
          odometer: dto.odometer ?? null,
          engineHours: dto.engineHours ?? null,
          source: dto.source ?? MeterSource.ADJUSTMENT,
          comment: dto.comment,
          createdBy: userId,
        },
      });

      return tx.vehicle.update({
        where: { id },
        data: {
          ...(dto.odometer !== undefined && { currentOdometer: dto.odometer }),
          ...(dto.engineHours !== undefined && { currentEngineHours: dto.engineHours }),
        },
      });
    });
  }

  // ─── Документы техники ───────────────────────────────────────────────────

  async listDocuments(officeId: number, vehicleId: number) {
    await this.ensureExists(officeId, vehicleId);

    return this.prisma.db.vehicleDocument.findMany({
      where: { vehicleId, deletedAt: null },
      orderBy: [{ expiresAt: 'asc' }],
    });
  }

  async createDocument(officeId: number, vehicleId: number, dto: VehicleDocumentDto) {
    await this.ensureExists(officeId, vehicleId);

    return this.prisma.db.vehicleDocument.create({
      data: {
        vehicleId,
        type: dto.type,
        number: dto.number ?? null,
        issuer: dto.issuer ?? null,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        amount: dto.amount ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async updateDocument(
    officeId: number,
    vehicleId: number,
    documentId: number,
    dto: Partial<VehicleDocumentDto>,
  ) {
    await this.ensureDocumentExists(officeId, vehicleId, documentId);

    return this.prisma.db.vehicleDocument.update({
      where: { id: documentId },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.number !== undefined && { number: dto.number }),
        ...(dto.issuer !== undefined && { issuer: dto.issuer }),
        ...(dto.issuedAt !== undefined && {
          issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
        }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async removeDocument(officeId: number, vehicleId: number, documentId: number) {
    await this.ensureDocumentExists(officeId, vehicleId, documentId);

    return this.prisma.db.vehicleDocument.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Документы техники с истекающим сроком.
   * Дополняет дашборд водительских допусков: без страховки и техосмотра
   * машину на перрон тоже не выпустят.
   */
  async expiringDocuments(officeId: number, withinDays = 30) {
    const until = new Date();
    until.setDate(until.getDate() + withinDays);
    const now = new Date();

    const documents = await this.prisma.db.vehicleDocument.findMany({
      where: {
        deletedAt: null,
        expiresAt: { lte: until },
        vehicle: { officeId, deletedAt: null },
      },
      orderBy: { expiresAt: 'asc' },
      include: {
        vehicle: { select: { id: true, garageNumber: true, plateNumber: true } },
      },
    });

    return documents.map((doc) => {
      const daysLeft = Math.floor(
        ((doc.expiresAt?.getTime() ?? 0) - now.getTime()) / 86_400_000,
      );
      return {
        entityType: 'VEHICLE_DOCUMENT' as const,
        entityId: doc.id,
        subjectId: doc.vehicle.id,
        subjectLabel: `${doc.vehicle.garageNumber}${doc.vehicle.plateNumber ? ` (${doc.vehicle.plateNumber})` : ''}`,
        documentType: doc.type,
        documentNumber: doc.number,
        expiresAt: doc.expiresAt?.toISOString() ?? '',
        daysLeft,
        severity: daysLeft < 0 ? 'CRITICAL' : daysLeft <= 7 ? 'WARNING' : 'INFO',
      };
    });
  }

  // ─── Фотографии техники ──────────────────────────────────────────────────

  async listPhotos(officeId: number, vehicleId: number) {
    await this.ensureExists(officeId, vehicleId);

    return this.prisma.db.vehiclePhoto.findMany({
      where: { vehicleId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        isPrimary: true,
        caption: true,
        createdAt: true,
      },
    });
  }

  async addPhoto(
    officeId: number,
    vehicleId: number,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    caption?: string,
  ) {
    await this.ensureExists(officeId, vehicleId);
    const userId = TenantStore.get()?.userId ?? null;

    const stored = await this.storage.saveImage(`vehicles/${vehicleId}`, file);

    return this.prisma.transaction(async (tx) => {
      const existing = await tx.vehiclePhoto.count({ where: { vehicleId } });

      return tx.vehiclePhoto.create({
        data: {
          vehicleId,
          fileKey: stored.key,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          // Первое загруженное фото автоматически становится главным:
          // иначе в списке техники не было бы картинки до отдельного действия.
          isPrimary: existing === 0,
          caption: caption ?? null,
          uploadedBy: userId,
        },
        select: { id: true, fileName: true, isPrimary: true },
      });
    });
  }

  /** Отдаёт файл: проверка принадлежности офису обязательна до чтения с диска. */
  async readPhoto(officeId: number, vehicleId: number, photoId: number) {
    await this.ensureExists(officeId, vehicleId);

    const photo = await this.prisma.db.vehiclePhoto.findFirst({
      where: { id: photoId, vehicleId },
    });
    if (!photo) {
      throw new NotFoundException({
        code: 'vehicle.photo_not_found',
        message: 'Фотография не найдена',
      });
    }

    const { stream } = this.storage.createReadStream(photo.fileKey);
    return { stream, photo };
  }

  async setPrimaryPhoto(officeId: number, vehicleId: number, photoId: number) {
    await this.ensureExists(officeId, vehicleId);

    return this.prisma.transaction(async (tx) => {
      const photo = await tx.vehiclePhoto.findFirst({ where: { id: photoId, vehicleId } });
      if (!photo) {
        throw new NotFoundException({
          code: 'vehicle.photo_not_found',
          message: 'Фотография не найдена',
        });
      }

      // Снятие прежнего главного фото обязано идти до установки нового:
      // на таблице частичный уникальный индекс «одно главное на технику».
      await tx.vehiclePhoto.updateMany({
        where: { vehicleId, isPrimary: true },
        data: { isPrimary: false },
      });

      return tx.vehiclePhoto.update({
        where: { id: photoId },
        data: { isPrimary: true },
        select: { id: true, isPrimary: true },
      });
    });
  }

  async removePhoto(officeId: number, vehicleId: number, photoId: number) {
    await this.ensureExists(officeId, vehicleId);

    const photo = await this.prisma.db.vehiclePhoto.findFirst({
      where: { id: photoId, vehicleId },
    });
    if (!photo) {
      throw new NotFoundException({
        code: 'vehicle.photo_not_found',
        message: 'Фотография не найдена',
      });
    }

    const result = await this.prisma.transaction(async (tx) => {
      await tx.vehiclePhoto.delete({ where: { id: photoId } });

      // Если удалили главное — главным становится следующее по свежести,
      // иначе техника осталась бы без картинки при наличии фотографий.
      if (photo.isPrimary) {
        const next = await tx.vehiclePhoto.findFirst({
          where: { vehicleId },
          orderBy: { createdAt: 'desc' },
        });
        if (next) {
          await tx.vehiclePhoto.update({ where: { id: next.id }, data: { isPrimary: true } });
        }
      }

      return { id: photoId };
    });

    // Файл удаляется после фиксации транзакции: откат вернул бы запись в БД,
    // а файл был бы уже стёрт.
    await this.storage.remove(photo.fileKey);
    return result;
  }

  private async ensureDocumentExists(
    officeId: number,
    vehicleId: number,
    documentId: number,
  ): Promise<void> {
    await this.ensureExists(officeId, vehicleId);
    const found = await this.prisma.db.vehicleDocument.findFirst({
      where: { id: documentId, vehicleId, deletedAt: null },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({
        code: 'vehicle.document_not_found',
        message: 'Документ не найден',
      });
    }
  }

  private async ensureExists(officeId: number, id: number): Promise<void> {
    const found = await this.prisma.db.vehicle.findFirst({
      where: { id, officeId, deletedAt: null },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({
        code: 'vehicle.not_found',
        message: 'Единица техники не найдена',
      });
    }
  }

  private daysFromNow(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }
}
