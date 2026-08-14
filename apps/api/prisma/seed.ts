/**
 * Начальное наполнение базы.
 *
 * Идемпотентен: повторный запуск обновляет справочники и не плодит дубли.
 * Выполняется под ролью-владельцем (DATABASE_URL), поэтому политики RLS
 * его не ограничивают — иначе он не смог бы создать данные ни одного офиса.
 *
 * Запуск: npm run db:seed
 */

import './env';

import {
  MeterType,
  OfficeKind,
  NormType,
  PrismaClient,
  UserStatus,
  VehicleCategory,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_LABELS,
  SYSTEM_ROLES,
  UZBEKISTAN_AIRPORTS,
  type SystemRole,
} from '@gsm/shared';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@gsm.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
const WITH_DEMO = process.env.SEED_DEMO_DATA === 'true';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

// ─── Справочники ────────────────────────────────────────────────────────────

const FUEL_TYPES = [
  { code: 'DT', name: 'Дизельное топливо', density: 0.84 },
  { code: 'AI80', name: 'Бензин АИ-80', density: 0.735 },
  { code: 'AI91', name: 'Бензин АИ-91', density: 0.745 },
  { code: 'AI95', name: 'Бензин АИ-95', density: 0.75 },
  { code: 'CNG', name: 'Сжатый природный газ (метан)', density: 0.72 },
  { code: 'LPG', name: 'Сжиженный газ (пропан-бутан)', density: 0.55 },
];

/**
 * Модели техники. Нормы расхода заданы ориентировочные — их обязательно
 * заменить на утверждённые приказом по предприятию до опытной эксплуатации.
 */
