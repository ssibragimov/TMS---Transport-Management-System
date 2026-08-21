/**
 * Имитатор телеметрии.
 *
 * Зачем он нужен: трекеров пока нет, а раздел разрабатывать надо. Скрипт
 * ставит виртуальные трекеры на демо-технику, обводит геозоны вокруг
 * координат аэропорта и проигрывает смену — с выездами на перрон,
 * возвратами на стоянку и парой превышений скорости.
 *
 * Точки идут через тот же TelemetryService, что и данные от настоящих
 * трекеров: иначе имитатор проверял бы не систему, а сам себя. Поэтому
 * скрипт поднимает контекст приложения Nest, а не ходит в базу напрямую.
 *
 * Запуск: npm run db:seed-telemetry -w @gsm/api
 * Повторный запуск безопасен: трекеры и зоны заводятся один раз,
 * трек дописывается за указанную дату.
 */

import './env';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '@/app.module';
import { TenantStore } from '@/common/tenancy/tenant-context';
import { TelemetryService } from '@/modules/telemetry/telemetry.service';
import type { IngestPointDto } from '@/modules/telemetry/dto/telemetry.dto';

const prisma = new PrismaClient();
const log = new Logger('seed-telemetry');

/** Интервал между точками, секунды. Столько же шлёт типовой трекер на ходу. */
const STEP_SECONDS = 20;

/** Сколько единиц техники оснащаем трекерами в каждом офисе. */
const EQUIPPED_PER_OFFICE = 8;

/** Длительность смены, часы. */
const SHIFT_HOURS = 8;

/**
 * Детерминированный генератор.
 *
 * Тот же, что в seed-demo: повторный запуск должен давать тот же трек,
 * иначе сравнить вчерашний результат с сегодняшним невозможно.
 */
function makeRandom(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Смещение в градусах на заданное число метров. */
function offset(lat: number, lon: number, north: number, east: number): [number, number] {
  const dLat = north / 111_320;
  const dLon = east / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lon + dLon];
}

/** Прямоугольная зона вокруг точки: полукруг по широте и долготе, метры. */
function box(lat: number, lon: number, halfNorth: number, halfEast: number): number[][] {
  const [north, east] = offset(lat, lon, halfNorth, halfEast);
  const [south, west] = offset(lat, lon, -halfNorth, -halfEast);
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];
}

interface OfficePlan {
  id: number;
  code: string;
  lat: number;
  lon: number;
}

async function ensureGeofences(office: OfficePlan): Promise<void> {
  const { id: officeId, lat, lon } = office;

  // Размеры взяты от координаты аэропорта: точной схемы перрона у нас нет,
  // а для проверки логики важны не метры, а взаимное расположение зон.
  const plan = [
    {
      name: 'Перрон',
      kind: 'APRON',
      area: box(lat, lon, 400, 700),
      speedLimit: 30,
      alertOnEntry: false,
      alertOnExit: false,
      color: '#1677ff',
    },
    {
      name: 'Стоянка спецтехники',
      kind: 'PARKING',
      area: box(lat - 0.006, lon - 0.008, 150, 200),
      speedLimit: 10,
      alertOnEntry: false,
      alertOnExit: false,
      color: '#52c41a',
    },
    {
      name: 'Периметр аэропорта',
      kind: 'PERIMETER',
      area: box(lat, lon, 1800, 2600),
      speedLimit: null as number | null,
      // Выезд за периметр — единственное, о чём здесь стоит оповещать сразу:
      // спецтехника с допуском на перрон вне аэродрома оказаться не должна.
      alertOnEntry: false,
      alertOnExit: true,
      color: '#fa541c',
    },
  ];

  for (const fence of plan) {
    const existing = await prisma.geofence.findFirst({
      where: { officeId, name: fence.name },
      select: { id: true },
    });

    if (existing) {
      await prisma.geofence.update({ where: { id: existing.id }, data: fence });
    } else {
      await prisma.geofence.create({ data: { officeId, ...fence } });
    }
  }
}

