/**
 * Демонстрационные данные: три аэропорта с парком техники, водителями,
 * движением ГСМ и историей путевых листов за последний месяц.
 *
 * Зачем отдельно от seed.ts: тот наполняет справочники, без которых система
 * не работает вообще (права, роли, офисы, нормы). Этот — правдоподобный
 * операционный шум, нужный только для демонстрации и отладки интерфейсов.
 *
 * ВНИМАНИЕ: скрипт ПЕРЕСОЗДАЁТ операционные данные целевых офисов —
 * путевые листы, выдачи и приходы ГСМ, наряд-заказы, алерты, показания
 * счётчиков. Справочники, пользователи, техника и водители не удаляются,
 * а обновляются. В production не запускается.
 *
 * Запуск: npm run db:seed:demo -w @gsm/api
 */

import './env';

import {
  AlertSeverity,
  AlertType,
  CheckResult,
  FuelSource,
  MaintenanceKind,
  MaintenanceTrigger,
  MeterSource,
  OwnershipType,
  PermitZone,
  PrismaClient,
  UserStatus,
  VehicleStatus,
  WaybillStatus,
  WaybillType,
  WorkOrderStatus,
  type NormType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  DocumentKind,
  SYSTEM_ROLES,
  calculateDeviation,
  calculateNormConsumption,
  formatDocumentNumber,
  type NormAdjustment,
  type NormRule,
} from '@gsm/shared';

const prisma = new PrismaClient();

/** Глубина истории путевых листов, дней. */
const HISTORY_DAYS = 30;
/** Доля дней, в которые единица техники выходит в смену. */
const UTILISATION = 0.65;
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);
const DEMO_PASSWORD = 'Demo123!';

// ─── Детерминированный генератор ────────────────────────────────────────────
// Обычный Math.random дал бы разные данные при каждом прогоне, и обсуждать
// «вот тот путевой лист с перерасходом» стало бы невозможно.

let rngState = 20260813;
/**
 * Сброс генератора перед каждым офисом. Без этого данные Бухары зависели бы
 * от того, сколько случайных чисел израсходовал Ташкент, и любая правка
 * в одном офисе меняла бы все последующие.
 */
function reseed(salt: string): void {
  let hash = 20260813;
  for (const char of salt) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  rngState = hash;
}
function random(): number {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min: number, max: number): number =>
  min + Math.floor(random() * (max - min + 1));
const randFloat = (min: number, max: number, digits = 2): number =>
  Number((min + random() * (max - min)).toFixed(digits));
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const chance = (probability: number): boolean => random() < probability;

const round2 = (value: number): number => Math.round(value * 100) / 100;
const daysAgo = (days: number): Date => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
};
const addDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

// ─── Состав парка по офисам ─────────────────────────────────────────────────

interface FleetItem {
  prefix: string;
  modelKey: string;
  count: number;
}

interface OfficePlan {
  code: string;
  departments: Array<{ code: string; name: string }>;
  tanks: Array<{ code: string; name: string; fuel: string; capacity: number; fill: number }>;
  fleet: FleetItem[];
  driverCount: number;
  plateSeries: string;
}

/**
 * Состав подобран по реальной структуре наземного обслуживания: в крупном
 * аэропорту больше перронных автобусов и тягачей, в областном — минимальный
 * набор, зато та же номенклатура моделей. Одинаковые модели в разных офисах
 * нужны специально: только так работает сравнение расхода между аэропортами.
 */
const OFFICE_PLANS: OfficePlan[] = [
  {
    code: 'TAS',
    plateSeries: '01',
    departments: [
      { code: 'SST', name: 'Служба спецтранспорта' },
      { code: 'ATB', name: 'Автотранспортная база' },
      { code: 'AER', name: 'Аэродромная служба' },
    ],
    tanks: [
      { code: 'REZ-1', name: 'Резервуар ДТ №1', fuel: 'DT', capacity: 50_000, fill: 0.68 },
      { code: 'REZ-2', name: 'Резервуар ДТ №2', fuel: 'DT', capacity: 30_000, fill: 0.42 },
      { code: 'REZ-B', name: 'Резервуар АИ-91', fuel: 'AI91', capacity: 15_000, fill: 0.55 },
    ],
    fleet: [
      { prefix: 'А', modelKey: 'COBUS 3000', count: 4 },
      { prefix: 'Т', modelKey: 'Goldhofer AST-1X', count: 3 },
      { prefix: 'Б', modelKey: 'Charlatte T135', count: 4 },
      { prefix: 'Л', modelKey: 'TLD NBL-2', count: 2 },
      { prefix: 'М', modelKey: 'Mallaghan AL5100', count: 1 },
      { prefix: 'Д', modelKey: 'Vestergaard Elephant BETA', count: 2 },
      { prefix: 'G', modelKey: 'ITW GSE 7400', count: 2 },
      { prefix: 'V', modelKey: 'Mallaghan WS3000', count: 1 },
      { prefix: 'K', modelKey: 'Chevrolet Cobalt', count: 2 },
      { prefix: 'F', modelKey: 'Chevrolet Damas', count: 1 },
    ],
    driverCount: 16,
  },
  {
    code: 'SKD',
    plateSeries: '30',
    departments: [
      { code: 'SST', name: 'Служба спецтранспорта' },
      { code: 'ATB', name: 'Автотранспортная база' },
    ],
    tanks: [
      { code: 'REZ-1', name: 'Резервуар ДТ', fuel: 'DT', capacity: 25_000, fill: 0.51 },
      { code: 'REZ-B', name: 'Резервуар АИ-91', fuel: 'AI91', capacity: 8_000, fill: 0.6 },
    ],
    fleet: [
      { prefix: 'А', modelKey: 'COBUS 3000', count: 2 },
      { prefix: 'Т', modelKey: 'Goldhofer AST-1X', count: 2 },
      { prefix: 'Б', modelKey: 'Charlatte T135', count: 2 },
      { prefix: 'Л', modelKey: 'TLD NBL-2', count: 1 },
      { prefix: 'G', modelKey: 'ITW GSE 7400', count: 1 },
      { prefix: 'V', modelKey: 'Mallaghan WS3000', count: 1 },
      { prefix: 'K', modelKey: 'Chevrolet Cobalt', count: 1 },
    ],
    driverCount: 10,
  },
  {
    code: 'BHK',
    plateSeries: '80',
    departments: [{ code: 'SST', name: 'Служба спецтранспорта' }],
    tanks: [{ code: 'REZ-1', name: 'Резервуар ДТ', fuel: 'DT', capacity: 15_000, fill: 0.44 }],
    fleet: [
      { prefix: 'А', modelKey: 'COBUS 3000', count: 1 },
      { prefix: 'Т', modelKey: 'Goldhofer AST-1X', count: 1 },
      { prefix: 'Б', modelKey: 'Charlatte T135', count: 2 },
      { prefix: 'Л', modelKey: 'TLD NBL-2', count: 1 },
      { prefix: 'K', modelKey: 'Chevrolet Cobalt', count: 1 },
    ],
    driverCount: 7,
  },
];