const VEHICLE_MODELS: Array<{
  category: VehicleCategory;
  manufacturer: string;
  model: string;
  meterType: MeterType;
  fuelCode: string;
  tankCapacity: number;
  seats?: number;
  grossWeight?: number;
  norms: Array<{ type: NormType; rate: number }>;
}> = [
  {
    category: VehicleCategory.APRON_BUS,
    manufacturer: 'COBUS',
    model: '3000',
    meterType: MeterType.BOTH,
    fuelCode: 'DT',
    tankCapacity: 180,
    seats: 112,
    grossWeight: 22_000,
    // У перронного автобуса основной расход — от частых остановок и работы
    // на малых скоростях, поэтому к пробегу добавляется норма на моточас.
    norms: [
      { type: NormType.PER_100KM, rate: 42.0 },
      { type: NormType.PER_ENGINE_HOUR, rate: 6.5 },
    ],
  },
  {
    category: VehicleCategory.PUSHBACK_TUG,
    manufacturer: 'Goldhofer',
    model: 'AST-1X',
    meterType: MeterType.BOTH,
    fuelCode: 'DT',
    tankCapacity: 240,
    grossWeight: 32_000,
    // Тягач за смену проезжает единицы километров, но работает часами —
    // норма практически целиком на моточасах.
    norms: [
      { type: NormType.PER_100KM, rate: 38.0 },
      { type: NormType.PER_ENGINE_HOUR, rate: 14.0 },
    ],
  },
  {
    category: VehicleCategory.BAGGAGE_TUG,
    manufacturer: 'Charlatte',
    model: 'T135',
    meterType: MeterType.BOTH,
    fuelCode: 'DT',
    tankCapacity: 60,
    norms: [
      { type: NormType.PER_100KM, rate: 18.0 },
      { type: NormType.PER_ENGINE_HOUR, rate: 4.2 },
    ],
  },
  {
    category: VehicleCategory.BELT_LOADER,
    manufacturer: 'TLD',
    model: 'NBL-2',
    meterType: MeterType.ENGINE_HOURS,
    fuelCode: 'DT',
    tankCapacity: 55,
    norms: [{ type: NormType.PER_ENGINE_HOUR, rate: 3.8 }],
  },
  {
    category: VehicleCategory.AMBULIFT,
    manufacturer: 'Mallaghan',
    model: 'AL5100',
    meterType: MeterType.BOTH,
    fuelCode: 'DT',
    tankCapacity: 90,
    norms: [
      { type: NormType.PER_100KM, rate: 24.0 },
      { type: NormType.PER_ENGINE_HOUR, rate: 5.0 },
    ],
  },
  {
    category: VehicleCategory.DEICER,
    manufacturer: 'Vestergaard',
    model: 'Elephant BETA',
    meterType: MeterType.BOTH,
    fuelCode: 'DT',
    tankCapacity: 300,
    // Отдельная норма на операцию: подогрев реагента при обработке ВС
    // даёт расход, не связанный ни с пробегом, ни с моточасами.
    norms: [
      { type: NormType.PER_100KM, rate: 45.0 },
      { type: NormType.PER_ENGINE_HOUR, rate: 12.0 },
      { type: NormType.PER_OPERATION, rate: 28.0 },
    ],
  },
  {
    category: VehicleCategory.GPU,
    manufacturer: 'ITW GSE',
    model: '7400',
    meterType: MeterType.ENGINE_HOURS,
    fuelCode: 'DT',
    tankCapacity: 120,
    norms: [{ type: NormType.PER_ENGINE_HOUR, rate: 19.0 }],
  },
  {
    category: VehicleCategory.ASU,
    manufacturer: 'TLD',
    model: 'ASU-600',
    meterType: MeterType.ENGINE_HOURS,
    fuelCode: 'DT',
    tankCapacity: 200,
    norms: [{ type: NormType.PER_ENGINE_HOUR, rate: 42.0 }],
  },
  {
    category: VehicleCategory.WATER_TRUCK,
    manufacturer: 'Mallaghan',
    model: 'WS3000',
    meterType: MeterType.BOTH,
    fuelCode: 'DT',
    tankCapacity: 80,
    norms: [
      { type: NormType.PER_100KM, rate: 22.0 },
      { type: NormType.PER_ENGINE_HOUR, rate: 3.5 },
    ],
  },
  {
    category: VehicleCategory.LAVATORY_TRUCK,
    manufacturer: 'Mallaghan',
    model: 'LS3000',
    meterType: MeterType.BOTH,
    fuelCode: 'DT',
    tankCapacity: 80,
    norms: [
      { type: NormType.PER_100KM, rate: 22.0 },
      { type: NormType.PER_ENGINE_HOUR, rate: 3.5 },
    ],
  },
  {
    category: VehicleCategory.SNOW_REMOVAL,
    manufacturer: 'Bucher',
    model: 'Rolba 4000',
    meterType: MeterType.BOTH,
    fuelCode: 'DT',
    tankCapacity: 400,
    norms: [
      { type: NormType.PER_100KM, rate: 55.0 },
      { type: NormType.PER_ENGINE_HOUR, rate: 32.0 },
    ],
  },
  {
    category: VehicleCategory.STAFF_BUS,
    manufacturer: 'Isuzu',
    model: 'NQR 71P',
    meterType: MeterType.ODOMETER,
    fuelCode: 'DT',
    tankCapacity: 100,
    seats: 33,
    norms: [{ type: NormType.PER_100KM, rate: 19.5 }],
  },
  {
    category: VehicleCategory.CAR,
    manufacturer: 'Chevrolet',
    model: 'Cobalt',
    meterType: MeterType.ODOMETER,
    fuelCode: 'AI91',
    tankCapacity: 45,
    seats: 5,
    norms: [{ type: NormType.PER_100KM, rate: 8.4 }],
  },
  {
    category: VehicleCategory.FOLLOW_ME,
    manufacturer: 'Chevrolet',
    model: 'Damas',
    meterType: MeterType.ODOMETER,
    fuelCode: 'AI91',
    tankCapacity: 38,
    seats: 7,
    norms: [{ type: NormType.PER_100KM, rate: 9.2 }],
  },
];

// ─── Шаги наполнения ────────────────────────────────────────────────────────

async function seedPermissions(): Promise<void> {
  for (const code of ALL_PERMISSIONS) {
    const groupCode = code.split('.')[0];
    await prisma.permission.upsert({
      where: { code },
      update: { groupCode },
      create: { code, groupCode },
    });
  }
  console.log(`  Прав: ${ALL_PERMISSIONS.length}`);
}

