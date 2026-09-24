import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@/common/prisma/prisma.service';

import type {
  CounterpartyDto,
  DepartmentDto,
  DistrictDto,
  DriverPositionDto,
  FuelTypeDto,
  RegionDto,
  SparePartDto,
  TaskLocationDto,
  UpdateCounterpartyDto,
  UpdateDepartmentDto,
  UpdateDistrictDto,
  UpdateDriverPositionDto,
  UpdateFuelTypeDto,
  UpdateRegionDto,
  UpdateSparePartDto,
  UpdateTaskLocationDto,
  UpdateVehicleModelDto,
  UpdateViolationTypeDto,
  VehicleModelDto,
  ViolationTypeDto,
} from './dto/dictionary.dto';

/**
 * Справочники платформы.
 *
 * Разделены на два класса, и это принципиально:
 *
 *  • Общестрановые — виды топлива, модели техники, номенклатура запчастей.
 *    Они одни на все аэропорты, RLS на них не действует. Иначе сравнить
 *    расход одинаковых тягачей в Ташкенте и Бухаре было бы нечем: у каждого
 *    завелась бы своя «COBUS 3000», и отчёты перестали бы сходиться.
 *
 *  • Офисные — подразделения и контрагенты. У каждого аэропорта свои,
 *    изолируются политиками RLS как обычные прикладные данные.
 *
 * Удаление везде мягкое либо запрещено при наличии ссылок: справочник,
 * из которого можно выдернуть строку, ломает документы за прошлые периоды.
 */