const LAST_NAMES = [
  'Каримов', 'Юсупов', 'Абдуллаев', 'Рахимов', 'Тошматов', 'Эргашев', 'Собиров',
  'Назаров', 'Хамидов', 'Мирзаев', 'Исмоилов', 'Джураев', 'Турсунов', 'Йулдошев',
  'Сафаров', 'Ахмедов', 'Бекмуродов', 'Холматов', 'Нурматов', 'Расулов',
];
const FIRST_NAMES = [
  'Азиз', 'Бекзод', 'Тимур', 'Шухрат', 'Фарход', 'Умид', 'Жасур', 'Дилшод',
  'Санжар', 'Отабек', 'Рустам', 'Икром', 'Аброр', 'Хуршид', 'Улугбек', 'Botir',
];
const MIDDLE_NAMES = [
  'Рустамович', 'Шухратович', 'Фарходович', 'Азизович', 'Икромович',
  'Бахтиёрович', 'Дилшодович', 'Умидович',
];

const FLIGHTS = [
  { no: 'HY603', reg: 'UK78701' }, { no: 'HY272', reg: 'UK67004' },
  { no: 'HY411', reg: 'UK32021' }, { no: 'HY102', reg: 'UK78702' },
  { no: 'TK370', reg: 'TC-JSU' }, { no: 'SU1874', reg: 'RA-73145' },
  { no: 'FZ1721', reg: 'A6-FEG' }, { no: 'KC189', reg: 'UP-B3729' },
];

const SUPPLIERS = [
  { name: 'АО «Узбекнефтепродукт»', inn: '201234567' },
  { name: 'ООО «Sanoat Energetika Guruhi»', inn: '302345678' },
  { name: 'ООО «Neft Gaz Savdo»', inn: '403456789' },
];

const SPARE_PARTS = [
  { code: 'FLT-OIL-01', name: 'Фильтр масляный', unit: 'шт', price: 145_000 },
  { code: 'FLT-AIR-01', name: 'Фильтр воздушный', unit: 'шт', price: 210_000 },
  { code: 'FLT-FUEL-01', name: 'Фильтр топливный', unit: 'шт', price: 190_000 },
  { code: 'OIL-15W40', name: 'Масло моторное 15W-40', unit: 'л', price: 62_000 },
  { code: 'BRK-PAD-01', name: 'Колодки тормозные, комплект', unit: 'компл', price: 1_250_000 },
  { code: 'TIRE-1100R20', name: 'Шина 11.00R20', unit: 'шт', price: 4_800_000 },
  { code: 'BAT-190', name: 'Аккумулятор 190 А·ч', unit: 'шт', price: 2_400_000 },
  { code: 'ANTIFRZ', name: 'Антифриз G12', unit: 'л', price: 48_000 },
];

// ─── Вспомогательное ────────────────────────────────────────────────────────

/**
 * Нормы, действующие для техники на дату.
 *
 * Логика повторяет FuelNormsService: сначала нормы уровня единицы техники,
 * затем уровня модели, плюс зимняя надбавка офиса. Дублирование осознанное —
 * сервис живёт в контексте Nest и тянуть его в CLI-скрипт дороже,
 * чем воспроизвести двадцать строк выборки. Сам расчёт не дублируется:
 * он берётся из общего пакета, поэтому цифры совпадут с боевыми.
 */
async function resolveNorms(
  officeId: number,
  vehicleId: number,
  modelId: number,
  office: { winterSurchargePct: unknown; winterFromMonth: number; winterToMonth: number },
): Promise<{ rules: NormRule[]; adjustments: NormAdjustment[] }> {
  const norms = await prisma.fuelNorm.findMany({
    where: {
      officeId,
      deletedAt: null,
      OR: [{ vehicleId }, { modelId }],
    },
    include: { adjustments: true },
    orderBy: [{ vehicleId: 'desc' }, { validFrom: 'desc' }],
  });

  const rules: NormRule[] = [];
  const adjustments: NormAdjustment[] = [];
  const seen = new Set<NormType>();

  for (const norm of norms) {
    if (seen.has(norm.normType)) continue;
    seen.add(norm.normType);
    rules.push({
      id: norm.id,
      normType: norm.normType,
      baseRate: Number(norm.baseRate),
      validFrom: norm.validFrom,
      validTo: norm.validTo,
    });
  }

  const winterPct = Number(office.winterSurchargePct);
  if (winterPct > 0) {
    adjustments.push({
      id: -1,
      kind: 'WINTER',
      percent: winterPct,
      absolutePerUnit: null,
      appliesTo: null,
      validFrom: new Date(1970, 0, 1),
      validTo: null,
      seasonFromMonth: office.winterFromMonth,
      seasonToMonth: office.winterToMonth,
    });
  }

  return { rules, adjustments };
}