async function seedRoles(): Promise<void> {
  const permissions = await prisma.permission.findMany();
  const byCode = new Map(permissions.map((p) => [p.code, p.id]));

  for (const [roleCode, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const code = roleCode as SystemRole;

    const role = await prisma.role.upsert({
      where: { code },
      update: { name: ROLE_LABELS[code].ru },
      create: { code, name: ROLE_LABELS[code].ru, isSystem: true },
    });

    // Набор прав приводится к эталонному: роль правится приказом,
    // а не накоплением. Права, выданные вручную в UI, будут сброшены —
    // это осознанно, seed задаёт базовую конфигурацию.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: perms
        .map((code) => byCode.get(code))
        .filter((id): id is number => id !== undefined)
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
  console.log(`  Ролей: ${Object.keys(DEFAULT_ROLE_PERMISSIONS).length}`);
}

async function seedOffices(): Promise<{ hqId: number; officeIds: Map<string, number> }> {
  const hq = await prisma.office.upsert({
    where: { code: 'HQ' },
    update: {},
    create: {
      code: 'HQ',
      kind: OfficeKind.HEADQUARTERS,
      nameRu: 'Uzbekistan Airports — головной офис',
      nameUz: 'Uzbekistan Airports — bosh ofis',
      nameEn: 'Uzbekistan Airports — Headquarters',
      city: 'Ташкент',
      timezone: 'Asia/Tashkent',
    },
  });

  const officeIds = new Map<string, number>();

  for (const airport of UZBEKISTAN_AIRPORTS) {
    const office = await prisma.office.upsert({
      where: { code: airport.code },
      update: {
        nameRu: airport.nameRu,
        nameUz: airport.nameUz,
        nameEn: airport.nameEn,
        parentId: hq.id,
        winterSurchargePct: airport.winterSurchargePct,
        winterFromMonth: airport.winterFromMonth,
        winterToMonth: airport.winterToMonth,
      },
      create: {
        code: airport.code,
        kind: OfficeKind.AIRPORT,
        parentId: hq.id,
        nameRu: airport.nameRu,
        nameUz: airport.nameUz,
        nameEn: airport.nameEn,
        iataCode: airport.iata,
        icaoCode: airport.icao,
        city: airport.city,
        timezone: airport.timezone,
        latitude: airport.lat,
        longitude: airport.lon,
        winterSurchargePct: airport.winterSurchargePct,
        winterFromMonth: airport.winterFromMonth,
        winterToMonth: airport.winterToMonth,
      },
    });
    officeIds.set(airport.code, office.id);
  }

  console.log(`  Офисов: ${officeIds.size + 1} (включая головной)`);
  return { hqId: hq.id, officeIds };
}

async function seedFuelTypes(): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const type of FUEL_TYPES) {
    const record = await prisma.fuelType.upsert({
      where: { code: type.code },
      update: { name: type.name, density: type.density },
      create: type,
    });
    ids.set(type.code, record.id);
  }
  console.log(`  Видов топлива: ${ids.size}`);
  return ids;
}

async function seedVehicleModels(fuelTypeIds: Map<string, number>): Promise<Map<string, number>> {
  const ids = new Map<string, number>();

  for (const model of VEHICLE_MODELS) {
    const record = await prisma.vehicleModel.upsert({
      where: {
        manufacturer_model: { manufacturer: model.manufacturer, model: model.model },
      },
      update: {
        category: model.category,
        meterType: model.meterType,
        tankCapacity: model.tankCapacity,
        fuelTypeId: fuelTypeIds.get(model.fuelCode) ?? null,
      },
      create: {
        category: model.category,
        manufacturer: model.manufacturer,
        model: model.model,
        meterType: model.meterType,
        tankCapacity: model.tankCapacity,
        seats: model.seats ?? null,
        grossWeight: model.grossWeight ?? null,
        fuelTypeId: fuelTypeIds.get(model.fuelCode) ?? null,
      },
    });
    ids.set(`${model.manufacturer} ${model.model}`, record.id);
  }

  console.log(`  Моделей техники: ${ids.size}`);
  return ids;
}

/**
 * Нормы уровня модели создаются для каждого офиса отдельно.
 *
 * Норма — это приказ по конкретному предприятию: у Ташкента и Ургенча
 * для одного и того же тягача могут быть разные утверждённые значения.
 */
