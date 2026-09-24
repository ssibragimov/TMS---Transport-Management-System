import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { extname } from 'node:path';
import type { Readable } from 'node:stream';
import type { PaginatedResult } from '@gsm/shared';

import { type CsvColumn, toCsv } from '@/common/csv/csv';
import { paginate } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { TenantStore } from '@/common/tenancy/tenant-context';

import type { ViolationDto, ViolationQueryDto } from './dto/violation.dto';

const SORTABLE = ['occurredAt', 'createdAt', 'fineAmount'] as const;

const INCLUDE = {
  driver: {
    select: { id: true, lastName: true, firstName: true, middleName: true, personnelNumber: true },
  },
  vehicle: { select: { id: true, garageNumber: true, plateNumber: true } },
  type: { select: { id: true, code: true, name: true } },
  issuedByUser: { select: { id: true, fullName: true } },
} satisfies Prisma.ViolationInclude;

type ViolationWithRelations = Prisma.ViolationGetPayload<{ include: typeof INCLUDE }>;

/**
 * Включает офис водителя — нужен только для печатной формы (шапка бланка).
 * Отдельно от INCLUDE: список и выгрузка в Excel этого поля не показывают,
 * и гонять его в каждой строке журнала незачем.
 */
const PRINT_INCLUDE = {
  ...INCLUDE,
  driver: {
    select: {
      id: true,
      lastName: true,
      firstName: true,
      middleName: true,
      personnelNumber: true,
      office: {
        select: { nameRu: true, nameUz: true, nameEn: true, code: true, address: true, phone: true },
      },
    },
  },
} satisfies Prisma.ViolationInclude;

/** Строка выгрузки — то же, что показывает список, плюс развёрнутое ФИО. */
interface ViolationCsvRow {
  occurredAt: string;
  driver: string;
  personnelNumber: string;
  vehicle: string;
  type: string;
  fineAmount: number | null;
  issuedBy: string;
  description: string;
}

const VIOLATION_CSV_COLUMNS: CsvColumn<ViolationCsvRow>[] = [
  { key: 'occurredAt', title: 'Дата и время' },
  { key: 'driver', title: 'Водитель' },
  { key: 'personnelNumber', title: 'Табельный номер' },
  { key: 'vehicle', title: 'Техника' },
  { key: 'type', title: 'Вид нарушения' },
  { key: 'fineAmount', title: 'Сумма штрафа' },
  { key: 'issuedBy', title: 'Оформил' },
  { key: 'description', title: 'Описание' },
];

