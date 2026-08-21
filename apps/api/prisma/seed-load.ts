/**
 * Нагрузочные данные для проверки скорости работы.
 *
 * Заполняет базу объёмом, близким к реальной эксплуатации крупного аэропорта:
 * тысячи водителей, десятки тысяч путевых листов за месяц и столько же
 * предрейсовых осмотров. Нужно, чтобы увидеть поведение запросов и рост базы
 * до того, как это обнаружится в эксплуатации.
 *
 * Данные пишутся напрямую в базу пакетами, а не через API: тридцать тысяч
 * HTTP-запросов заняли бы часы и мерили бы скорость сети, а не хранилища.
 * Поэтому здесь нет проверок предметной области — они уже проверены
 * отдельно и на объём не влияют.
 *
 * Всё созданное помечено, чтобы его можно было убрать одной командой:
 *   водители  — табельный номер начинается с LT-
 *   листы     — примечание содержит [LOADTEST]
 *
 * Запуск:  npm run db:seed:load -w @gsm/api
 *          npm run db:seed:load -w @gsm/api -- --days=30 --per-day=1000 --drivers=2000
 * Удаление: npm run db:seed:load -w @gsm/api -- --purge
 */

import './env';

import {
  CheckResult,
  MeterSource,
  PrismaClient,
  VehicleCategory,
  VehicleCondition,
  VehicleStatus,
  WaybillStatus,
  WaybillType,
} from '@prisma/client';

const prisma = new PrismaClient();

const MARKER = '[LOADTEST]';
const DRIVER_PREFIX = 'LT-';

/** Размер пакета вставки. Больше — быстрее, но растёт объём одного запроса. */
const BATCH = 2000;

interface Options {
  officeCode: string;
  days: number;
  perDay: number;
  drivers: number;
  vehicles: number;
  purge: boolean;
}

function parseArgs(): Options {
  const arg = (name: string, fallback: number): number => {
    const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
    const value = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  };

  return {
    officeCode:
      process.argv.find((a) => a.startsWith('--office='))?.split('=')[1]?.toUpperCase() ?? 'TAS',
    days: arg('days', 30),
    // Две смены по 500 листов — сутки аэропорта.
    perDay: arg('per-day', 1000),
    drivers: arg('drivers', 2000),
    // Техники нужно не меньше, чем листов в одной смене: одна машина
    // не может работать по двум листам одновременно.
    vehicles: arg('vehicles', 600),
    purge: process.argv.includes('--purge'),
  };
}

/** Детерминированный генератор: повторный прогон даёт тот же набор. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260818);
const randInt = (min: number, max: number): number =>
  min + Math.floor(random() * (max - min + 1));
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];

/** Вставка пакетами с выводом хода работы. */
async function insertMany<T>(
  label: string,
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    await insert(rows.slice(i, i + BATCH));
  }
  process.stdout.write(`  ${label}: ${rows.length.toLocaleString('ru-RU')}\n`);
}

async function purge(officeId: number): Promise<void> {
  console.log('Удаление нагрузочных данных…');

  const waybills = await prisma.waybill.findMany({
    where: { officeId, notes: { contains: MARKER } },
    select: { id: true },
  });
  const waybillIds = waybills.map((w) => w.id);
  console.log(`  путевых листов к удалению: ${waybillIds.length.toLocaleString('ru-RU')}`);

  const drivers = await prisma.driver.findMany({
    where: { officeId, personnelNumber: { startsWith: DRIVER_PREFIX } },
    select: { id: true },
  });
  const driverIds = drivers.map((d) => d.id);

  const vehicles = await prisma.vehicle.findMany({
    where: { officeId, inventoryNumber: { startsWith: DRIVER_PREFIX } },
    select: { id: true },
  });
  const vehicleIds = vehicles.map((v) => v.id);

  // Порядок важен: акты и показания держат листы ссылками,
  // а заключения врача и механика — наоборот, ссылаются на листы.
  for (let i = 0; i < waybillIds.length; i += BATCH) {
    const chunk = waybillIds.slice(i, i + BATCH);
    await prisma.vehicleConditionAct.deleteMany({ where: { waybillId: { in: chunk } } });
    await prisma.vehicleMeterReading.deleteMany({ where: { waybillId: { in: chunk } } });
    await prisma.waybillTask.deleteMany({ where: { waybillId: { in: chunk } } });
    await prisma.waybill.deleteMany({ where: { id: { in: chunk } } });
  }

  for (let i = 0; i < driverIds.length; i += BATCH) {
    const chunk = driverIds.slice(i, i + BATCH);
    await prisma.medicalCheck.deleteMany({ where: { driverId: { in: chunk } } });
  }
  for (let i = 0; i < vehicleIds.length; i += BATCH) {
    const chunk = vehicleIds.slice(i, i + BATCH);
    await prisma.technicalInspection.deleteMany({ where: { vehicleId: { in: chunk } } });
  }

  await prisma.driver.deleteMany({ where: { id: { in: driverIds } } });
  await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });

  console.log(`  водителей удалено: ${driverIds.length.toLocaleString('ru-RU')}`);
  console.log(`  техники удалено: ${vehicleIds.length.toLocaleString('ru-RU')}`);
}

