import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AlertSeverity, AlertType, Prisma } from '@prisma/client';
import {
  type LngLat,
  type Ring,
  isInsideStable,
  isValidRing,
  pointInRing,
  trackLengthKm,
} from '@gsm/shared';

import { PrismaService } from '@/common/prisma/prisma.service';

import type { IngestDto, IngestPointDto, TrackQueryDto } from './dto/telemetry.dto';

/**
 * Через сколько минут молчания техника считается вне связи.
 *
 * Трекер шлёт точку раз в 10–30 секунд на ходу и раз в несколько минут
 * на стоянке. Десять минут — порог, за которым молчание перестаёт быть
 * нормальным поведением и означает либо потерю питания, либо глушилку,
 * либо разряженный аккумулятор.
 */
const OFFLINE_AFTER_MINUTES = 10;

/** Ниже этой скорости считаем, что техника стоит: приёмник шумит и на месте. */
const MOVING_SPEED_KMH = 3;

export type VehicleActivity = 'MOVING' | 'IDLE' | 'PARKED' | 'OFFLINE' | 'NO_DATA';

interface GeofenceRow {
  id: number;
  officeId: number;
  name: string;
  ring: Ring;
  speedLimit: number | null;
  alertOnEntry: boolean;
  alertOnExit: boolean;
}

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Приём пачки точек от трекеров.
   *
   * Пачка обрабатывается целиком, но точка с неизвестным IMEI или сбитой
   * датой не роняет остальные: трекер шлёт накопленное за офлайн одним
   * пакетом, и отказ всей пачки из-за одной строки потерял бы смену целиком.
   * Отклонённые возвращаются с причиной — иначе потеря данных остаётся немой.
   */
  async ingest(dto: IngestDto) {
    const rejected: Array<{ imei: string; reason: string }> = [];

    const imeis = [...new Set(dto.points.map((p) => p.imei))];
    const devices = await this.prisma.db.gpsDevice.findMany({
      where: { imei: { in: imeis }, isActive: true, removedAt: null },
      select: { id: true, imei: true, vehicleId: true, vehicle: { select: { officeId: true } } },
    });
    const byImei = new Map(devices.map((d) => [d.imei, d]));

    // Точки группируются по машине: событиями геозон и последним положением
    // занимаемся один раз на машину, а не на каждую точку.
    const byVehicle = new Map<number, { deviceId: number; officeId: number; points: IngestPointDto[] }>();

    for (const point of dto.points) {
      const device = byImei.get(point.imei);
      if (!device) {
        rejected.push({ imei: point.imei, reason: 'Трекер не зарегистрирован или снят' });
        continue;
      }

      const ts = new Date(point.ts);
      if (Number.isNaN(ts.getTime())) {
        rejected.push({ imei: point.imei, reason: 'Некорректная отметка времени' });
        continue;
      }

      const bucket = byVehicle.get(device.vehicleId) ?? {
        deviceId: device.id,
        officeId: device.vehicle.officeId,
        points: [],
      };
      bucket.points.push(point);
      byVehicle.set(device.vehicleId, bucket);
    }

    let accepted = 0;
    let events = 0;

    for (const [vehicleId, bucket] of byVehicle) {
      // Порядок точек в пакете от трекера не гарантирован, а разбор
      // пересечений границ имеет смысл только по возрастанию времени.
      bucket.points.sort((a, b) => a.ts.localeCompare(b.ts));

      const written = await this.storePoints(vehicleId, bucket.deviceId, bucket.points);
      accepted += written;

      events += await this.detectEvents(vehicleId, bucket.officeId, bucket.points);
    }

    if (rejected.length > 0) {
      this.logger.warn(`Телеметрия: отклонено точек ${rejected.length} из ${dto.points.length}`);
    }

    return { accepted, rejected, events };
  }

  /** Запись трека и обновление последнего положения. */
  private async storePoints(
    vehicleId: number,
    deviceId: number,
    points: IngestPointDto[],
  ): Promise<number> {
    const rows = points.map((p) => ({
      vehicleId,
      deviceId,
      ts: new Date(p.ts),
      latitude: new Prisma.Decimal(p.lat),
      longitude: new Prisma.Decimal(p.lon),
      altitude: p.altitude ?? null,
      speed: p.speed === undefined ? null : new Prisma.Decimal(p.speed),
      heading: p.heading ?? null,
      satellites: p.satellites ?? null,
      ignition: p.ignition ?? null,
      engineHours: p.engineHours === undefined ? null : new Prisma.Decimal(p.engineHours),
      odometer: p.odometer === undefined ? null : new Prisma.Decimal(p.odometer),
    }));

    // skipDuplicates: трекер переотправляет неподтверждённые точки после
    // обрыва связи, и без этого одна и та же секунда попала бы в трек дважды.
    await this.prisma.db.telemetryPosition.createMany({ data: rows, skipDuplicates: true });

    const last = rows[rows.length - 1];
    const previous = await this.prisma.db.telemetryLastPosition.findUnique({
      where: { vehicleId },
      select: { ts: true },
    });

    // Пакет с накопленным офлайном может прийти позже свежей точки,
    // полученной по другому каналу. Назад последнее положение не отматываем.
    if (!previous || previous.ts <= last.ts) {
      const snapshot = {
        deviceId,
        ts: last.ts,
        latitude: last.latitude,
        longitude: last.longitude,
        speed: last.speed,
        heading: last.heading,
        ignition: last.ignition,
        odometer: last.odometer,
        engineHours: last.engineHours,
      };

      await this.prisma.db.telemetryLastPosition.upsert({
        where: { vehicleId },
        create: { vehicleId, ...snapshot },
        update: snapshot,
      });
    }

    await this.prisma.db.gpsDevice.update({
      where: { id: deviceId },
      data: { lastSeenAt: last.ts },
    });

    return rows.length;
  }

  /**
   * Разбор пересечений геозон и превышений скорости.
   *
   * Состояние «был внутри» берётся из предыдущей точки этой же пачки, а для
   * первой — из положения, записанного до неё. Отдельной таблицы состояний
   * нет намеренно: она рассинхронизировалась бы с треком при любом сбое,
   * а восстанавливать её пришлось бы всё равно по точкам.
   */
  private async detectEvents(
    vehicleId: number,
    officeId: number,
    points: IngestPointDto[],
  ): Promise<number> {
    const fences = await this.loadGeofences(officeId);
    if (fences.length === 0) return 0;

    const previous = await this.previousPoint(vehicleId, points[0].ts);

    const eventRows: Prisma.GeofenceEventCreateManyInput[] = [];
    const alerts: Prisma.AlertCreateManyInput[] = [];

    for (const fence of fences) {
      let wasInside: boolean | null =
        previous === null ? null : pointInRing(previous, fence.ring);

      for (const point of points) {
        const at: LngLat = [point.lon, point.lat];
        const inside = isInsideStable(at, fence.ring, wasInside);

        if (wasInside !== null && inside !== wasInside) {
          const eventType = inside ? 'ENTRY' : 'EXIT';
          eventRows.push({
            officeId,
            geofenceId: fence.id,
            vehicleId,
            eventType,
            occurredAt: new Date(point.ts),
            latitude: new Prisma.Decimal(point.lat),
            longitude: new Prisma.Decimal(point.lon),
            speed: point.speed === undefined ? null : new Prisma.Decimal(point.speed),
          });

          if ((inside && fence.alertOnEntry) || (!inside && fence.alertOnExit)) {
            alerts.push(
              this.alert(officeId, vehicleId, point, {
                type: inside ? AlertType.GEOFENCE_ENTRY : AlertType.GEOFENCE_EXIT,
                severity: AlertSeverity.WARNING,
                title: `${inside ? 'Въезд в зону' : 'Выезд из зоны'}: ${fence.name}`,
                message:
                  `Техника ${inside ? 'вошла в' : 'покинула'} геозону «${fence.name}» ` +
                  `в ${new Date(point.ts).toLocaleString('ru-RU')}.`,
                dedupeKey: `fence:${fence.id}:${vehicleId}:${eventType}:${point.ts}`,
              }),
            );
          }
        }

        if (
          inside &&
          fence.speedLimit !== null &&
          point.speed !== undefined &&
          point.speed > fence.speedLimit
        ) {
          alerts.push(
            this.alert(officeId, vehicleId, point, {
              type: AlertType.SPEEDING,
              severity: AlertSeverity.CRITICAL,
              title: `Превышение скорости в зоне «${fence.name}»`,
              message:
                `${point.speed} км/ч при ограничении ${fence.speedLimit} км/ч ` +
                `в геозоне «${fence.name}».`,
              // Один алерт на машину, зону и час: на перроне превышение длится
              // десятки секунд, и каждая точка порождала бы отдельную запись.
              dedupeKey: `speed:${fence.id}:${vehicleId}:${point.ts.slice(0, 13)}`,
            }),
          );
        }

        wasInside = inside;
      }
    }

    if (eventRows.length > 0) {
      await this.prisma.db.geofenceEvent.createMany({ data: eventRows });
    }
    if (alerts.length > 0) {
      // skipDuplicates опирается на уникальный dedupe_key: повтор того же
      // события в переотправленной пачке не должен плодить записи.
      await this.prisma.db.alert.createMany({ data: alerts, skipDuplicates: true });
    }

    return eventRows.length;
  }

  private alert(
    officeId: number,
    vehicleId: number,
    point: IngestPointDto,
    fields: {
      type: AlertType;
      severity: AlertSeverity;
      title: string;
      message: string;
      dedupeKey: string;
    },
  ): Prisma.AlertCreateManyInput {
    return {
      officeId,
      vehicleId,
      occurredAt: new Date(point.ts),
      payload: { latitude: point.lat, longitude: point.lon, speed: point.speed ?? null },
      ...fields,
    };
  }

  /** Положение непосредственно перед пачкой — точка отсчёта для пересечений. */
  private async previousPoint(vehicleId: number, beforeTs: string): Promise<LngLat | null> {
    const row = await this.prisma.db.telemetryPosition.findFirst({
      where: { vehicleId, ts: { lt: new Date(beforeTs) } },
      orderBy: { ts: 'desc' },
      select: { latitude: true, longitude: true },
    });

    return row === null ? null : [Number(row.longitude), Number(row.latitude)];
  }

  private async loadGeofences(officeId: number): Promise<GeofenceRow[]> {
    const rows = await this.prisma.db.geofence.findMany({
      where: { officeId, isActive: true },
      select: {
        id: true,
        officeId: true,
        name: true,
        area: true,
        speedLimit: true,
        alertOnEntry: true,
        alertOnExit: true,
      },
    });

    // Зона без полигона существует легально: её завели, но ещё не обвели
    // на карте. Разбирать по ней нечего — молча пропускаем.
    return rows.flatMap((row) =>
      isValidRing(row.area) ? [{ ...row, ring: row.area }] : [],
    );
  }

  /**
   * Живая карта: последнее положение всей техники офиса.
   *
   * Возвращаются и машины без данных — иначе из списка молча пропадала бы
   * техника со снятым или сломанным трекером, а это ровно тот случай,
   * который надо заметить.
   */
  async live(officeId: number) {
    const vehicles = await this.prisma.db.vehicle.findMany({
      where: { officeId, deletedAt: null, status: { not: 'DECOMMISSIONED' } },
      select: {
        id: true,
        garageNumber: true,
        plateNumber: true,
        category: true,
        status: true,
        department: { select: { name: true } },
        lastPosition: true,
        gpsDevices: {
          where: { isActive: true, removedAt: null },
          select: { id: true, imei: true, lastSeenAt: true },
          take: 1,
        },
      },
      orderBy: { garageNumber: 'asc' },
    });

    const now = Date.now();

    return vehicles.map((vehicle) => {
      const position = vehicle.lastPosition;
      const device = vehicle.gpsDevices[0] ?? null;

      return {
        vehicleId: vehicle.id,
        garageNumber: vehicle.garageNumber,
        plateNumber: vehicle.plateNumber,
        category: vehicle.category,
        status: vehicle.status,
        department: vehicle.department?.name ?? null,
        hasDevice: device !== null,
        imei: device?.imei ?? null,
        position:
          position === null
            ? null
            : {
                ts: position.ts,
                latitude: Number(position.latitude),
                longitude: Number(position.longitude),
                speed: position.speed === null ? null : Number(position.speed),
                heading: position.heading,
                ignition: position.ignition,
              },
        activity: this.activityOf(position, now),
      };
    });
  }

  private activityOf(
    position: { ts: Date; speed: Prisma.Decimal | null; ignition: boolean | null } | null,
    now: number,
  ): VehicleActivity {
    if (position === null) return 'NO_DATA';

    const silentMinutes = (now - position.ts.getTime()) / 60_000;
    if (silentMinutes > OFFLINE_AFTER_MINUTES) return 'OFFLINE';

    const speed = position.speed === null ? 0 : Number(position.speed);
    if (speed > MOVING_SPEED_KMH) return 'MOVING';

    // Заведённый двигатель на месте — это работающий GPU или деайсер,
    // а не простой. Для расхода топлива разница принципиальная.
    return position.ignition === true ? 'IDLE' : 'PARKED';
  }

  /** Трек одной машины за период. */
  async track(officeId: number, vehicleId: number, query: TrackQueryDto) {
    const vehicle = await this.prisma.db.vehicle.findFirst({
      where: { id: vehicleId, officeId, deletedAt: null },
      select: { id: true, garageNumber: true },
    });
    if (!vehicle) {
      throw new NotFoundException({ code: 'vehicle.not_found', message: 'Техника не найдена' });
    }

    const from = new Date(query.from);
    const to = new Date(query.to);

    const rows = await this.prisma.db.telemetryPosition.findMany({
      where: { vehicleId, ts: { gte: from, lte: to } },
      orderBy: { ts: 'asc' },
      // Потолок на выборку: смена деайсера в пик — это десятки тысяч точек,
      // и отдавать их браузеру целиком бессмысленно.
      take: query.limit,
      select: {
        ts: true,
        latitude: true,
        longitude: true,
        speed: true,
        heading: true,
        ignition: true,
        odometer: true,
        engineHours: true,
      },
    });

    const points = rows.map((row) => ({
      ts: row.ts,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      speed: row.speed === null ? null : Number(row.speed),
      heading: row.heading,
      ignition: row.ignition,
    }));

    const coordinates: LngLat[] = points.map((p) => [p.longitude, p.latitude]);
    const speeds = points.map((p) => p.speed ?? 0);

    return {
      vehicle,
      from,
      to,
      points,
      // Пробег по треку — то самое число, которое сверяется с путевым листом.
      distanceKm: Number(trackLengthKm(coordinates).toFixed(2)),
      maxSpeed: speeds.length === 0 ? null : Math.max(...speeds),
      truncated: rows.length === query.limit,
    };
  }
}