async function seedModelNorms(
  officeIds: Map<string, number>,
  modelIds: Map<string, number>,
  fuelTypeIds: Map<string, number>,
): Promise<void> {
  const validFrom = new Date(new Date().getFullYear(), 0, 1);
  let created = 0;

  for (const officeId of officeIds.values()) {
    for (const model of VEHICLE_MODELS) {
      const modelId = modelIds.get(`${model.manufacturer} ${model.model}`);
      if (!modelId) continue;

      for (const norm of model.norms) {
        const existing = await prisma.fuelNorm.findFirst({
          where: { officeId, modelId, normType: norm.type, deletedAt: null, validTo: null },
        });
        if (existing) continue;

        await prisma.fuelNorm.create({
          data: {
            officeId,
            modelId,
            fuelTypeId: fuelTypeIds.get(model.fuelCode) ?? null,
            normType: norm.type,
            baseRate: norm.rate,
            validFrom,
            documentRef: 'Базовые нормы (seed) — заменить на утверждённые приказом',
          },
        });
        created += 1;
      }
    }
  }

  console.log(`  Норм расхода: ${created}`);
}

async function seedAdmin(hqId: number, officeIds: Map<string, number>): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { code: SYSTEM_ROLES.SUPER_ADMIN },
  });

  const allOfficeIds = [hqId, ...officeIds.values()];
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);

  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { status: UserStatus.ACTIVE, bypassRls: true },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      fullName: 'Системный администратор',
      status: UserStatus.ACTIVE,
      // Единственная учётка с обходом RLS: ей нужен доступ ко всем
      // аэропортам страны для сопровождения системы.
      bypassRls: true,
      defaultOfficeId: hqId,
    },
  });

  await prisma.userOffice.createMany({
    data: allOfficeIds.map((officeId) => ({ userId: user.id, officeId })),
    skipDuplicates: true,
  });

  const existingRole = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: role.id, officeId: null },
  });
  if (!existingRole) {
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id, officeId: null },
    });
  }

  console.log(`  Администратор: ${ADMIN_EMAIL}`);
}

/**
 * Демонстрационные данные — только для разработки.
 * Создаются в одном офисе (Ташкент), чтобы было на чём проверить
 * изоляцию: пользователь Самарканда не должен увидеть ничего из этого.
 */
