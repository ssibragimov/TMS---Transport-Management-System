import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CheckResult, PermitZone, Prisma } from '@prisma/client';
import {
  CLEARANCE_LABEL,
  clearanceValidUntil,
  evaluateClearance,
  type ExpiryAlertDto,
  type PaginatedResult,
} from '@gsm/shared';

import { paginate } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { TenantStore } from '@/common/tenancy/tenant-context';

import type {
  CreateDriverDto,
  DriverLicenseDto,
  DriverPermitDto,
  DriverQueryDto,
  MedicalCheckDto,
  UpdateDriverDto,
} from './dto/driver.dto';

const SORTABLE = ['lastName', 'personnelNumber', 'hireDate', 'createdAt'] as const;

/** Причина, по которой водитель не может быть выпущен в рейс. */
export interface EligibilityIssue {
  code: string;
  message: string;
  expiredAt?: Date;
  /**
   * Можно ли выдать лист вопреки этому замечанию.
   *
   * Просроченная бумага — вопрос организационный, его закрывает диспетчер
   * под запись в журнале. Отказ врача — вопрос допуска человека к работе,
   * и он не снимается ничьим правом.
   */
  overridable: boolean;
  /** Замечание про медосмотр снимается отдельным правом, а не общим. */
  medical?: boolean;
}

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  async list(officeId: number, query: DriverQueryDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.DriverWhereInput = {
      officeId,
      deletedAt: null,
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.departmentId && { departmentId: query.departmentId }),
      ...(query.search && {
        OR: [
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { personnelNumber: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.driver.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: query.orderBy(SORTABLE, 'lastName'),
        include: {
          department: { select: { id: true, name: true } },
          licenses: {
            where: { deletedAt: null },
            orderBy: { expiresAt: 'desc' },
            take: 1,
          },
          permits: {
            where: { deletedAt: null },
            orderBy: { expiresAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.db.driver.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  async findOne(officeId: number, id: number) {
    const driver = await this.prisma.db.driver.findFirst({
      where: { id, officeId, deletedAt: null },
      include: {
        department: { select: { id: true, name: true } },
        licenses: { where: { deletedAt: null }, orderBy: { expiresAt: 'desc' } },
        permits: { where: { deletedAt: null }, orderBy: { expiresAt: 'desc' } },
        medicalChecks: { orderBy: { checkedAt: 'desc' }, take: 20 },
      },
    });

    if (!driver) {
      throw new NotFoundException({
        code: 'driver.not_found',
        message: 'Водитель не найден',
      });
    }
    return driver;
  }

  /**
   * Табельный номер уникален в пределах офиса среди неудалённых карточек.
   *
   * При правке существующего водителя себя из проверки исключаем: сохранение
   * карточки без изменения номера не должно упираться в собственную запись.
   */
  private async assertPersonnelNumberFree(
    officeId: number,
    personnelNumber: string,
    exceptId?: number,
  ): Promise<void> {
    const duplicate = await this.prisma.db.driver.findFirst({
      where: {
        officeId,
        personnelNumber,
        deletedAt: null,
        ...(exceptId !== undefined && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: 'driver.personnel_number_taken',
        message: `Табельный номер ${personnelNumber} уже используется`,
      });
    }
  }

  async create(officeId: number, dto: CreateDriverDto) {
    await this.assertPersonnelNumberFree(officeId, dto.personnelNumber);

    return this.prisma.db.driver.create({
      data: {
        officeId,
        personnelNumber: dto.personnelNumber,
        lastName: dto.lastName,
        firstName: dto.firstName,
        middleName: dto.middleName ?? null,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        phone: dto.phone ?? null,
        departmentId: dto.departmentId ?? null,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
        notes: dto.notes ?? null,
      },
    });
  }

  async update(officeId: number, id: number, dto: UpdateDriverDto) {
    await this.ensureExists(officeId, id);

    // Табельный номер меняется вместе с остальной карточкой, по праву
    // driver.update: в отделе кадров номера переприсваивают — при переводе
    // между подразделениями, при исправлении опечатки в приказе о приёме.
    // Прежние путевые листы ссылаются на водителя по id, поэтому история
    // от смены номера не рвётся.
    if (dto.personnelNumber !== undefined) {
      await this.assertPersonnelNumberFree(officeId, dto.personnelNumber, id);
    }

    return this.prisma.db.driver.update({
      where: { id },
      data: {
        ...(dto.personnelNumber !== undefined && { personnelNumber: dto.personnelNumber }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.middleName !== undefined && { middleName: dto.middleName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
        ...(dto.birthDate !== undefined && {
          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        }),
        ...(dto.hireDate !== undefined && {
          hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
        }),
        ...(dto.dismissDate !== undefined && {
          dismissDate: dto.dismissDate ? new Date(dto.dismissDate) : null,
          // Увольнение автоматически выводит водителя из активных:
          // иначе он останется в выпадающем списке выдачи путевых листов.
          isActive: dto.dismissDate ? false : undefined,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async remove(officeId: number, id: number) {
    await this.ensureExists(officeId, id);

    const openWaybills = await this.prisma.db.waybill.count({
      where: {
        driverId: id,
        status: { in: ['ISSUED', 'IN_PROGRESS', 'SUBMITTED'] },
        deletedAt: null,
      },
    });
    if (openWaybills > 0) {
      throw new ConflictException({
        code: 'driver.has_open_waybills',
        message: 'У водителя есть незакрытые путевые листы',
      });
    }

    return this.prisma.db.driver.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ─── Права, допуски, медосмотры ──────────────────────────────────────────
  //
  // Все три сущности живут только внутри карточки водителя, поэтому вынесены
  // не в отдельный модуль, а сюда: отдельный ресурс без родителя смысла
  // не имеет, а лишний модуль пришлось бы синхронизировать по правам.

  async addLicense(officeId: number, driverId: number, dto: DriverLicenseDto) {
    await this.ensureExists(officeId, driverId);

    return this.prisma.db.driverLicense.create({
      data: {
        driverId,
        number: dto.number,
        categories: dto.categories,
        issuedAt: new Date(dto.issuedAt),
        expiresAt: new Date(dto.expiresAt),
      },
    });
  }

  async removeLicense(officeId: number, driverId: number, licenseId: number) {
    await this.ensureExists(officeId, driverId);
    await this.ensureChild('driverLicense', driverId, licenseId);

    return this.prisma.db.driverLicense.update({
      where: { id: licenseId },
      data: { deletedAt: new Date() },
    });
  }

  async addPermit(officeId: number, driverId: number, dto: DriverPermitDto) {
    await this.ensureExists(officeId, driverId);

    return this.prisma.db.driverPermit.create({
      data: {
        driverId,
        zone: dto.zone,
        number: dto.number,
        issuedAt: new Date(dto.issuedAt),
        expiresAt: new Date(dto.expiresAt),
      },
    });
  }

  async removePermit(officeId: number, driverId: number, permitId: number) {
    await this.ensureExists(officeId, driverId);
    await this.ensureChild('driverPermit', driverId, permitId);

    return this.prisma.db.driverPermit.update({
      where: { id: permitId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Запись осмотра — предрейсового или периодического.
   *
   * Предрейсовый осмотр здесь перестаёт быть отметкой в журнале и становится
   * допуском к смене: у него есть момент окончания, и именно на него потом
   * ссылается путевой лист. Срок врач может задать сам — ночная смена
   * и разовый выезд по вызову живут по разным правилам.
   */
  async addMedicalCheck(officeId: number, driverId: number, dto: MedicalCheckDto) {
    await this.ensureExists(officeId, driverId);

    const isPreTrip = dto.isPreTrip ?? false;
    const checkedAt = new Date(dto.checkedAt);

    const validUntil = dto.validUntil
      ? new Date(dto.validUntil)
      : isPreTrip
        ? clearanceValidUntil({ result: dto.result, checkedAt })
        : null;

    // Подписывает тот, кто вошёл в систему. Пустым остаётся только у записей,
    // которые заводит фоновая задача или seed.
    const checkedByUserId = TenantStore.get()?.userId ?? null;

    return this.prisma.db.medicalCheck.create({
      data: {
        driverId,
        checkedAt,
        validUntil,
        result: dto.result,
        isPreTrip,
        checkedByUserId,
        doctorName: dto.doctorName ?? null,
        bloodPressure: dto.bloodPressure ?? null,
        temperature: dto.temperature ?? null,
        alcoholPpm: dto.alcoholPpm ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  /**
   * Действующий предрейсовый допуск водителя на заданный момент.
   *
   * Берётся последний по времени осмотр, а не последний действующий:
   * если врач осмотрел повторно и не допустил, прежнее разрешение
   * не должно всплыть и перекрыть отказ.
   */
  async preTripClearance(driverId: number, at: Date = new Date()) {
    const check = await this.prisma.db.medicalCheck.findFirst({
      where: { driverId, isPreTrip: true, checkedAt: { lte: at } },
      orderBy: { checkedAt: 'desc' },
      select: {
        id: true,
        checkedAt: true,
        validUntil: true,
        result: true,
        doctorName: true,
        bloodPressure: true,
        temperature: true,
        alcoholPpm: true,
        notes: true,
        checkedByUser: { select: { id: true, fullName: true } },
      },
    });

    const verdict = evaluateClearance(
      check && { result: check.result, checkedAt: check.checkedAt, validUntil: check.validUntil },
      at,
    );

    return { check, verdict };
  }

  /** Допуск водителя с проверкой, что он из этого офиса. Для интерфейса. */
  async medicalClearanceOf(officeId: number, driverId: number) {
    await this.ensureExists(officeId, driverId);
    const { check, verdict } = await this.preTripClearance(driverId);

    return {
      state: verdict.state,
      allowed: verdict.allowed,
      overridable: verdict.overridable,
      label: CLEARANCE_LABEL[verdict.state],
      validUntil: verdict.validUntil ?? null,
      check,
    };
  }

  /**
   * Очередь здравпункта: водители офиса и состояние их допуска.
   *
   * Возвращаются все активные, а не только неосмотренные: врачу нужно видеть
   * и тех, кого он уже пропустил, — иначе он не отличит «осмотрен» от
   * «ещё не приходил» и будет искать человека по журналу.
   */
  async medicalQueue(officeId: number, search?: string) {
    const drivers = await this.prisma.db.driver.findMany({
      where: {
        officeId,
        deletedAt: null,
        isActive: true,
        ...(search && {
          OR: [
            { lastName: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { personnelNumber: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { lastName: 'asc' },
      select: {
        id: true,
        personnelNumber: true,
        lastName: true,
        firstName: true,
        middleName: true,
        department: { select: { name: true } },
        medicalChecks: {
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

    return drivers.map((driver) => {
      const last = driver.medicalChecks[0] ?? null;
      const verdict = evaluateClearance(
        last && { result: last.result, checkedAt: last.checkedAt, validUntil: last.validUntil },
        now,
      );

      return {
        driverId: driver.id,
        personnelNumber: driver.personnelNumber,
        fullName: `${driver.lastName} ${driver.firstName} ${driver.middleName ?? ''}`.trim(),
        department: driver.department?.name ?? null,
        state: verdict.state,
        allowed: verdict.allowed,
        label: CLEARANCE_LABEL[verdict.state],
        validUntil: verdict.validUntil ?? null,
        lastCheck: last,
      };
    });
  }

  private async ensureChild(
    model: 'driverLicense' | 'driverPermit',
    driverId: number,
    id: number,
  ): Promise<void> {
    const found =
      model === 'driverLicense'
        ? await this.prisma.db.driverLicense.findFirst({
            where: { id, driverId, deletedAt: null },
            select: { id: true },
          })
        : await this.prisma.db.driverPermit.findFirst({
            where: { id, driverId, deletedAt: null },
            select: { id: true },
          });

    if (!found) {
      throw new NotFoundException({
        code: 'driver.clearance_not_found',
        message: 'Документ водителя не найден',
      });
    }
  }

  /**
   * Может ли водитель быть выпущен в рейс на этой технике.
   *
   * Вызывается при выдаче путевого листа. Проверяет то, из-за чего технику
   * реально не выпускают на перрон: просроченные права, допуск и медосмотр.
   */
  async checkEligibility(
    driverId: number,
    options: { requiresAirsidePermit: boolean; onDate?: Date },
  ): Promise<EligibilityIssue[]> {
    const onDate = options.onDate ?? new Date();
    const issues: EligibilityIssue[] = [];

    const driver = await this.prisma.db.driver.findUnique({
      where: { id: driverId },
      include: {
        licenses: { where: { deletedAt: null } },
        permits: { where: { deletedAt: null } },
        medicalChecks: {
          where: { isPreTrip: false },
          orderBy: { checkedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!driver) {
      return [{ code: 'driver.not_found', message: 'Водитель не найден', overridable: false }];
    }

    if (!driver.isActive || driver.deletedAt) {
      issues.push({
        code: 'driver.inactive',
        message: 'Водитель не числится активным',
        overridable: false,
      });
    }

    const validLicense = driver.licenses.find((l) => l.expiresAt >= onDate);
    if (!validLicense) {
      const latest = driver.licenses.sort(
        (a, b) => b.expiresAt.getTime() - a.expiresAt.getTime(),
      )[0];
      issues.push({
        code: 'driver.license_expired',
        message: 'Водительское удостоверение просрочено или отсутствует',
        expiredAt: latest?.expiresAt,
        overridable: true,
      });
    }

    if (options.requiresAirsidePermit) {
      const airsideZones: PermitZone[] = [
        PermitZone.AIRSIDE,
        PermitZone.APRON,
        PermitZone.MANEUVERING_AREA,
        PermitZone.RUNWAY,
      ];
      const validPermit = driver.permits.find(
        (p) => airsideZones.includes(p.zone) && p.expiresAt >= onDate,
      );
      if (!validPermit) {
        issues.push({
          code: 'driver.airside_permit_expired',
          message: 'Нет действующего допуска на контролируемую зону аэродрома',
          overridable: true,
        });
      }
    }

    const medical = driver.medicalChecks[0];
    if (!medical || medical.result === CheckResult.FAILED) {
      issues.push({
        code: 'driver.medical_missing',
        message: 'Отсутствует пройденный периодический медосмотр',
        overridable: true,
      });
    } else if (medical.validUntil && medical.validUntil < onDate) {
      issues.push({
        code: 'driver.medical_expired',
        message: 'Периодический медосмотр просрочен',
        expiredAt: medical.validUntil,
        overridable: true,
      });
    }

    // Предрейсовый допуск — то, ради чего водитель каждую смену идёт
    // в здравпункт. Проверяется последним, потому что показывать его
    // в списке замечаний нужно первым: это самая частая причина отказа.
    const { verdict } = await this.preTripClearance(driverId, onDate);
    if (!verdict.allowed) {
      issues.push({
        code:
          verdict.state === 'FAILED'
            ? 'driver.pretrip_medical_failed'
            : verdict.state === 'EXPIRED'
              ? 'driver.pretrip_medical_expired'
              : 'driver.pretrip_medical_missing',
        message: CLEARANCE_LABEL[verdict.state],
        expiredAt: verdict.state === 'EXPIRED' ? verdict.validUntil : undefined,
        overridable: verdict.overridable,
        medical: true,
      });
    }

    return issues;
  }

  /**
   * Дашборд истекающих сроков — по водителям.
   *
   * Отдельный экран «истекает через N дней» экономит больше денег, чем
   * любой отчёт: недопуск техники на перрон из-за просроченной бумаги
   * останавливает обслуживание рейса.
   */
  async expiringClearances(officeId: number, withinDays = 30): Promise<ExpiryAlertDto[]> {
    const until = new Date();
    until.setDate(until.getDate() + withinDays);
    const now = new Date();

    const drivers = await this.prisma.db.driver.findMany({
      where: { officeId, deletedAt: null, isActive: true },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        personnelNumber: true,
        licenses: {
          where: { deletedAt: null, expiresAt: { lte: until } },
          select: { id: true, number: true, expiresAt: true },
        },
        permits: {
          where: { deletedAt: null, expiresAt: { lte: until } },
          select: { id: true, number: true, zone: true, expiresAt: true },
        },
        medicalChecks: {
          where: { isPreTrip: false, validUntil: { lte: until } },
          orderBy: { checkedAt: 'desc' },
          take: 1,
          select: { id: true, validUntil: true },
        },
      },
    });

    const alerts: ExpiryAlertDto[] = [];

    const push = (
      entityType: ExpiryAlertDto['entityType'],
      entityId: number,
      driver: { id: number; lastName: string; firstName: string; personnelNumber: string },
      documentType: string,
      documentNumber: string | null,
      expiresAt: Date,
    ): void => {
      const daysLeft = Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000);
      alerts.push({
        entityType,
        entityId,
        subjectId: driver.id,
        subjectLabel: `${driver.lastName} ${driver.firstName} (${driver.personnelNumber})`,
        documentType,
        documentNumber,
        expiresAt: expiresAt.toISOString(),
        daysLeft,
        // Просроченное — критично; меньше недели — предупреждение.
        severity: daysLeft < 0 ? 'CRITICAL' : daysLeft <= 7 ? 'WARNING' : 'INFO',
      });
    };

    for (const driver of drivers) {
      for (const license of driver.licenses) {
        push('DRIVER_LICENSE', license.id, driver, 'LICENSE', license.number, license.expiresAt);
      }
      for (const permit of driver.permits) {
        push('DRIVER_PERMIT', permit.id, driver, `PERMIT_${permit.zone}`, permit.number, permit.expiresAt);
      }
      const medical = driver.medicalChecks[0];
      if (medical?.validUntil) {
        push('MEDICAL_CHECK', medical.id, driver, 'MEDICAL', null, medical.validUntil);
      }
    }

    return alerts.sort((a, b) => a.daysLeft - b.daysLeft);
  }

  private async ensureExists(officeId: number, id: number): Promise<void> {
    const found = await this.prisma.db.driver.findFirst({
      where: { id, officeId, deletedAt: null },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({
        code: 'driver.not_found',
        message: 'Водитель не найден',
      });
    }
  }
}