/**
 * Трекеры, с которых пойдут точки.
 *
 * Сначала берутся уже заведённые демо-данными: у них своя нумерация IMEI,
 * и заводить рядом второй трекер на ту же машину нельзя — на это стоит
 * частичный уникальный индекс gps_device_active_uq. Недостающие добавляются.
 */
async function ensureDevices(office: OfficePlan): Promise<Array<{ imei: string; vehicleId: number }>> {
  const existing = await prisma.gpsDevice.findMany({
    where: {
      isActive: true,
      removedAt: null,
      vehicle: { officeId: office.id, deletedAt: null, status: 'ACTIVE' },
    },
    orderBy: { vehicleId: 'asc' },
    take: EQUIPPED_PER_OFFICE,
    select: { imei: true, vehicleId: true },
  });

  const devices = [...existing];
  if (devices.length >= EQUIPPED_PER_OFFICE) return devices;

  const equipped = new Set(devices.map((d) => d.vehicleId));
  const bare = await prisma.vehicle.findMany({
    where: {
      officeId: office.id,
      deletedAt: null,
      status: 'ACTIVE',
      id: { notIn: [...equipped] },
      gpsDevices: { none: { removedAt: null } },
    },
    orderBy: { garageNumber: 'asc' },
    take: EQUIPPED_PER_OFFICE - devices.length,
    select: { id: true },
  });

  for (const vehicle of bare) {
    // IMEI выводится из идентификатора машины: он должен быть одним и тем же
    // при каждом запуске, иначе повторный прогон заводил бы новые трекеры.
    const imei = `86${String(office.id).padStart(3, '0')}${String(vehicle.id).padStart(9, '0')}`;

    await prisma.gpsDevice.create({
      data: {
        imei,
        vehicleId: vehicle.id,
        provider: 'Имитатор',
        model: 'VIRTUAL-1',
        installedAt: new Date(),
      },
    });

    devices.push({ imei, vehicleId: vehicle.id });
  }

  return devices;
}

/**
 * Трек одной машины за смену.
 *
 * Машина стоит на стоянке, выезжает к борту, работает у самолёта, возвращается.
 * Раз в несколько кругов один рейс уходит за периметр — это тот случай,
 * ради которого и заводится оповещение о выезде.
 */