@Injectable()
export class DictionariesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Виды топлива (общие) ────────────────────────────────────────────────

  fuelTypes(includeInactive = false) {
    return this.prisma.db.fuelType.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        density: true,
        isActive: true,
        _count: { select: { vehicles: true, tanks: true } },
      },
    });
  }

  async createFuelType(dto: FuelTypeDto) {
    const existing = await this.prisma.db.fuelType.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException({
        code: 'dictionary.code_taken',
        message: `Вид топлива с кодом ${dto.code} уже существует`,
      });
    }

    return this.prisma.db.fuelType.create({
      data: {
        code: dto.code,
        name: dto.name,
        density: dto.density ?? 0.75,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateFuelType(id: number, dto: UpdateFuelTypeDto) {
    await this.ensure('fuelType', id);

    return this.prisma.db.fuelType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.density !== undefined && { density: dto.density }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        // Код не меняется: на него ссылаются интеграции и выгрузки.
      },
    });
  }

  async removeFuelType(id: number) {
    const used = await this.prisma.db.fuelType.findUnique({
      where: { id },
      select: { _count: { select: { vehicles: true, tanks: true, receipts: true, issues: true } } },
    });
    if (!used) {
      throw new NotFoundException({ code: 'dictionary.not_found', message: 'Запись не найдена' });
    }

    const total =
      used._count.vehicles + used._count.tanks + used._count.receipts + used._count.issues;
    if (total > 0) {
      // Не удаляем, а отключаем: документы прошлых периодов ссылаются на вид
      // топлива, и физическое удаление сделало бы их нечитаемыми.
      return this.prisma.db.fuelType.update({
        where: { id },
        data: { isActive: false },
      });
    }

    return this.prisma.db.fuelType.delete({ where: { id } });
  }

  // ─── Регионы и районы (общие) — раскладка REGION_DISTRICT ───────────────

  regions(includeInactive = false) {
    return this.prisma.db.region.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        districts: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: { name: 'asc' },
        },
      },
    });
  }

  async createRegion(dto: RegionDto) {
    const existing = await this.prisma.db.region.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException({
        code: 'dictionary.code_taken',
        message: `Регион с кодом ${dto.code} уже существует`,
      });
    }

    return this.prisma.db.region.create({
      data: { code: dto.code, name: dto.name, isActive: dto.isActive ?? true },
    });
  }

  async updateRegion(id: number, dto: UpdateRegionDto) {
    await this.ensure('region', id);

    return this.prisma.db.region.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  /**
   * Отключение, а не удаление: район мог уже попасть текстом в задания
   * путевых листов (там это просто строка, без внешнего ключа), и физическое
   * удаление ничего бы в них не подчистило — только скрыло бы источник.
   */
  async removeRegion(id: number) {
    await this.ensure('region', id);
    return this.prisma.db.region.update({ where: { id }, data: { isActive: false } });
  }

  districts(regionId?: number, includeInactive = false) {
    return this.prisma.db.district.findMany({
      where: {
        ...(regionId !== undefined && { regionId }),
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { name: 'asc' },
      select: { id: true, regionId: true, code: true, name: true, isActive: true },
    });
  }

  async createDistrict(dto: DistrictDto) {
    const region = await this.prisma.db.region.findUnique({ where: { id: dto.regionId } });
    if (!region) {
      throw new NotFoundException({ code: 'dictionary.not_found', message: 'Регион не найден' });
    }

    const existing = await this.prisma.db.district.findFirst({
      where: { regionId: dto.regionId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException({
        code: 'dictionary.code_taken',
        message: `Район с кодом ${dto.code} уже есть в этом регионе`,
      });
    }

    return this.prisma.db.district.create({
      data: {
        regionId: dto.regionId,
        code: dto.code,
        name: dto.name,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateDistrict(id: number, dto: UpdateDistrictDto) {
    await this.ensure('district', id);

    return this.prisma.db.district.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async removeDistrict(id: number) {
    await this.ensure('district', id);
    return this.prisma.db.district.update({ where: { id }, data: { isActive: false } });
  }

  // ─── Модели техники (общие) ──────────────────────────────────────────────

  vehicleModels(params: { category?: string; includeInactive?: boolean } = {}) {
    return this.prisma.db.vehicleModel.findMany({
      where: {
        ...(params.includeInactive ? {} : { isActive: true }),
        ...(params.category && { category: params.category as never }),
      },
      orderBy: [{ manufacturer: 'asc' }, { model: 'asc' }],
      select: {
        id: true,
        category: true,
        manufacturer: true,
        model: true,
        meterType: true,
        tankCapacity: true,
        fuelTypeId: true,
        grossWeight: true,
        seats: true,
        isActive: true,
        createdAt: true,
        _count: { select: { vehicles: true } },
      },
    });
  }

  async createVehicleModel(dto: VehicleModelDto) {
    const existing = await this.prisma.db.vehicleModel.findUnique({
      where: {
        manufacturer_model: { manufacturer: dto.manufacturer, model: dto.model },
      },
    });
    if (existing) {
      throw new ConflictException({
        code: 'dictionary.model_taken',
        message: `Модель ${dto.manufacturer} ${dto.model} уже есть в справочнике`,
      });
    }

    return this.prisma.db.vehicleModel.create({
      data: {
        category: dto.category,
        manufacturer: dto.manufacturer,
        model: dto.model,
        meterType: dto.meterType ?? 'ODOMETER',
        fuelTypeId: dto.fuelTypeId ?? null,
        tankCapacity: dto.tankCapacity ?? null,
        grossWeight: dto.grossWeight ?? null,
        seats: dto.seats ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateVehicleModel(id: number, dto: UpdateVehicleModelDto) {
    await this.ensure('vehicleModel', id);

    return this.prisma.db.vehicleModel.update({
      where: { id },
      data: {
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.manufacturer !== undefined && { manufacturer: dto.manufacturer }),
        ...(dto.model !== undefined && { model: dto.model }),
        ...(dto.meterType !== undefined && { meterType: dto.meterType }),
        ...(dto.fuelTypeId !== undefined && { fuelTypeId: dto.fuelTypeId }),
        ...(dto.tankCapacity !== undefined && { tankCapacity: dto.tankCapacity }),
        ...(dto.grossWeight !== undefined && { grossWeight: dto.grossWeight }),
        ...(dto.seats !== undefined && { seats: dto.seats }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async removeVehicleModel(id: number) {
    const model = await this.prisma.db.vehicleModel.findUnique({
      where: { id },
      select: { _count: { select: { vehicles: true, norms: true } } },
    });
    if (!model) {
      throw new NotFoundException({ code: 'dictionary.not_found', message: 'Запись не найдена' });
    }

    if (model._count.vehicles > 0 || model._count.norms > 0) {
      return this.prisma.db.vehicleModel.update({ where: { id }, data: { isActive: false } });
    }
    return this.prisma.db.vehicleModel.delete({ where: { id } });
  }

  // ─── Подразделения (офисные) ─────────────────────────────────────────────

  departments(officeId: number, includeInactive = false) {
    return this.prisma.db.department.findMany({
      where: {
        officeId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        _count: { select: { vehicles: true, drivers: true } },
      },
    });
  }

  async createDepartment(officeId: number, dto: DepartmentDto) {
    const existing = await this.prisma.db.department.findFirst({
      where: { officeId, code: dto.code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException({
        code: 'dictionary.code_taken',
        message: `Подразделение с кодом ${dto.code} уже есть в этом офисе`,
      });
    }

    return this.prisma.db.department.create({
      data: { officeId, code: dto.code, name: dto.name, isActive: dto.isActive ?? true },
    });
  }

  async updateDepartment(officeId: number, id: number, dto: UpdateDepartmentDto) {
    await this.ensureOfficeScoped('department', officeId, id);

    return this.prisma.db.department.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async removeDepartment(officeId: number, id: number) {
    await this.ensureOfficeScoped('department', officeId, id);

    return this.prisma.db.department.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ─── Должности водителей (офисные, через подразделение) ─────────────────
  //
  // У DriverPosition нет собственного office_id — принадлежность офису
  // проверяется через департамент, поэтому здесь свой, а не общий
  // ensureOfficeScoped метод.

  driverPositions(officeId: number, departmentId?: number, includeInactive = false) {
    return this.prisma.db.driverPosition.findMany({
      where: {
        department: { officeId },
        deletedAt: null,
        ...(departmentId && { departmentId }),
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ departmentId: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        departmentId: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        _count: { select: { drivers: true } },
      },
    });
  }

  async createDriverPosition(officeId: number, dto: DriverPositionDto) {
    await this.ensureDepartmentInOffice(officeId, dto.departmentId);

    const existing = await this.prisma.db.driverPosition.findFirst({
      where: { departmentId: dto.departmentId, code: dto.code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException({
        code: 'dictionary.code_taken',
        message: `Должность с кодом ${dto.code} уже есть в этом подразделении`,
      });
    }

    return this.prisma.db.driverPosition.create({
      data: {
        departmentId: dto.departmentId,
        code: dto.code,
        name: dto.name,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateDriverPosition(officeId: number, id: number, dto: UpdateDriverPositionDto) {
    await this.ensureDriverPositionInOffice(officeId, id);

    return this.prisma.db.driverPosition.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async removeDriverPosition(officeId: number, id: number) {
    await this.ensureDriverPositionInOffice(officeId, id);

    return this.prisma.db.driverPosition.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ─── Виды нарушений (офисные) — служба безопасности дорог ───────────────

  violationTypes(officeId: number, includeInactive = false) {
    return this.prisma.db.violationType.findMany({
      where: {
        officeId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        defaultFineAmount: true,
        isActive: true,
        createdAt: true,
        _count: { select: { violations: true } },
      },
    });
  }

  async createViolationType(officeId: number, dto: ViolationTypeDto) {
    const existing = await this.prisma.db.violationType.findFirst({
      where: { officeId, code: dto.code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException({
        code: 'dictionary.code_taken',
        message: `Вид нарушения с кодом ${dto.code} уже есть в этом офисе`,
      });
    }

    return this.prisma.db.violationType.create({
      data: {
        officeId,
        code: dto.code,
        name: dto.name,
        defaultFineAmount: dto.defaultFineAmount ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateViolationType(officeId: number, id: number, dto: UpdateViolationTypeDto) {
    await this.ensureOfficeScoped('violationType', officeId, id);

    return this.prisma.db.violationType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.defaultFineAmount !== undefined && { defaultFineAmount: dto.defaultFineAmount }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async removeViolationType(officeId: number, id: number) {
    await this.ensureOfficeScoped('violationType', officeId, id);

    return this.prisma.db.violationType.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ─── Локации заданий (офисные) — универсальная раскладка путевого листа ──

  taskLocations(officeId: number, includeInactive = false) {
    return this.prisma.db.taskLocation.findMany({
      where: {
        officeId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, isActive: true, createdAt: true },
    });
  }

  async createTaskLocation(officeId: number, dto: TaskLocationDto) {
    const existing = await this.prisma.db.taskLocation.findFirst({
      where: { officeId, code: dto.code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException({
        code: 'dictionary.code_taken',
        message: `Локация с кодом ${dto.code} уже есть в этом офисе`,
      });
    }

    return this.prisma.db.taskLocation.create({
      data: {
        officeId,
        code: dto.code,
        name: dto.name,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateTaskLocation(officeId: number, id: number, dto: UpdateTaskLocationDto) {
    await this.ensureOfficeScoped('taskLocation', officeId, id);

    return this.prisma.db.taskLocation.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async removeTaskLocation(officeId: number, id: number) {
    await this.ensureOfficeScoped('taskLocation', officeId, id);

    return this.prisma.db.taskLocation.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ─── Контрагенты (офисные) ───────────────────────────────────────────────

  counterparties(officeId: number, kind?: 'fuel' | 'service', includeInactive = false) {
    return this.prisma.db.counterparty.findMany({
      where: {
        officeId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
        ...(kind === 'fuel' && { isFuelSupplier: true }),
        ...(kind === 'service' && { isServiceProvider: true }),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        inn: true,
        isFuelSupplier: true,
        isServiceProvider: true,
        contactPhone: true,
        address: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  createCounterparty(officeId: number, dto: CounterpartyDto) {
    return this.prisma.db.counterparty.create({
      data: {
        officeId,
        name: dto.name,
        inn: dto.inn ?? null,
        isFuelSupplier: dto.isFuelSupplier ?? false,
        isServiceProvider: dto.isServiceProvider ?? false,
        contactPhone: dto.contactPhone ?? null,
        address: dto.address ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateCounterparty(officeId: number, id: number, dto: UpdateCounterpartyDto) {
    await this.ensureOfficeScoped('counterparty', officeId, id);

    return this.prisma.db.counterparty.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.inn !== undefined && { inn: dto.inn }),
        ...(dto.isFuelSupplier !== undefined && { isFuelSupplier: dto.isFuelSupplier }),
        ...(dto.isServiceProvider !== undefined && { isServiceProvider: dto.isServiceProvider }),
        ...(dto.contactPhone !== undefined && { contactPhone: dto.contactPhone }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async removeCounterparty(officeId: number, id: number) {
    await this.ensureOfficeScoped('counterparty', officeId, id);

    return this.prisma.db.counterparty.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ─── Запчасти (общие) ────────────────────────────────────────────────────

  spareParts(includeInactive = false) {
    return this.prisma.db.sparePart.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        catalogNumber: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async createSparePart(dto: SparePartDto) {
    const existing = await this.prisma.db.sparePart.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException({
        code: 'dictionary.code_taken',
        message: `Запчасть с кодом ${dto.code} уже существует`,
      });
    }

    return this.prisma.db.sparePart.create({
      data: {
        code: dto.code,
        name: dto.name,
        unit: dto.unit ?? 'шт',
        catalogNumber: dto.catalogNumber ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateSparePart(id: number, dto: UpdateSparePartDto) {
    await this.ensure('sparePart', id);

    return this.prisma.db.sparePart.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.unit !== undefined && { unit: dto.unit }),
        ...(dto.catalogNumber !== undefined && { catalogNumber: dto.catalogNumber }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async removeSparePart(id: number) {
    await this.ensure('sparePart', id);
    return this.prisma.db.sparePart.update({ where: { id }, data: { isActive: false } });
  }

  /** Всё сразу — один запрос вместо восьми при открытии формы. */
  async all(officeId: number) {
    const [
      fuelTypes,
      vehicleModels,
      departments,
      driverPositions,
      counterparties,
      violationTypes,
      taskLocations,
      regions,
    ] = await Promise.all([
      this.fuelTypes(),
      this.vehicleModels(),
      this.departments(officeId),
      this.driverPositions(officeId),
      this.counterparties(officeId),
      this.violationTypes(officeId),
      this.taskLocations(officeId),
      this.regions(),
    ]);
    return {
      fuelTypes,
      vehicleModels,
      departments,
      driverPositions,
      counterparties,
      violationTypes,
      taskLocations,
      regions,
    };
  }

  // ─── Внутреннее ──────────────────────────────────────────────────────────

  private async ensure(
    model: 'fuelType' | 'vehicleModel' | 'sparePart' | 'region' | 'district',
    id: number,
  ): Promise<void> {
    const delegate = this.prisma.db[model] as {
      findUnique: (args: { where: { id: number } }) => Promise<unknown>;
    };
    const found = await delegate.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException({ code: 'dictionary.not_found', message: 'Запись не найдена' });
    }
  }

  /**
   * Проверка принадлежности офису выполняется явно, хотя RLS и так закроет
   * чужую строку: осмысленное «не найдено» лучше, чем немой отказ в записи.
   */
  private async ensureOfficeScoped(
    model: 'department' | 'counterparty' | 'violationType' | 'taskLocation',
    officeId: number,
    id: number,
  ): Promise<void> {
    const found =
      model === 'department'
        ? await this.prisma.db.department.findFirst({
            where: { id, officeId, deletedAt: null },
            select: { id: true },
          })
        : model === 'counterparty'
          ? await this.prisma.db.counterparty.findFirst({
              where: { id, officeId, deletedAt: null },
              select: { id: true },
            })
          : model === 'violationType'
            ? await this.prisma.db.violationType.findFirst({
                where: { id, officeId, deletedAt: null },
                select: { id: true },
              })
            : await this.prisma.db.taskLocation.findFirst({
                where: { id, officeId, deletedAt: null },
                select: { id: true },
              });

    if (!found) {
      throw new NotFoundException({ code: 'dictionary.not_found', message: 'Запись не найдена' });
    }
  }

  private async ensureDepartmentInOffice(officeId: number, departmentId: number): Promise<void> {
    const found = await this.prisma.db.department.findFirst({
      where: { id: departmentId, officeId, deletedAt: null },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({
        code: 'dictionary.not_found',
        message: 'Подразделение не найдено',
      });
    }
  }

  private async ensureDriverPositionInOffice(officeId: number, id: number): Promise<void> {
    const found = await this.prisma.db.driverPosition.findFirst({
      where: { id, deletedAt: null, department: { officeId } },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({ code: 'dictionary.not_found', message: 'Запись не найдена' });
    }
  }
}