/** DD.MM.YYYY HH:mm — тот же формат, что и в интерфейсе. */
function formatDateTime(value: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(value.getDate())}.${pad(value.getMonth() + 1)}.${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/**
 * Нарушения, зафиксированные службой безопасности дорог аэропорта.
 *
 * Простой журнал: создать и удалить (при ошибке оформления), без правки
 * и без статусной модели — см. комментарий у модели Violation в schema.prisma.
 * Область видимости — офис, к которому принадлежит водитель: у Violation
 * нет собственного office_id, поэтому проверки идут через driverId, как
 * и у медосмотров.
 */
@Injectable()
export class ViolationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(officeId: number, query: ViolationQueryDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.ViolationWhereInput = {
      deletedAt: null,
      driver: { officeId },
      ...(query.driverId && { driverId: query.driverId }),
      ...(query.vehicleId && { vehicleId: query.vehicleId }),
      ...((query.dateFrom || query.dateTo) && {
        occurredAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.violation.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: query.orderBy(SORTABLE, 'createdAt'),
        include: INCLUDE,
      }),
      this.prisma.db.violation.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  async findOne(officeId: number, id: number) {
    const violation = await this.prisma.db.violation.findFirst({
      where: { id, deletedAt: null, driver: { officeId } },
      include: PRINT_INCLUDE,
    });
    if (!violation) {
      throw new NotFoundException({
        code: 'violation.not_found',
        message: 'Нарушение не найдено',
      });
    }
    return violation;
  }

  /**
   * Выгрузка журнала в Excel (CSV) — те же фильтры, что и у списка.
   * Лимит без пагинации: журнал нарушений одного офиса не растёт
   * настолько, чтобы страница Excel не справилась.
   */
  async exportList(officeId: number, query: ViolationQueryDto): Promise<string> {
    const where: Prisma.ViolationWhereInput = {
      deletedAt: null,
      driver: { officeId },
      ...(query.driverId && { driverId: query.driverId }),
      ...(query.vehicleId && { vehicleId: query.vehicleId }),
      ...((query.dateFrom || query.dateTo) && {
        occurredAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
    };

    const items = await this.prisma.db.violation.findMany({
      where,
      take: 5000,
      orderBy: query.orderBy(SORTABLE, 'createdAt'),
      include: INCLUDE,
    });

    return toCsv(items.map((item) => this.toCsvRow(item)), VIOLATION_CSV_COLUMNS);
  }

  /** Выгрузка одного нарушения в Excel (CSV) — та же строка, что и в журнале. */
  async exportOne(officeId: number, id: number): Promise<string> {
    const violation = await this.findOne(officeId, id);
    return toCsv([this.toCsvRow(violation)], VIOLATION_CSV_COLUMNS);
  }

  private toCsvRow(violation: ViolationWithRelations): ViolationCsvRow {
    return {
      occurredAt: formatDateTime(violation.occurredAt),
      driver:
        `${violation.driver.lastName} ${violation.driver.firstName} ${violation.driver.middleName ?? ''}`.trim(),
      personnelNumber: violation.driver.personnelNumber,
      vehicle: violation.vehicle
        ? `${violation.vehicle.garageNumber}${violation.vehicle.plateNumber ? ` (${violation.vehicle.plateNumber})` : ''}`
        : '',
      type: violation.type.name,
      fineAmount: violation.fineAmount ? Number(violation.fineAmount) : null,
      issuedBy: violation.issuedByUser?.fullName ?? '',
      description: violation.description ?? '',
    };
  }

  async create(officeId: number, dto: ViolationDto) {
    await this.ensureDriverInOffice(officeId, dto.driverId);
    if (dto.vehicleId !== undefined) {
      await this.ensureVehicleInOffice(officeId, dto.vehicleId);
    }
    await this.ensureTypeInOffice(officeId, dto.typeId);

    // Подписывает тот, кто вошёл в систему — так же, как медосмотр.
    const issuedByUserId = TenantStore.get()?.userId ?? null;

    return this.prisma.db.violation.create({
      data: {
        driverId: dto.driverId,
        vehicleId: dto.vehicleId ?? null,
        typeId: dto.typeId,
        occurredAt: new Date(dto.occurredAt),
        fineAmount: dto.fineAmount ?? null,
        description: dto.description ?? null,
        issuedByUserId,
      },
      include: INCLUDE,
    });
  }

  async remove(officeId: number, id: number): Promise<void> {
    const violation = await this.ensureExists(officeId, id);

    await this.prisma.db.violation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    if (violation.photoKey) {
      await this.storage.remove(violation.photoKey);
    }
  }

  // ─── Фото/вложение с места нарушения ─────────────────────────────────────

  private static readonly PHOTO_MIME = new Map<string, string>([
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.png', 'image/png'],
    ['.webp', 'image/webp'],
    ['.heic', 'image/heic'],
  ]);

  private photoMimeTypeFromKey(key: string): string {
    const ext = extname(key).toLowerCase();
    return ViolationsService.PHOTO_MIME.get(ext) ?? 'image/jpeg';
  }

  async setPhoto(
    officeId: number,
    id: number,
    file: Express.Multer.File,
  ): Promise<{ photoKey: string }> {
    const violation = await this.ensureExists(officeId, id);

    const stored = await this.storage.saveImage(`violations/${id}`, file);

    await this.prisma.db.violation.update({
      where: { id },
      data: { photoKey: stored.key },
    });

    if (violation.photoKey) {
      await this.storage.remove(violation.photoKey);
    }

    return { photoKey: stored.key };
  }

  async readPhoto(officeId: number, id: number): Promise<{ stream: Readable; mimeType: string }> {
    const violation = await this.ensureExists(officeId, id);

    if (!violation.photoKey) {
      throw new NotFoundException({
        code: 'violation.photo_not_found',
        message: 'У нарушения нет фото',
      });
    }

    const { stream } = this.storage.createReadStream(violation.photoKey);
    return { stream, mimeType: this.photoMimeTypeFromKey(violation.photoKey) };
  }

  async removePhoto(officeId: number, id: number): Promise<void> {
    const violation = await this.ensureExists(officeId, id);
    if (!violation.photoKey) return;

    await this.prisma.db.violation.update({
      where: { id },
      data: { photoKey: null },
    });

    await this.storage.remove(violation.photoKey);
  }

  // ─── Внутреннее ──────────────────────────────────────────────────────────

  private async ensureExists(
    officeId: number,
    id: number,
  ): Promise<{ id: number; photoKey: string | null }> {
    const found = await this.prisma.db.violation.findFirst({
      where: { id, deletedAt: null, driver: { officeId } },
      select: { id: true, photoKey: true },
    });
    if (!found) {
      throw new NotFoundException({
        code: 'violation.not_found',
        message: 'Нарушение не найдено',
      });
    }
    return found;
  }

  private async ensureDriverInOffice(officeId: number, driverId: number): Promise<void> {
    const found = await this.prisma.db.driver.findFirst({
      where: { id: driverId, officeId, deletedAt: null },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({ code: 'driver.not_found', message: 'Водитель не найден' });
    }
  }

  private async ensureVehicleInOffice(officeId: number, vehicleId: number): Promise<void> {
    const found = await this.prisma.db.vehicle.findFirst({
      where: { id: vehicleId, officeId, deletedAt: null },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({ code: 'vehicle.not_found', message: 'Техника не найдена' });
    }
  }

  private async ensureTypeInOffice(officeId: number, typeId: number): Promise<void> {
    const found = await this.prisma.db.violationType.findFirst({
      where: { id: typeId, officeId, deletedAt: null },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({
        code: 'dictionary.not_found',
        message: 'Вид нарушения не найден',
      });
    }
  }
}