/** Счётчики номеров документов, чтобы не ходить в БД на каждый документ. */
const counters = new Map<string, number>();
function nextNumber(kind: DocumentKind, officeCode: string, year: number): string {
  const key = `${officeCode}:${kind}:${year}`;
  const value = (counters.get(key) ?? 0) + 1;
  counters.set(key, value);
  return formatDocumentNumber({ kind, officeCode, year, sequence: value });
}

// ─── Очистка ────────────────────────────────────────────────────────────────

/**
 * Удаляет операционные данные целевых офисов.
 *
 * Без этого повторный запуск задвоил бы путевые листы и увёл остатки
 * в ёмкостях: приходы и выдачи меняют currentVolume, а он не пересчитывается
 * из документов.
 */
async function resetOperationalData(officeIds: number[]): Promise<void> {
  const vehicles = await prisma.vehicle.findMany({
    where: { officeId: { in: officeIds } },
    select: { id: true },
  });
  const vehicleIds = vehicles.map((v) => v.id);

  await prisma.$transaction([
    prisma.alert.deleteMany({ where: { officeId: { in: officeIds } } }),
    prisma.auditLog.deleteMany({ where: { officeId: { in: officeIds } } }),
    prisma.vehicleMeterReading.deleteMany({ where: { vehicleId: { in: vehicleIds } } }),
    prisma.fuelIssue.deleteMany({ where: { officeId: { in: officeIds } } }),
    prisma.waybillTask.deleteMany({ where: { waybill: { officeId: { in: officeIds } } } }),
    prisma.waybill.deleteMany({ where: { officeId: { in: officeIds } } }),
    prisma.fuelInventory.deleteMany({ where: { officeId: { in: officeIds } } }),
    prisma.fuelReceipt.deleteMany({ where: { officeId: { in: officeIds } } }),
    prisma.workOrderPart.deleteMany({ where: { workOrder: { officeId: { in: officeIds } } } }),
    prisma.workOrder.deleteMany({ where: { officeId: { in: officeIds } } }),
    prisma.maintenancePlan.deleteMany({ where: { vehicleId: { in: vehicleIds } } }),
    // Трекеры тоже пересоздаются: на них частичный уникальный индекс
    // «один активный трекер на единицу техники», и повторный прогон
    // без очистки упирался бы в него.
    prisma.gpsDevice.deleteMany({ where: { vehicleId: { in: vehicleIds } } }),
    prisma.documentSequence.deleteMany({ where: { officeId: { in: officeIds } } }),
    // Госномера освобождаются до переназначения: на plate_number висит
    // уникальный индекс по всей стране, и номер, оставшийся от прошлого
    // прогона на другой машине, заблокировал бы выдачу того же номера.
    prisma.vehicle.updateMany({
      where: { officeId: { in: officeIds } },
      data: { plateNumber: null },
    }),
  ]);
}

// ─── Наполнение ─────────────────────────────────────────────────────────────

