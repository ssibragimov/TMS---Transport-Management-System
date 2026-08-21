import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isValidRing, ringBounds, type PaginatedResult } from '@gsm/shared';

import { paginate } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';

import type {
  CreateDeviceDto,
  GeofenceDto,
  GeofenceEventQueryDto,
  UpdateDeviceDto,
  UpdateGeofenceDto,
} from './dto/telemetry.dto';

/**
 * Реестр трекеров и геозоны.
 *
 * Оба справочника ведёт один сервис: они наполняются в одном сценарии —
 * «подключаем аэропорт к мониторингу», и их совместная целостность важнее
 * формального деления по сущностям.
 */
@Injectable()
export class GeofencesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Трекеры ──────────────────────────────────────────────────────────────

  async listDevices(officeId: number) {
    return this.prisma.db.gpsDevice.findMany({
      where: { vehicle: { officeId, deletedAt: null } },
      orderBy: [{ isActive: 'desc' }, { imei: 'asc' }],
      select: {
        id: true,
        imei: true,
        provider: true,
        model: true,
        simNumber: true,
        hasFuelSensor: true,
        installedAt: true,
        removedAt: true,
        lastSeenAt: true,
        isActive: true,
        vehicle: { select: { id: true, garageNumber: true, plateNumber: true } },
      },
    });
  }

  async createDevice(officeId: number, dto: CreateDeviceDto) {
    await this.assertVehicleInOffice(officeId, dto.vehicleId);

    // IMEI уникален по всей системе, а не по офису: номер зашит в железо,
    // и один трекер не может стоять в двух аэропортах сразу. Проверяем явно,
    // чтобы отдать понятный ответ вместо нарушения уникального индекса.
    const existing = await this.prisma.db.gpsDevice.findUnique({
      where: { imei: dto.imei },
      select: { id: true, vehicleId: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'device.imei_taken',
        message: `Трекер ${dto.imei} уже закреплён за другой техникой`,
      });
    }

    return this.prisma.db.gpsDevice.create({
      data: {
        imei: dto.imei,
        vehicleId: dto.vehicleId,
        provider: dto.provider ?? null,
        model: dto.model ?? null,
        simNumber: dto.simNumber ?? null,
        installedAt: dto.installedAt ? new Date(dto.installedAt) : new Date(),
      },
    });
  }

  async updateDevice(officeId: number, id: number, dto: UpdateDeviceDto) {
    const device = await this.findDevice(officeId, id);

    if (dto.vehicleId !== undefined && dto.vehicleId !== device.vehicleId) {
      await this.assertVehicleInOffice(officeId, dto.vehicleId);
    }

    return this.prisma.db.gpsDevice.update({
      where: { id },
      data: {
        ...(dto.vehicleId !== undefined && { vehicleId: dto.vehicleId }),
        ...(dto.provider !== undefined && { provider: dto.provider }),
        ...(dto.model !== undefined && { model: dto.model }),
        ...(dto.simNumber !== undefined && { simNumber: dto.simNumber }),
        ...(dto.installedAt !== undefined && { installedAt: new Date(dto.installedAt) }),
        ...(dto.removedAt !== undefined && {
          removedAt: dto.removedAt ? new Date(dto.removedAt) : null,
          // Снятый трекер перестаёт принимать данные: иначе он продолжил бы
          // писать точки на машину, с которой его физически сняли.
          isActive: dto.removedAt ? false : undefined,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async removeDevice(officeId: number, id: number) {
    await this.findDevice(officeId, id);

    // Удаление физическое: трек остаётся, он привязан к машине, а не к трекеру.
    return this.prisma.db.gpsDevice.delete({
      where: { id },
      select: { id: true, imei: true },
    });
  }

  private async findDevice(officeId: number, id: number) {
    const device = await this.prisma.db.gpsDevice.findFirst({
      where: { id, vehicle: { officeId, deletedAt: null } },
      select: { id: true, vehicleId: true },
    });
    if (!device) {
      throw new NotFoundException({ code: 'device.not_found', message: 'Трекер не найден' });
    }
    return device;
  }

  private async assertVehicleInOffice(officeId: number, vehicleId: number): Promise<void> {
    const vehicle = await this.prisma.db.vehicle.findFirst({
      where: { id: vehicleId, officeId, deletedAt: null },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException({ code: 'vehicle.not_found', message: 'Техника не найдена' });
    }
  }

  // ─── Геозоны ──────────────────────────────────────────────────────────────

  async listGeofences(officeId: number) {
    const rows = await this.prisma.db.geofence.findMany({
      where: { officeId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        kind: true,
        area: true,
        speedLimit: true,
        alertOnEntry: true,
        alertOnExit: true,
        color: true,
        isActive: true,
        _count: { select: { events: true } },
      },
    });

    return rows.map((row) => ({
      ...row,
      eventCount: row._count.events,
      _count: undefined,
      // Габариты нужны интерфейсу, чтобы навести карту на зону,
      // не разбирая полигон повторно на клиенте.
      bounds: isValidRing(row.area) ? ringBounds(row.area) : null,
    }));
  }

  async createGeofence(officeId: number, dto: GeofenceDto) {
    this.assertArea(dto.area);

    return this.prisma.db.geofence.create({
      data: {
        officeId,
        name: dto.name,
        kind: dto.kind,
        area: (dto.area ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        speedLimit: dto.speedLimit ?? null,
        alertOnEntry: dto.alertOnEntry ?? false,
        alertOnExit: dto.alertOnExit ?? false,
        color: dto.color ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateGeofence(officeId: number, id: number, dto: UpdateGeofenceDto) {
    await this.findGeofence(officeId, id);
    this.assertArea(dto.area);

    return this.prisma.db.geofence.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.kind !== undefined && { kind: dto.kind }),
        ...(dto.area !== undefined && {
          area: (dto.area ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        }),
        ...(dto.speedLimit !== undefined && { speedLimit: dto.speedLimit }),
        ...(dto.alertOnEntry !== undefined && { alertOnEntry: dto.alertOnEntry }),
        ...(dto.alertOnExit !== undefined && { alertOnExit: dto.alertOnExit }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async removeGeofence(officeId: number, id: number) {
    await this.findGeofence(officeId, id);

    // События удаляются каскадом. Это осознанно: событие «выезд за периметр»
    // без самой зоны нечитаемо — непонятно, что именно пересекли.
    return this.prisma.db.geofence.delete({ where: { id }, select: { id: true, name: true } });
  }

  private async findGeofence(officeId: number, id: number) {
    const fence = await this.prisma.db.geofence.findFirst({
      where: { id, officeId },
      select: { id: true },
    });
    if (!fence) {
      throw new NotFoundException({ code: 'geofence.not_found', message: 'Геозона не найдена' });
    }
    return fence;
  }

  /**
   * Полигон проверяется на входе, а не при разборе точки.
   *
   * Кривая зона молча перестала бы ловить события: разбор пропускает
   * невалидные полигоны, и служба узнала бы об этом, только не дождавшись
   * ни одного оповещения о выезде за периметр.
   */
  private assertArea(area: number[][] | undefined): void {
    if (area === undefined || area === null) return;

    if (!isValidRing(area)) {
      throw new BadRequestException({
        code: 'geofence.invalid_area',
        message: 'Полигон должен содержать минимум три точки вида [долгота, широта]',
      });
    }
  }

  // ─── События ──────────────────────────────────────────────────────────────

  async listEvents(
    officeId: number,
    query: GeofenceEventQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.GeofenceEventWhereInput = {
      officeId,
      ...(query.vehicleId && { vehicleId: query.vehicleId }),
      ...(query.geofenceId && { geofenceId: query.geofenceId }),
      ...(query.eventType && { eventType: query.eventType }),
      ...((query.dateFrom || query.dateTo) && {
        occurredAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.geofenceEvent.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { occurredAt: 'desc' },
        select: {
          id: true,
          eventType: true,
          occurredAt: true,
          latitude: true,
          longitude: true,
          speed: true,
          geofence: { select: { id: true, name: true, kind: true, color: true } },
          vehicle: { select: { id: true, garageNumber: true, plateNumber: true } },
        },
      }),
      this.prisma.db.geofenceEvent.count({ where }),
    ]);

    // bigint из Postgres не сериализуется в JSON.
    const serialised = items.map((item) => ({
      ...item,
      id: String(item.id),
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      speed: item.speed === null ? null : Number(item.speed),
    }));

    return paginate(serialised, total, query);
  }
}