async function main(): Promise<void> {
  const options = parseArgs();
  const started = Date.now();

  const office = await prisma.office.findUnique({
    where: { code: options.officeCode },
    select: { id: true, code: true, nameRu: true },
  });
  if (!office) throw new Error(`Офис ${options.officeCode} не найден`);

  if (options.purge) {
    await purge(office.id);
    console.log(`\nГотово за ${((Date.now() - started) / 1000).toFixed(1)} с`);
    return;
  }

  console.log(`Нагрузочные данные для офиса ${office.code} — ${office.nameRu}`);
  console.log(
    `  план: водителей ${options.drivers}, техники ${options.vehicles}, ` +
      `листов ${(options.days * options.perDay).toLocaleString('ru-RU')} за ${options.days} сут.\n`,
  );

  // ─── Справочные ссылки ────────────────────────────────────────────────────
  const [departments, models, fuelTypes, medic, mechanic, dispatcher] = await Promise.all([
    prisma.department.findMany({ where: { officeId: office.id }, select: { id: true } }),
    prisma.vehicleModel.findMany({ select: { id: true, meterType: true } }),
    prisma.fuelType.findMany({ select: { id: true } }),
    prisma.user.findFirst({ where: { email: { startsWith: 'medic.' } }, select: { id: true } }),
    prisma.user.findFirst({ where: { email: { startsWith: 'mechanic.' } }, select: { id: true } }),
    prisma.user.findFirst({ where: { email: { startsWith: 'dispatcher.' } }, select: { id: true } }),
  ]);

  if (models.length === 0 || fuelTypes.length === 0) {
    throw new Error('Не найдены модели техники или виды топлива — выполните db:seed');
  }
  const departmentIds = departments.map((d) => d.id);

  // ─── Водители ─────────────────────────────────────────────────────────────
  const existingDrivers = await prisma.driver.count({
    where: { officeId: office.id, personnelNumber: { startsWith: DRIVER_PREFIX } },
  });

  if (existingDrivers < options.drivers) {
    const surnames = ['Абдуллаев', 'Каримов', 'Юсупов', 'Рахимов', 'Тошматов', 'Эргашев', 'Назаров', 'Холматов'];
    const names = ['Азиз', 'Бекзод', 'Дилшод', 'Жасур', 'Ислом', 'Камол', 'Отабек', 'Санжар'];

    const rows = Array.from({ length: options.drivers - existingDrivers }, (_, i) => {
      const n = existingDrivers + i + 1;
      return {
        officeId: office.id,
        departmentId: departmentIds.length ? pick(departmentIds) : null,
        personnelNumber: `${DRIVER_PREFIX}${String(n).padStart(5, '0')}`,
        lastName: pick(surnames),
        firstName: pick(names),
        middleName: `${pick(names)}ович`,
        phone: `+9989${randInt(10, 99)}${randInt(1000000, 9999999)}`,
        hireDate: new Date(Date.now() - randInt(200, 3000) * 86400_000),
        isActive: true,
      };
    });

    await insertMany('водители', rows, (chunk) =>
      prisma.driver.createMany({ data: chunk, skipDuplicates: true }),
    );
  } else {
    console.log(`  водители: уже есть ${existingDrivers}`);
  }

  // ─── Техника ──────────────────────────────────────────────────────────────
  const existingVehicles = await prisma.vehicle.count({
    where: { officeId: office.id, inventoryNumber: { startsWith: DRIVER_PREFIX } },
  });

  if (existingVehicles < options.vehicles) {
    const categories = Object.values(VehicleCategory);
    const rows = Array.from({ length: options.vehicles - existingVehicles }, (_, i) => {
      const n = existingVehicles + i + 1;
      const model = pick(models);
      return {
        officeId: office.id,
        departmentId: departmentIds.length ? pick(departmentIds) : null,
        modelId: model.id,
        fuelTypeId: pick(fuelTypes).id,
        garageNumber: `L-${String(n).padStart(4, '0')}`,
        inventoryNumber: `${DRIVER_PREFIX}${String(n).padStart(6, '0')}`,
        plateNumber: `01L${String(n).padStart(3, '0')}LT`,
        category: pick(categories),
        status: VehicleStatus.ACTIVE,
        meterType: model.meterType,
        currentOdometer: randInt(1000, 200000),
        currentEngineHours: randInt(100, 12000),
        currentFuelLevel: randInt(20, 200),
        manufactureYear: randInt(2005, 2024),
      };
    });

    await insertMany('техника', rows, (chunk) =>
      prisma.vehicle.createMany({ data: chunk, skipDuplicates: true }),
    );
  } else {
    console.log(`  техника: уже есть ${existingVehicles}`);
  }

  const driverIds = (
    await prisma.driver.findMany({
      where: { officeId: office.id, personnelNumber: { startsWith: DRIVER_PREFIX } },
      select: { id: true },
    })
  ).map((d) => d.id);

  const vehicleIds = (
    await prisma.vehicle.findMany({
      where: { officeId: office.id, inventoryNumber: { startsWith: DRIVER_PREFIX } },
      select: { id: true },
    })
  ).map((v) => v.id);

  // ─── Нумерация ────────────────────────────────────────────────────────────
  // Продолжаем с текущего значения последовательности, чтобы номера
  // не столкнулись с уже выданными, и возвращаем её на место в конце.
  const year = new Date().getFullYear();
  const sequence = await prisma.documentSequence.findFirst({
    where: { officeId: office.id, kind: 'WAYBILL', year },
    select: { id: true, lastValue: true },
  });
  let nextNumber = (sequence?.lastValue ?? 0) + 1;

  // ─── Смены ────────────────────────────────────────────────────────────────
  const perShift = Math.ceil(options.perDay / 2);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalWaybills = 0;
  let totalChecks = 0;
  let totalTasks = 0;

  for (let dayOffset = options.days - 1; dayOffset >= 0; dayOffset--) {
    const day = new Date(today.getTime() - dayOffset * 86400_000);
    const isToday = dayOffset === 0;

    for (const shift of [0, 1]) {
      const shiftStart = new Date(day.getTime() + (shift === 0 ? 8 : 20) * 3600_000);
      const shiftEnd = new Date(shiftStart.getTime() + 12 * 3600_000);
      // Осмотр проходят за час до смены — так это и происходит.
      const checkedAt = new Date(shiftStart.getTime() - 3600_000);

      // Водители и техника выбираются со сдвигом по смене: один и тот же
      // человек не выходит в обе смены подряд, а техника чередуется.
      const offset = (dayOffset * 2 + shift) * perShift;

      const medicalRows = [];
      const technicalRows = [];
      for (let i = 0; i < perShift; i++) {
        const driverId = driverIds[(offset + i) % driverIds.length];
        const vehicleId = vehicleIds[(offset + i) % vehicleIds.length];

        // Полтора процента недопусков — примерно столько и бывает.
        const failed = random() < 0.015;

        medicalRows.push({
          driverId,
          checkedAt,
          validUntil: new Date(checkedAt.getTime() + 13 * 3600_000),
          result: failed ? CheckResult.FAILED : CheckResult.PASSED,
          isPreTrip: true,
          checkedByUserId: medic?.id ?? null,
          bloodPressure: `${randInt(110, 140)}/${randInt(70, 90)}`,
          temperature: 36 + random(),
          alcoholPpm: 0,
        });

        technicalRows.push({
          vehicleId,
          checkedAt,
          validUntil: new Date(checkedAt.getTime() + 13 * 3600_000),
          result: random() < 0.01 ? CheckResult.FAILED : CheckResult.PASSED,
          isPreTrip: true,
          checkedByUserId: mechanic?.id ?? null,
          checklist: { brakes: true, steering: true, tyres: true, lights: true, beacon: true, leaks: true, body: true },
          odometer: randInt(1000, 200000),
        });
      }

      await prisma.medicalCheck.createMany({ data: medicalRows });
      await prisma.technicalInspection.createMany({ data: technicalRows });
      totalChecks += medicalRows.length * 2;

      const medicalIds = (
        await prisma.medicalCheck.findMany({
          where: { checkedAt, isPreTrip: true },
          select: { id: true },
          orderBy: { id: 'asc' },
        })
      ).map((m) => m.id);
      const technicalIds = (
        await prisma.technicalInspection.findMany({
          where: { checkedAt, isPreTrip: true },
          select: { id: true },
          orderBy: { id: 'asc' },
        })
      ).map((x) => x.id);

      const waybillRows = [];
      for (let i = 0; i < perShift; i++) {
        const odometerStart = randInt(1000, 200000);
        const distance = randInt(20, 180);
        const norm = distance * 0.35 + randInt(2, 12);
        const consumed = norm * (0.9 + random() * 0.3);

        /*
         * Баланс бака сводится по тождеству путевого листа:
         * остаток = было + выдано − израсходовано. Ограничение
         * waybills_closed_complete не пропускает закрытый лист без остатка,
         * и это правильно: закрытый лист без расчёта бесполезен.
         */
        const fuelOpening = randInt(40, 150);
        const fuelIssued = Math.max(0, Math.ceil(consumed - fuelOpening + randInt(10, 60)));
        const fuelClosing = fuelOpening + fuelIssued - consumed;

        waybillRows.push({
          officeId: office.id,
          number: `PL-${office.code}-${year}-${String(nextNumber++).padStart(6, '0')}`,
          type: WaybillType.SHIFT,
          // Свежая смена ещё в работе, прошлые закрыты — так выглядит
          // журнал в любой рабочий день.
          status: isToday ? WaybillStatus.ISSUED : WaybillStatus.CLOSED,
          vehicleId: vehicleIds[(offset + i) % vehicleIds.length],
          driverId: driverIds[(offset + i) % driverIds.length],
          validFrom: shiftStart,
          validTo: shiftEnd,
          odometerStart,
          odometerEnd: isToday ? null : odometerStart + distance,
          distanceKm: isToday ? null : distance,
          fuelOpening,
          fuelIssued,
          fuelConsumed: isToday ? null : consumed,
          fuelClosing: isToday ? null : fuelClosing,
          fuelNorm: isToday ? null : norm,
          fuelDeviation: isToday ? null : consumed - norm,
          fuelDeviationPct: isToday ? null : ((consumed - norm) / norm) * 100,
          preTripMedicalOk: true,
          preTripMedicalCheckId: medicalIds[i] ?? null,
          preTripTechnicalOk: true,
          preTripTechnicalInspectionId: technicalIds[i] ?? null,
          preTripCheckedAt: checkedAt,
          conditionOnIssue: VehicleCondition.SERVICEABLE,
          conditionOnReturn: isToday ? null : VehicleCondition.SERVICEABLE,
          issuedBy: dispatcher?.id ?? null,
          issuedAt: shiftStart,
          closedBy: isToday ? null : dispatcher?.id ?? null,
          closedAt: isToday ? null : shiftEnd,
          notes: MARKER,
          createdBy: dispatcher?.id ?? null,
        });
      }

      await prisma.waybill.createMany({ data: waybillRows });
      totalWaybills += waybillRows.length;

      const waybillIds = (
        await prisma.waybill.findMany({
          where: { officeId: office.id, validFrom: shiftStart, notes: MARKER },
          select: { id: true },
          orderBy: { id: 'asc' },
        })
      ).map((w) => w.id);

      const taskRows = waybillIds.flatMap((waybillId) =>
        Array.from({ length: randInt(2, 4) }, (_, seq) => ({
          waybillId,
          sequence: seq + 1,
          flightNumber: `HY${randInt(100, 999)}`,
          standNumber: String(randInt(1, 40)),
          distanceKm: randInt(2, 30),
          operations: 1,
        })),
      );
      await prisma.waybillTask.createMany({ data: taskRows });
      totalTasks += taskRows.length;
    }

    if (dayOffset % 5 === 0 || dayOffset === options.days - 1) {
      const done = options.days - dayOffset;
      process.stdout.write(
        `  сутки ${done}/${options.days} — листов ${totalWaybills.toLocaleString('ru-RU')}\n`,
      );
    }
  }

  // Возвращаем нумерацию на место, иначе следующий лист из интерфейса
  // получит уже занятый номер.
  if (sequence) {
    await prisma.documentSequence.update({
      where: { id: sequence.id },
      data: { lastValue: nextNumber - 1 },
    });
  } else {
    await prisma.documentSequence.create({
      data: { officeId: office.id, kind: 'WAYBILL', year, lastValue: nextNumber - 1 },
    });
  }

  const seconds = (Date.now() - started) / 1000;
  console.log(
    `\nГотово за ${seconds.toFixed(1)} с:\n` +
      `  путевых листов: ${totalWaybills.toLocaleString('ru-RU')}\n` +
      `  осмотров (мед. + тех.): ${totalChecks.toLocaleString('ru-RU')}\n` +
      `  заданий: ${totalTasks.toLocaleString('ru-RU')}\n` +
      `  скорость: ${Math.round((totalWaybills + totalChecks + totalTasks) / seconds).toLocaleString('ru-RU')} строк/с`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