async function seedDemoData(
  officeIds: Map<string, number>,
  modelIds: Map<string, number>,
  fuelTypeIds: Map<string, number>,
): Promise<void> {
  const officeId = officeIds.get('TAS');
  if (!officeId) return;

  const department = await prisma.department.upsert({
    where: { officeId_code: { officeId, code: 'SST' } },
    update: {},
    create: { officeId, code: 'SST', name: 'Служба спецтранспорта' },
  });

  const dieselId = fuelTypeIds.get('DT')!;

  const tank = await prisma.fuelTank.upsert({
    where: { officeId_code: { officeId, code: 'REZ-1' } },
    update: {},
    create: {
      officeId,
      fuelTypeId: dieselId,
      code: 'REZ-1',
      name: 'Резервуар ДТ №1',
      capacity: 50_000,
      currentVolume: 32_500,
      minVolume: 5_000,
      location: 'Топливный склад, сектор B',
    },
  });

  const demoVehicles: Array<{ garage: string; plate: string; modelKey: string }> = [
    { garage: 'А-101', plate: '01 A 101 AA', modelKey: 'COBUS 3000' },
    { garage: 'А-102', plate: '01 A 102 AA', modelKey: 'COBUS 3000' },
    { garage: 'Т-201', plate: '01 T 201 BB', modelKey: 'Goldhofer AST-1X' },
    { garage: 'Т-202', plate: '01 T 202 BB', modelKey: 'Charlatte T135' },
    { garage: 'Д-301', plate: '01 D 301 CC', modelKey: 'Vestergaard Elephant BETA' },
    { garage: 'G-401', plate: '01 G 401 DD', modelKey: 'ITW GSE 7400' },
  ];

  for (const item of demoVehicles) {
    const modelId = modelIds.get(item.modelKey);
    if (!modelId) continue;

    const model = await prisma.vehicleModel.findUniqueOrThrow({ where: { id: modelId } });

    const existing = await prisma.vehicle.findFirst({
      where: { officeId, garageNumber: item.garage, deletedAt: null },
    });
    if (existing) continue;

    const vehicle = await prisma.vehicle.create({
      data: {
        officeId,
        departmentId: department.id,
        modelId,
        garageNumber: item.garage,
        plateNumber: item.plate,
        category: model.category,
        meterType: model.meterType,
        fuelTypeId: model.fuelTypeId,
        tankCapacity: model.tankCapacity,
        currentOdometer: 12_400,
        currentEngineHours: 3_150,
        currentFuelLevel: Number(model.tankCapacity ?? 0) * 0.6,
        manufactureYear: 2019,
        commissionedAt: new Date(2019, 5, 1),
      },
    });

    await prisma.vehicleAssignment.create({
      data: {
        vehicleId: vehicle.id,
        officeId,
        fromDate: new Date(2019, 5, 1),
        reason: 'Постановка на учёт (демоданные)',
      },
    });
  }

  const demoDrivers = [
    { personnel: '1001', last: 'Каримов', first: 'Азиз', middle: 'Рустамович' },
    { personnel: '1002', last: 'Юсупов', first: 'Бекзод', middle: 'Шухратович' },
    { personnel: '1003', last: 'Абдуллаев', first: 'Тимур', middle: 'Фарходович' },
  ];

  for (const item of demoDrivers) {
    const existing = await prisma.driver.findFirst({
      where: { officeId, personnelNumber: item.personnel, deletedAt: null },
    });
    if (existing) continue;

    const driver = await prisma.driver.create({
      data: {
        officeId,
        departmentId: department.id,
        personnelNumber: item.personnel,
        lastName: item.last,
        firstName: item.first,
        middleName: item.middle,
        hireDate: new Date(2020, 2, 1),
      },
    });

    await prisma.driverLicense.create({
      data: {
        driverId: driver.id,
        number: `AA${item.personnel}234`,
        categories: ['B', 'C', 'D'],
        issuedAt: new Date(2020, 0, 15),
        expiresAt: new Date(new Date().getFullYear() + 2, 0, 15),
      },
    });

    await prisma.driverPermit.create({
      data: {
        driverId: driver.id,
        zone: 'APRON',
        number: `AP-${item.personnel}`,
        issuedAt: new Date(new Date().getFullYear() - 1, 0, 10),
        // Один допуск истекает через 20 дней — чтобы дашборд
        // «истекает через N дней» сразу было на чём проверить.
        expiresAt:
          item.personnel === '1003'
            ? new Date(Date.now() + 20 * 86_400_000)
            : new Date(new Date().getFullYear() + 1, 0, 10),
      },
    });

    await prisma.medicalCheck.create({
      data: {
        driverId: driver.id,
        checkedAt: new Date(Date.now() - 30 * 86_400_000),
        validUntil: new Date(Date.now() + 335 * 86_400_000),
        result: 'PASSED',
        isPreTrip: false,
      },
    });
  }

  const dispatcherRole = await prisma.role.findUniqueOrThrow({
    where: { code: SYSTEM_ROLES.DISPATCHER },
  });

  const dispatcher = await prisma.user.upsert({
    where: { email: 'dispatcher.tas@gsm.local' },
    update: {},
    create: {
      email: 'dispatcher.tas@gsm.local',
      passwordHash: await bcrypt.hash('Dispatcher123!', BCRYPT_ROUNDS),
      fullName: 'Диспетчер Ташкента',
      status: UserStatus.ACTIVE,
      defaultOfficeId: officeId,
      offices: { create: [{ officeId }] },
    },
  });

  const hasRole = await prisma.userRole.findFirst({
    where: { userId: dispatcher.id, roleId: dispatcherRole.id, officeId },
  });
  if (!hasRole) {
    await prisma.userRole.create({
      data: { userId: dispatcher.id, roleId: dispatcherRole.id, officeId },
    });
  }

  console.log(
    `  Демоданные Ташкента: техника, водители, ёмкость ${tank.code}, ` +
      'диспетчер dispatcher.tas@gsm.local / Dispatcher123!',
  );
}

async function main(): Promise<void> {
  console.log('Наполнение базы данных:');

  await seedPermissions();
  await seedRoles();
  const { hqId, officeIds } = await seedOffices();
  const fuelTypeIds = await seedFuelTypes();
  const modelIds = await seedVehicleModels(fuelTypeIds);
  await seedModelNorms(officeIds, modelIds, fuelTypeIds);
  await seedAdmin(hqId, officeIds);

  if (WITH_DEMO) {
    await seedDemoData(officeIds, modelIds, fuelTypeIds);
  }

  console.log('\nГотово.');
  console.log(`Вход: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log('Смените пароль администратора перед выходом в эксплуатацию.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