function buildTrack(
  office: OfficePlan,
  imei: string,
  shiftStart: Date,
  seed: string,
): IngestPointDto[] {
  const random = makeRandom(seed);
  const points: IngestPointDto[] = [];

  const parking = offset(office.lat - 0.006, office.lon - 0.008, 0, 0);
  const totalSteps = (SHIFT_HOURS * 3600) / STEP_SECONDS;

  let [lat, lon] = parking;
  let odometer = 1000 + Math.floor(random() * 40_000);
  let engineHours = 500 + Math.floor(random() * 4000);

  let target: [number, number] = parking;
  let holdSteps = 0;
  let trips = 0;

  for (let step = 0; step < totalSteps; step++) {
    const ts = new Date(shiftStart.getTime() + step * STEP_SECONDS * 1000);

    if (holdSteps > 0) {
      holdSteps -= 1;
      // Стоянка у борта: двигатель работает, машина не едет.
      points.push({
        imei,
        ts: ts.toISOString(),
        lat: Number(lat.toFixed(7)),
        lon: Number(lon.toFixed(7)),
        speed: 0,
        heading: 0,
        satellites: 9 + Math.floor(random() * 4),
        ignition: true,
        odometer: Number(odometer.toFixed(1)),
        engineHours: Number((engineHours += STEP_SECONDS / 3600).toFixed(1)),
      });
      continue;
    }

    const distance = Math.hypot(target[0] - lat, target[1] - lon);

    if (distance < 0.00012) {
      // Цель достигнута — выбираем следующую.
      holdSteps = 6 + Math.floor(random() * 20);
      trips += 1;

      const atParking = Math.abs(lat - parking[0]) < 0.0005 && Math.abs(lon - parking[1]) < 0.0005;
      if (atParking) {
        // Каждый пятый рейс — за периметр: проверяем оповещение о выезде.
        target =
          trips % 5 === 0
            ? offset(office.lat, office.lon, 2600, 3400)
            : offset(office.lat, office.lon, (random() - 0.5) * 600, (random() - 0.5) * 1100);
      } else {
        target = parking;
      }
      continue;
    }

    // Шаг по направлению к цели. Скорость держим в разумных пределах:
    // на перроне это 15–25 км/ч, за периметром машина разгоняется.
    const insideApron =
      Math.abs(lat - office.lat) < 0.004 && Math.abs(lon - office.lon) < 0.008;
    const baseSpeed = insideApron ? 15 + random() * 10 : 40 + random() * 25;

    // Раз в несколько рейсов водитель нарушает ограничение на перроне.
    const speeding = insideApron && trips > 0 && trips % 7 === 0 && random() > 0.7;
    const speed = speeding ? 38 + random() * 8 : baseSpeed;

    const metersPerStep = (speed * 1000 * STEP_SECONDS) / 3600;
    const ratio = Math.min(1, metersPerStep / (distance * 111_320));

    lat += (target[0] - lat) * ratio;
    lon += (target[1] - lon) * ratio;
    odometer += metersPerStep / 1000;
    engineHours += STEP_SECONDS / 3600;

    const heading =
      (Math.round((Math.atan2(target[1] - lon, target[0] - lat) * 180) / Math.PI) + 360) % 360;

    points.push({
      imei,
      ts: ts.toISOString(),
      lat: Number(lat.toFixed(7)),
      lon: Number(lon.toFixed(7)),
      speed: Number(speed.toFixed(1)),
      heading,
      satellites: 8 + Math.floor(random() * 5),
      ignition: true,
      odometer: Number(odometer.toFixed(1)),
      engineHours: Number(engineHours.toFixed(1)),
    });
  }

  return points;
}

async function main(): Promise<void> {
  const dateArg = process.argv.find((a) => a.startsWith('--date='))?.split('=')[1];
  const day = dateArg ? new Date(dateArg) : new Date();
  if (Number.isNaN(day.getTime())) {
    throw new Error(`Некорректная дата: ${dateArg}. Ожидается --date=2026-08-17`);
  }

  const shiftStart = new Date(day);
  shiftStart.setHours(8, 0, 0, 0);

  const offices = await prisma.office.findMany({
    where: { kind: 'AIRPORT', deletedAt: null, latitude: { not: null } },
    select: { id: true, code: true, latitude: true, longitude: true },
    orderBy: { code: 'asc' },
  });

  if (offices.length === 0) {
    log.warn('Аэропортов с координатами не найдено — сначала выполните db:seed');
    return;
  }

  // Контекст приложения, а не HTTP-сервер: нужен только сервис телеметрии.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const telemetry = app.get(TelemetryService);

  try {
    for (const row of offices) {
      const office: OfficePlan = {
        id: row.id,
        code: row.code,
        lat: Number(row.latitude),
        lon: Number(row.longitude),
      };

      await ensureGeofences(office);
      const devices = await ensureDevices(office);

      if (devices.length === 0) {
        log.warn(`${office.code}: техники не найдено, пропускаю`);
        continue;
      }

      let accepted = 0;
      let events = 0;

      for (const device of devices) {
        const points = buildTrack(office, device.imei, shiftStart, `${office.code}:${device.imei}`);

        // Пачками по 500: ровно так же данные придут от настоящего шлюза,
        // и потолок размера пакета проверяется заодно.
        for (let i = 0; i < points.length; i += 500) {
          const batch = points.slice(i, i + 500);
          const result = await TenantStore.runAsOffice(office.id, () =>
            telemetry.ingest({ points: batch }),
          );
          accepted += result.accepted;
          events += result.events;
        }
      }

      log.log(
        `${office.code}: трекеров ${devices.length}, точек ${accepted}, событий геозон ${events}`,
      );
    }
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