async function seedOffice(plan: OfficePlan): Promise<void> {
  const office = await prisma.office.findUniqueOrThrow({ where: { code: plan.code } });
  const year = new Date().getFullYear();
  reseed(plan.code);

  console.log(`\n[${plan.code}] ${office.nameRu}`);

  // ─── Подразделения ───────────────────────────────────────────────────────
  const departments = new Map<string, number>();
  for (const dep of plan.departments) {
    const record = await prisma.department.upsert({
      where: { officeId_code: { officeId: office.id, code: dep.code } },
      update: { name: dep.name },
      create: { officeId: office.id, code: dep.code, name: dep.name },
    });
    departments.set(dep.code, record.id);
  }

  // ─── Контрагенты ─────────────────────────────────────────────────────────
  const supplierIds: number[] = [];
  for (const sup of SUPPLIERS) {
    // Случайные значения вычисляются ДО ветвления. Внутри `existing ?? create(...)`
    // они бы расходовались только при создании, и повторный прогон сдвигал бы
    // весь дальнейший поток генератора.
    const isServiceProvider = chance(0.4);
    const existing = await prisma.counterparty.findFirst({
      where: { officeId: office.id, name: sup.name },
    });
    const record =
      existing ??
      (await prisma.counterparty.create({
        data: {
          officeId: office.id,
          name: sup.name,
          inn: sup.inn,
          isFuelSupplier: true,
          isServiceProvider,
        },
      }));
    supplierIds.push(record.id);
  }

  // ─── Ёмкости ─────────────────────────────────────────────────────────────
  const fuelTypes = await prisma.fuelType.findMany();
  const fuelTypeByCode = new Map(fuelTypes.map((f) => [f.code, f.id]));

  // Остаток ёмкости стартует с нуля и дальше меняется ТОЛЬКО документами.
  // Иначе баланс расходится с приходами и выдачами, а отчёт о движении ГСМ
  // выводит остаток на начало периода обратным ходом и получает отрицательные
  // числа — ровно та ошибка, которую в реальной эксплуатации ищут неделями.
  const tanks = new Map<string, { id: number; fuelTypeId: number; capacity: number }>();
  for (const t of plan.tanks) {
    const fuelTypeId = fuelTypeByCode.get(t.fuel)!;
    const record = await prisma.fuelTank.upsert({
      where: { officeId_code: { officeId: office.id, code: t.code } },
      update: { currentVolume: 0 },
      create: {
        officeId: office.id,
        fuelTypeId,
        code: t.code,
        name: t.name,
        capacity: t.capacity,
        currentVolume: 0,
        minVolume: round2(t.capacity * 0.1),
        location: 'Топливный склад',
      },
    });
    tanks.set(t.code, { id: record.id, fuelTypeId, capacity: t.capacity });
  }

  // ─── Техника ─────────────────────────────────────────────────────────────
  const models = await prisma.vehicleModel.findMany();
  const modelByKey = new Map(models.map((m) => [`${m.manufacturer} ${m.model}`, m]));
  const depCodes = plan.departments.map((d) => d.code);

  interface DemoVehicle {
    id: number;
    garageNumber: string;
    modelId: number;
    meterType: string;
    tankCapacity: number;
    fuelTypeId: number | null;
    odometer: number;
    engineHours: number;
    fuelLevel: number;
    /** Множитель фактического расхода: имитирует износ и стиль вождения. */
    thirst: number;
    status: VehicleStatus;
  }

  const vehicles: DemoVehicle[] = [];

  for (const item of plan.fleet) {
    const model = modelByKey.get(item.modelKey);
    if (!model) {
      console.warn(`  модель ${item.modelKey} не найдена в справочнике, пропускаю`);
      continue;
    }

    for (let i = 1; i <= item.count; i += 1) {
      const ordinal = vehicles.length + 1;
      const garageNumber = `${item.prefix}-${100 + ordinal}`;
      // Госномер выводится из порядкового номера, а не из случайного счётчика.
      // На plate_number висит уникальный индекс по всей стране, и случайные
      // номера при повторном прогоне сталкивались бы с номерами прошлого.
      const suffix = ['AA', 'BB', 'CC', 'DD'][ordinal % 4];
      const plateNumber = `${plan.plateSeries} A ${(100 + ordinal * 7).toString().padStart(3, '0')} ${suffix}`;

      // Пара единиц выведена из строя: парк никогда не бывает исправен целиком,
      // а списки и сводка должны это показывать.
      const status = chance(0.08)
        ? pick([VehicleStatus.REPAIR, VehicleStatus.MAINTENANCE])
        : VehicleStatus.ACTIVE;

      const capacity = Number(model.tankCapacity ?? 100);
      const odometer = randInt(8_000, 90_000);
      const engineHours = randInt(1_200, 12_000);

      const existing = await prisma.vehicle.findFirst({
        where: { officeId: office.id, garageNumber, deletedAt: null },
      });

      const data = {
        officeId: office.id,
        departmentId: departments.get(pick(depCodes))!,
        modelId: model.id,
        garageNumber,
        plateNumber,
        vin: `X${randInt(100000, 999999)}${randInt(100000, 999999)}`,
        inventoryNumber: `ОС-${randInt(10000, 99999)}`,
        category: model.category,
        status,
        ownership: chance(0.15) ? OwnershipType.LEASED : OwnershipType.OWNED,
        meterType: model.meterType,
        fuelTypeId: model.fuelTypeId,
        tankCapacity: capacity,
        currentOdometer: odometer,
        currentEngineHours: engineHours,
        currentFuelLevel: round2(capacity * randFloat(0.35, 0.8)),
        manufactureYear: randInt(2012, 2023),
        commissionedAt: daysAgo(randInt(400, 3600)),
        requiresAirsidePermit: model.category !== 'CAR',
      };

      const vehicle = existing
        ? await prisma.vehicle.update({ where: { id: existing.id }, data })
        : await prisma.vehicle.create({ data });

      if (!existing) {
        await prisma.vehicleAssignment.create({
          data: {
            vehicleId: vehicle.id,
            officeId: office.id,
            fromDate: vehicle.commissionedAt ?? daysAgo(1000),
            reason: 'Постановка на учёт (демоданные)',
          },
        });
      }

      // Планы ТО: по пробегу и по моточасам — что наступит раньше.
      await prisma.maintenancePlan.create({
        data: {
          vehicleId: vehicle.id,
          kind: MaintenanceKind.TO_1,
          trigger: MaintenanceTrigger.ODOMETER,
          intervalValue: 10_000,
          warnBefore: 700,
          lastOdometer: odometer - randInt(1_000, 9_500),
          lastPerformedAt: daysAgo(randInt(30, 260)),
        },
      });
      if (model.meterType !== 'ODOMETER') {
        await prisma.maintenancePlan.create({
          data: {
            vehicleId: vehicle.id,
            kind: MaintenanceKind.TO_2,
            trigger: MaintenanceTrigger.ENGINE_HOURS,
            intervalValue: 500,
            warnBefore: 40,
            lastEngineHours: engineHours - randInt(50, 480),
            lastPerformedAt: daysAgo(randInt(20, 200)),
          },
        });
      }

      if (chance(0.55)) {
        await prisma.gpsDevice.create({
          data: {
            vehicleId: vehicle.id,
            imei: `86${randInt(1000000000000, 9999999999999)}`.slice(0, 15),
            provider: pick(['Wialon', 'Navixy', 'Gurtam']),
            model: pick(['Teltonika FMB920', 'Galileosky 7.0', 'Teltonika FMC130']),
            hasFuelSensor: chance(0.5),
            installedAt: daysAgo(randInt(60, 900)),
            lastSeenAt: new Date(),
          },
        });
      }

      vehicles.push({
        id: vehicle.id,
        garageNumber,
        modelId: model.id,
        meterType: model.meterType,
        tankCapacity: capacity,
        fuelTypeId: model.fuelTypeId,
        odometer,
        engineHours,
        fuelLevel: Number(data.currentFuelLevel),
        // Две-три единицы «прожорливее» остальных: без этого журнал отклонений
        // будет ровным, и проверить поиск перерасхода не на чем.
        thirst: chance(0.15) ? randFloat(1.12, 1.3) : randFloat(0.94, 1.07),
        status,
      });
    }
  }
  // Техника, оставшаяся от прежних прогонов или от базового seed.ts, теряет
  // госномер при очистке (см. resetOperationalData). Возвращаем его из
  // отдельного диапазона, чтобы в списках не было машин без номера.
  const orphans = await prisma.vehicle.findMany({
    where: { officeId: office.id, deletedAt: null, plateNumber: null },
    select: { id: true },
  });
  for (const [index, orphan] of orphans.entries()) {
    await prisma.vehicle.update({
      where: { id: orphan.id },
      data: { plateNumber: `${plan.plateSeries} B ${(900 + index).toString()} ZZ` },
    });
  }

  console.log(
    `  техника: ${vehicles.length}` +
      (orphans.length ? ` (+${orphans.length} из прежнего набора)` : ''),
  );

  // ─── Водители ────────────────────────────────────────────────────────────
  interface DemoDriver {
    id: number;
    label: string;
    hasValidPermit: boolean;
  }
  const drivers: DemoDriver[] = [];

  for (let i = 0; i < plan.driverCount; i += 1) {
    const personnelNumber = `${plan.code}-${1000 + i}`;

    // Все случайные значения — до обращения к БД, чтобы поток генератора
    // не зависел от того, существует запись или создаётся заново.
    const driverData = {
      officeId: office.id,
      departmentId: departments.get(pick(depCodes))!,
      personnelNumber,
      lastName: pick(LAST_NAMES),
      firstName: pick(FIRST_NAMES),
      middleName: pick(MIDDLE_NAMES),
      birthDate: daysAgo(randInt(9_000, 20_000)),
      phone: `+9989${randInt(0, 9)} ${randInt(100, 999)}-${randInt(10, 99)}-${randInt(10, 99)}`,
      hireDate: daysAgo(randInt(200, 3_000)),
    };
    const licenseNumber = `AA${randInt(1000000, 9999999)}`;
    const licenseCategories = pick([
      ['B', 'C'], ['B', 'C', 'D'], ['C', 'CE'], ['B', 'C', 'D', 'DE'],
    ]);
    const licenseIssued = daysAgo(randInt(400, 3_000));
    const licenseDaysLeft = randInt(120, 2_000);

    const existing = await prisma.driver.findFirst({
      where: { officeId: office.id, personnelNumber, deletedAt: null },
    });

    const driver = existing
      ? await prisma.driver.update({ where: { id: existing.id }, data: driverData })
      : await prisma.driver.create({ data: driverData });

    await prisma.driverLicense.deleteMany({ where: { driverId: driver.id } });
    await prisma.driverLicense.create({
      data: {
        driverId: driver.id,
        number: licenseNumber,
        categories: licenseCategories as never,
        issuedAt: licenseIssued,
        expiresAt: addDays(new Date(), licenseDaysLeft),
      },
    });

    // Сроки допусков специально разной степени свежести: дашборд истекающих
    // документов бессмысленно проверять на парке, где всё действительно.
    await prisma.driverPermit.deleteMany({ where: { driverId: driver.id } });
    const permitDaysLeft =
      i === 0 ? -randInt(2, 20) : i === 1 ? randInt(1, 7) : i === 2 ? randInt(8, 25) : randInt(60, 700);
    await prisma.driverPermit.create({
      data: {
        driverId: driver.id,
        zone: PermitZone.APRON,
        number: `AP-${plan.code}-${1000 + i}`,
        issuedAt: daysAgo(randInt(200, 700)),
        expiresAt: addDays(new Date(), permitDaysLeft),
      },
    });

    await prisma.medicalCheck.deleteMany({ where: { driverId: driver.id, isPreTrip: false } });
    const medicalDaysLeft = i === 3 ? randInt(3, 14) : randInt(40, 330);
    await prisma.medicalCheck.create({
      data: {
        driverId: driver.id,
        checkedAt: daysAgo(365 - medicalDaysLeft),
        validUntil: addDays(new Date(), medicalDaysLeft),
        result: CheckResult.PASSED,
        isPreTrip: false,
        doctorName: 'Медпункт предприятия',
      },
    });

    drivers.push({
      id: driver.id,
      label: `${driver.lastName} ${driver.firstName}`,
      hasValidPermit: permitDaysLeft > 0,
    });
  }
  console.log(`  водители: ${drivers.length} (у одного допуск просрочен, у одного истекает на неделе)`);

  // ─── Пользователи офиса ──────────────────────────────────────────────────
  const roleByCode = new Map(
    (await prisma.role.findMany()).map((r) => [r.code, r.id]),
  );
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
  const staff = [
    { role: SYSTEM_ROLES.DISPATCHER, login: 'dispatcher', name: 'Диспетчер' },
    { role: SYSTEM_ROLES.FUEL_OPERATOR, login: 'fuel', name: 'Оператор ГСМ' },
    { role: SYSTEM_ROLES.MECHANIC, login: 'mechanic', name: 'Механик' },
    { role: SYSTEM_ROLES.ACCOUNTANT, login: 'accountant', name: 'Бухгалтер' },
    { role: SYSTEM_ROLES.FLEET_MANAGER, login: 'chief', name: 'Начальник автослужбы' },
  ];

  for (const s of staff) {
    const email = `${s.login}.${plan.code.toLowerCase()}@gsm.local`;
    const user = await prisma.user.upsert({
      where: { email },
      // Пароль перезаписывается намеренно: демо-учётки должны быть
      // предсказуемыми, иначе у одной и той же роли в разных офисах
      // окажутся разные пароли, доставшиеся от прежних прогонов.
      update: { status: UserStatus.ACTIVE, defaultOfficeId: office.id, passwordHash },
      create: {
        email,
        passwordHash,
        fullName: `${s.name} — ${office.city ?? plan.code}`,
        status: UserStatus.ACTIVE,
        defaultOfficeId: office.id,
      },
    });
    await prisma.userOffice.createMany({
      data: [{ userId: user.id, officeId: office.id }],
      skipDuplicates: true,
    });
    const roleId = roleByCode.get(s.role)!;
    const hasRole = await prisma.userRole.findFirst({
      where: { userId: user.id, roleId, officeId: office.id },
    });
    if (!hasRole) {
      await prisma.userRole.create({ data: { userId: user.id, roleId, officeId: office.id } });
    }
  }
  console.log(`  пользователи: ${staff.length} (пароль ${DEMO_PASSWORD})`);

  // ─── Приход ГСМ ──────────────────────────────────────────────────────────
  let receiptCount = 0;
  for (const [code, tank] of tanks) {
    const planned = plan.tanks.find((t) => t.code === code)!;

    // Начальный остаток оформляется документом, датированным раньше периода
    // отчётности. Без него отчёт не сможет показать остаток на начало месяца.
    const openingVolume = round2(tank.capacity * planned.fill);
    const openingPrice = randFloat(8_600, 9_800, 2);
    await prisma.fuelReceipt.create({
      data: {
        officeId: office.id,
        tankId: tank.id,
        fuelTypeId: tank.fuelTypeId,
        supplierId: pick(supplierIds),
        documentNumber: nextNumber(DocumentKind.FUEL_RECEIPT, plan.code, year),
        externalNumber: `ОСТ-${randInt(100000, 999999)}`,
        receivedAt: daysAgo(HISTORY_DAYS + 10),
        volume: openingVolume,
        density: randFloat(0.82, 0.85, 4),
        pricePerLitre: openingPrice,
        totalAmount: round2(openingVolume * openingPrice),
        notes: `Начальный остаток в ёмкости ${code}`,
      },
    });
    await prisma.fuelTank.update({
      where: { id: tank.id },
      data: { currentVolume: { increment: openingVolume } },
    });
    receiptCount += 1;

    for (let week = 4; week >= 0; week -= 1) {
      // Приход не должен переполнять ёмкость: на неё стоит CHECK-ограничение.
      const current = await prisma.fuelTank.findUniqueOrThrow({ where: { id: tank.id } });
      const room = tank.capacity - Number(current.currentVolume);
      const volume = round2(Math.min(room, tank.capacity * randFloat(0.08, 0.18)));
      if (volume <= 0) continue;

      const price = randFloat(8_600, 10_400, 2);
      await prisma.fuelReceipt.create({
        data: {
          officeId: office.id,
          tankId: tank.id,
          fuelTypeId: tank.fuelTypeId,
          supplierId: pick(supplierIds),
          documentNumber: nextNumber(DocumentKind.FUEL_RECEIPT, plan.code, year),
          externalNumber: `ТТН-${randInt(100000, 999999)}`,
          receivedAt: daysAgo(week * 7 + randInt(0, 3)),
          volume,
          density: randFloat(0.82, 0.85, 4),
          pricePerLitre: price,
          totalAmount: round2(volume * price),
          notes: `Поставка в ёмкость ${code}`,
        },
      });
      await prisma.fuelTank.update({
        where: { id: tank.id },
        data: { currentVolume: { increment: volume } },
      });
      receiptCount += 1;
    }
  }
  console.log(`  приходы ГСМ: ${receiptCount}`);

  // ─── Путевые листы ───────────────────────────────────────────────────────
  const activeVehicles = vehicles.filter((v) => v.status === VehicleStatus.ACTIVE);
  const eligibleDrivers = drivers.filter((d) => d.hasValidPermit);

  let waybillCount = 0;
  let issueCount = 0;
  let alertCount = 0;
  const meterReadings: Array<{
    vehicleId: number;
    recordedAt: Date;
    odometer: number | null;
    engineHours: number | null;
    source: MeterSource;
    comment: string;
  }> = [];

  const normCache = new Map<number, { rules: NormRule[]; adjustments: NormAdjustment[] }>();

  for (let dayOffset = HISTORY_DAYS; dayOffset >= 0; dayOffset -= 1) {
    const day = daysAgo(dayOffset);

    for (const vehicle of activeVehicles) {
      if (!chance(UTILISATION)) continue;

      const driver = pick(eligibleDrivers);
      const shiftStart = new Date(day);
      shiftStart.setHours(chance(0.5) ? 8 : 20, 0, 0, 0);
      const shiftEnd = new Date(shiftStart);
      shiftEnd.setHours(shiftStart.getHours() + 12);

      // Профиль работы зависит от типа счётчика: у тягача пробег копеечный,
      // у автобуса наоборот, у стационарного оборудования его нет вовсе.
      const usesOdometer = vehicle.meterType !== 'ENGINE_HOURS';
      const usesHours = vehicle.meterType !== 'ODOMETER';
      const distanceKm = usesOdometer ? randFloat(vehicle.meterType === 'BOTH' ? 8 : 60, vehicle.meterType === 'BOTH' ? 45 : 220, 1) : 0;
      const engineHours = usesHours ? randFloat(3, 10, 1) : 0;

      const taskCount = randInt(1, 4);
      const tasks = Array.from({ length: taskCount }, (_, index) => {
        const flight = pick(FLIGHTS);
        return {
          sequence: index + 1,
          fromPoint: index === 0 ? 'Стоянка спецтехники' : `Стоянка ${randInt(1, 24)}`,
          toPoint: `Стоянка ${randInt(1, 24)}`,
          flightNumber: flight.no,
          aircraftReg: flight.reg,
          standNumber: String(randInt(1, 24)),
          startedAt: new Date(shiftStart.getTime() + index * 2 * 3_600_000),
          endedAt: new Date(shiftStart.getTime() + (index * 2 + 1) * 3_600_000),
          distanceKm: round2(distanceKm / taskCount),
          engineHours: round2(engineHours / taskCount),
          passengers: chance(0.4) ? randInt(40, 180) : null,
          operations: 1,
        };
      });

      let norms = normCache.get(vehicle.modelId);
      if (!norms) {
        norms = await resolveNorms(office.id, vehicle.id, vehicle.modelId, office);
        normCache.set(vehicle.modelId, norms);
      }

      const calculation = calculateNormConsumption({
        onDate: shiftStart,
        volume: { distanceKm, engineHours, operations: taskCount, shifts: 1 },
        rules: norms.rules,
        adjustments: norms.adjustments,
      });

      const norm = calculation.totalLitres;
      const actual = round2(norm * vehicle.thirst * randFloat(0.97, 1.05));

      const odometerStart = vehicle.odometer;
      const engineHoursStart = vehicle.engineHours;
      const odometerEnd = usesOdometer ? round2(odometerStart + distanceKm) : odometerStart;
      const engineHoursEnd = usesHours ? round2(engineHoursStart + engineHours) : engineHoursStart;

      const fuelOpening = vehicle.fuelLevel;

      // Заправляемся, когда в баке меньше половины либо не хватает на смену.
      let fuelIssued = 0;
      const tankCode = vehicle.fuelTypeId === fuelTypeByCode.get('AI91')
        ? plan.tanks.find((t) => t.fuel === 'AI91')?.code
        : plan.tanks.find((t) => t.fuel === 'DT')?.code;
      const tank = tankCode ? tanks.get(tankCode) : undefined;

      if (tank && (fuelOpening < vehicle.tankCapacity * 0.5 || fuelOpening < actual)) {
        const room = vehicle.tankCapacity - fuelOpening;
        fuelIssued = round2(Math.min(room, Math.max(actual, vehicle.tankCapacity * randFloat(0.3, 0.7))));
      }

      const fuelClosing = round2(fuelOpening + fuelIssued - actual);
      if (fuelClosing < 0) continue; // страховка: смену без топлива не проводим

      const deviation = calculateDeviation(actual, norm);
      const number = nextNumber(DocumentKind.WAYBILL, plan.code, year);

      const waybill = await prisma.waybill.create({
        data: {
          officeId: office.id,
          number,
          type: WaybillType.SHIFT,
          status: WaybillStatus.CLOSED,
          vehicleId: vehicle.id,
          driverId: driver.id,
          validFrom: shiftStart,
          validTo: shiftEnd,
          odometerStart,
          engineHoursStart,
          odometerEnd,
          engineHoursEnd,
          distanceKm,
          engineHours,
          operations: taskCount,
          fuelOpening,
          fuelIssued,
          fuelConsumed: actual,
          fuelClosing,
          fuelNorm: norm,
          fuelDeviation: deviation.absolute,
          fuelDeviationPct: deviation.percent,
          normBreakdown: calculation as never,
          preTripMedicalOk: true,
          preTripTechnicalOk: true,
          preTripCheckedAt: shiftStart,
          issuedAt: shiftStart,
          submittedAt: shiftEnd,
          closedAt: new Date(shiftEnd.getTime() + 3_600_000),
          tasks: { create: tasks },
        },
      });
      waybillCount += 1;

      if (fuelIssued > 0 && tank) {
        await prisma.fuelIssue.create({
          data: {
            officeId: office.id,
            vehicleId: vehicle.id,
            driverId: driver.id,
            waybillId: waybill.id,
            fuelTypeId: tank.fuelTypeId,
            source: FuelSource.TANK,
            tankId: tank.id,
            documentNumber: nextNumber(DocumentKind.FUEL_ISSUE, plan.code, year),
            issuedAt: new Date(shiftStart.getTime() + 900_000),
            volume: fuelIssued,
            pricePerLitre: 9_500,
            totalAmount: round2(fuelIssued * 9_500),
            odometerAtIssue: odometerStart,
            engineHoursAtIssue: engineHoursStart,
            operatorId: null,
          },
        });
        await prisma.fuelTank.update({
          where: { id: tank.id },
          data: { currentVolume: { decrement: fuelIssued } },
        });
        issueCount += 1;
      }

      meterReadings.push({
        vehicleId: vehicle.id,
        recordedAt: shiftEnd,
        odometer: usesOdometer ? odometerEnd : null,
        engineHours: usesHours ? engineHoursEnd : null,
        source: MeterSource.WAYBILL,
        comment: `Закрытие путевого листа ${number}`,
      });

      if (deviation.percent !== null && deviation.percent > 10) {
        await prisma.alert.create({
          data: {
            officeId: office.id,
            type: AlertType.FUEL_OVERCONSUMPTION,
            severity: deviation.percent > 25 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
            vehicleId: vehicle.id,
            driverId: driver.id,
            entityType: 'Waybill',
            entityId: waybill.id,
            title: `Перерасход по путевому листу ${number}`,
            message: `Норма ${norm} л, факт ${actual} л, перерасход ${deviation.percent.toFixed(1)} %`,
            payload: { norm, actual, percent: deviation.percent },
            occurredAt: shiftEnd,
            dedupeKey: `overconsumption:${waybill.id}`,
          },
        });
        alertCount += 1;
      }

      vehicle.odometer = odometerEnd;
      vehicle.engineHours = engineHoursEnd;
      vehicle.fuelLevel = fuelClosing;
    }
  }

  await prisma.vehicleMeterReading.createMany({ data: meterReadings });

  for (const vehicle of vehicles) {
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        currentOdometer: vehicle.odometer,
        currentEngineHours: vehicle.engineHours,
        currentFuelLevel: vehicle.fuelLevel,
      },
    });
  }

  console.log(`  путевые листы: ${waybillCount}, выдачи ГСМ: ${issueCount}, алерты о перерасходе: ${alertCount}`);

  // ─── Инвентаризация ──────────────────────────────────────────────────────
  for (const [, tank] of tanks) {
    const current = await prisma.fuelTank.findUniqueOrThrow({ where: { id: tank.id } });
    const book = Number(current.currentVolume);
    const actual = round2(book + randFloat(-tank.capacity * 0.004, tank.capacity * 0.002));
    await prisma.fuelInventory.create({
      data: {
        officeId: office.id,
        tankId: tank.id,
        documentNumber: nextNumber(DocumentKind.INVENTORY_ACT, plan.code, year),
        countedAt: daysAgo(randInt(1, 5)),
        bookVolume: book,
        actualVolume: actual,
        difference: round2(actual - book),
        temperature: randFloat(12, 28, 1),
        density: randFloat(0.82, 0.85, 4),
        commission: 'Комиссия в составе начальника службы, бухгалтера и оператора ГСМ',
      },
    });
  }

  // ─── Наряд-заказы ────────────────────────────────────────────────────────
  const partIds = new Map(
    (await prisma.sparePart.findMany()).map((p) => [p.code, p.id]),
  );
  let workOrderCount = 0;

  for (const vehicle of vehicles) {
    if (!chance(0.35)) continue;

    const status = pick([
      WorkOrderStatus.COMPLETED,
      WorkOrderStatus.COMPLETED,
      WorkOrderStatus.IN_PROGRESS,
      WorkOrderStatus.WAITING_PARTS,
      WorkOrderStatus.REQUESTED,
    ]);
    const kind = pick([MaintenanceKind.TO_1, MaintenanceKind.TO_2, MaintenanceKind.CURRENT_REPAIR]);
    const start = daysAgo(randInt(2, 90));
    const partsUsed = Array.from({ length: randInt(1, 3) }, () => pick(SPARE_PARTS));
    const partsCost = partsUsed.reduce((sum, p) => sum + p.price, 0);
    const laborCost = randInt(200_000, 1_800_000);

    const order = await prisma.workOrder.create({
      data: {
        officeId: office.id,
        vehicleId: vehicle.id,
        number: nextNumber(DocumentKind.WORK_ORDER, plan.code, year),
        kind,
        status,
        description: pick([
          'Плановое техническое обслуживание',
          'Замена тормозных колодок передней оси',
          'Течь масла из-под клапанной крышки',
          'Не запускается двигатель, разряд аккумулятора',
          'Замена фильтров и масла',
          'Ремонт гидравлики подъёмного механизма',
        ]),
        odometerAt: vehicle.odometer,
        engineHoursAt: vehicle.engineHours,
        plannedStart: start,
        actualStart: status === WorkOrderStatus.REQUESTED ? null : start,
        actualEnd: status === WorkOrderStatus.COMPLETED ? addDays(start, randInt(1, 4)) : null,
        downtimeHours: status === WorkOrderStatus.COMPLETED ? randFloat(4, 60, 1) : null,
        laborCost,
        partsCost,
        totalCost: laborCost + partsCost,
      },
    });

    for (const part of partsUsed) {
      const partId = partIds.get(part.code);
      if (!partId) continue;
      const quantity = randInt(1, 4);
      await prisma.workOrderPart.create({
        data: {
          workOrderId: order.id,
          partId,
          quantity,
          unitPrice: part.price,
          totalPrice: part.price * quantity,
        },
      });
    }
    workOrderCount += 1;
  }
  console.log(`  наряд-заказы: ${workOrderCount}`);

  // ─── Склад запчастей ─────────────────────────────────────────────────────
  for (const part of SPARE_PARTS) {
    const partId = partIds.get(part.code);
    if (!partId) continue;
    await prisma.sparePartStock.upsert({
      where: { officeId_partId: { officeId: office.id, partId } },
      update: { quantity: randInt(0, 40) },
      create: {
        officeId: office.id,
        partId,
        quantity: randInt(0, 40),
        minQuantity: randInt(2, 8),
        avgPrice: part.price,
      },
    });
  }

  // ─── Счётчики номеров ────────────────────────────────────────────────────
  // Обязательный шаг: приложение продолжит нумерацию с этих значений.
  // Без него первый же созданный в интерфейсе документ получил бы номер,
  // который уже занят демоданными.
  for (const [key, value] of counters) {
    const [officeCode, kind, yearStr] = key.split(':');
    if (officeCode !== plan.code) continue;
    await prisma.documentSequence.upsert({
      where: {
        officeId_kind_year: { officeId: office.id, kind, year: Number(yearStr) },
      },
      update: { lastValue: value },
      create: { officeId: office.id, kind, year: Number(yearStr), lastValue: value },
    });
  }
}

