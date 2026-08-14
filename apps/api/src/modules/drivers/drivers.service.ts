import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CheckResult, PermitZone, Prisma } from '@prisma/client';
import type { ExpiryAlertDto, PaginatedResult } from '@gsm/shared';

import { paginate } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';

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

  async create(officeId: number, dto: CreateDriverDto) {
    const duplicate = await this.prisma.db.driver.findFirst({
      where: { officeId, personnelNumber: dto.personnelNumber, deletedAt: null },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: 'driver.personnel_number_taken',
        message: `Табельный номер ${dto.personnelNumber} уже используется`,
      });
    }

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

    return this.prisma.db.driver.update({
      where: { id },
      data: {
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

  async addMedicalCheck(officeId: number, driverId: number, dto: MedicalCheckDto) {
    await this.ensureExists(officeId, driverId);

    // Предрейсовый осмотр действует одну смену, срок ему не задаётся.
    const isPreTrip = dto.isPreTrip ?? false;

    return this.prisma.db.medicalCheck.create({
      data: {
        driverId,
        checkedAt: new Date(dto.checkedAt),
        validUntil: !isPreTrip && dto.validUntil ? new Date(dto.validUntil) : null,
        result: dto.result,
        isPreTrip,
        doctorName: dto.doctorName ?? null,
        bloodPressure: dto.bloodPressure ?? null,
        temperature: dto.temperature ?? null,
        alcoholPpm: dto.alcoholPpm ?? null,
        notes: dto.notes ?? null,
      },
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
      return [{ code: 'driver.not_found', message: 'Водитель не найден' }];
    }

    if (!driver.isActive || driver.deletedAt) {
      issues.push({ code: 'driver.inactive', message: 'Водитель не числится активным' });
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
        });
      }
    }

    const medical = driver.medicalChecks[0];
    if (!medical || medical.result === CheckResult.FAILED) {
      issues.push({
        code: 'driver.medical_missing',
        message: 'Отсутствует пройденный периодический медосмотр',
      });
    } else if (medical.validUntil && medical.validUntil < onDate) {
      issues.push({
        code: 'driver.medical_expired',
        message: 'Периодический медосмотр просрочен',
        expiredAt: medical.validUntil,
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