async function seedSpareParts(): Promise<void> {
  for (const part of SPARE_PARTS) {
    await prisma.sparePart.upsert({
      where: { code: part.code },
      update: { name: part.name, unit: part.unit },
      create: { code: part.code, name: part.name, unit: part.unit },
    });
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Демоданные нельзя загружать в production');
  }

  console.log('Загрузка демонстрационных данных');
  console.log(`Глубина истории: ${HISTORY_DAYS} дней\n`);

  const codes = OFFICE_PLANS.map((p) => p.code);
  const offices = await prisma.office.findMany({ where: { code: { in: codes } } });
  if (offices.length !== codes.length) {
    throw new Error('Не найдены офисы. Сначала выполните npm run db:seed.');
  }

  console.log('Очистка операционных данных целевых офисов...');
  await resetOperationalData(offices.map((o) => o.id));

  await seedSpareParts();

  for (const plan of OFFICE_PLANS) {
    await seedOffice(plan);
  }

  console.log('\nГотово. Учётные записи офисов:');
  for (const plan of OFFICE_PLANS) {
    const code = plan.code.toLowerCase();
    console.log(`  ${plan.code}: dispatcher.${code}@gsm.local, chief.${code}@gsm.local, fuel.${code}@gsm.local — пароль ${DEMO_PASSWORD}`);
  }
  console.log('  Все офисы: admin@gsm.local');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
