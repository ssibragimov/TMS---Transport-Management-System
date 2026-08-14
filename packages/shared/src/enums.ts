/**
 * Перечисления, общие для backend и frontend.
 *
 * ВАЖНО: значения обязаны совпадать один-в-один с enum в prisma/schema.prisma.
 * Дублирование сделано намеренно — так frontend не тянет за собой @prisma/client.
 * При изменении Prisma-схемы правьте оба места (проверяется тестом contract.spec.ts).
 */

/** Тип подразделения. Головной офис видит все аэропорты, аэропорт — только себя. */
export const OfficeKind = {
  HEADQUARTERS: 'HEADQUARTERS',
  AIRPORT: 'AIRPORT',
  BRANCH: 'BRANCH',
} as const;
export type OfficeKind = (typeof OfficeKind)[keyof typeof OfficeKind];

export const UserStatus = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/**
 * Категории техники. Верхний блок — специфика аэропорта, нижний — общий автопарк.
 * Расширяется без миграции данных: добавляйте значения в конец.
 */
export const VehicleCategory = {
  /** Перронный автобус для перевозки пассажиров */
  APRON_BUS: 'APRON_BUS',
  /** Тягач для буксировки ВС (pushback) */
  PUSHBACK_TUG: 'PUSHBACK_TUG',
  /** Багажный тягач */
  BAGGAGE_TUG: 'BAGGAGE_TUG',
  /** Ленточный транспортёр */
  BELT_LOADER: 'BELT_LOADER',
  /** Автолифт для маломобильных пассажиров */
  AMBULIFT: 'AMBULIFT',
  /** Деайсер (противообледенительная обработка) */
  DEICER: 'DEICER',
  /** Топливозаправщик ВС */
  REFUELLER: 'REFUELLER',
  /** Наземный источник питания (GPU) */
  GPU: 'GPU',
  /** Установка воздушного запуска (ASU) */
  ASU: 'ASU',
  /** Кондиционер ВС (ACU) */
  ACU: 'ACU',
  /** Машина бортпитания */
  CATERING_TRUCK: 'CATERING_TRUCK',
  /** Водозаправщик */
  WATER_TRUCK: 'WATER_TRUCK',
  /** Ассенизационная машина */
  LAVATORY_TRUCK: 'LAVATORY_TRUCK',
  /** Контейнерный погрузчик (main deck loader) */
  CARGO_LOADER: 'CARGO_LOADER',
  /** Снегоуборочная техника */
  SNOW_REMOVAL: 'SNOW_REMOVAL',
  /** Пожарный автомобиль */
  FIRE_TRUCK: 'FIRE_TRUCK',
  /** Follow-me */
  FOLLOW_ME: 'FOLLOW_ME',

  /** Легковой автомобиль */
  CAR: 'CAR',
  /** Служебный автобус (перевозка персонала) */
  STAFF_BUS: 'STAFF_BUS',
  /** Грузовой автомобиль */
  TRUCK: 'TRUCK',
  /** Автопогрузчик */
  FORKLIFT: 'FORKLIFT',
  /** Прицеп / полуприцеп (без двигателя) */
  TRAILER: 'TRAILER',
  /** Стационарное оборудование с ДВС (генератор, компрессор) */
  STATIONARY_EQUIPMENT: 'STATIONARY_EQUIPMENT',
  OTHER: 'OTHER',
} as const;
export type VehicleCategory = (typeof VehicleCategory)[keyof typeof VehicleCategory];

/**
 * Что считает счётчик единицы техники.
 * Определяет, по какой базе рассчитывается норма расхода в путевом листе.
 */
export const MeterType = {
  /** Только одометр (км) — автобусы, легковые */
  ODOMETER: 'ODOMETER',
  /** Только моточасы — GPU, ASU, стационарное оборудование */
  ENGINE_HOURS: 'ENGINE_HOURS',
  /** Оба счётчика — тягачи, деайсеры, погрузчики */
  BOTH: 'BOTH',
  /** Без счётчика — прицепы */
  NONE: 'NONE',
} as const;
export type MeterType = (typeof MeterType)[keyof typeof MeterType];

export const VehicleStatus = {
  ACTIVE: 'ACTIVE',
  /** Плановое ТО */
  MAINTENANCE: 'MAINTENANCE',
  /** Внеплановый ремонт */
  REPAIR: 'REPAIR',
  /** Резерв / консервация */
  RESERVE: 'RESERVE',
  /** Передан в другой офис, в пути */
  IN_TRANSFER: 'IN_TRANSFER',
  DECOMMISSIONED: 'DECOMMISSIONED',
} as const;
export type VehicleStatus = (typeof VehicleStatus)[keyof typeof VehicleStatus];

export const OwnershipType = {
  OWNED: 'OWNED',
  LEASED: 'LEASED',
  RENTED: 'RENTED',
} as const;
export type OwnershipType = (typeof OwnershipType)[keyof typeof OwnershipType];

/** Типы документов техники — все со сроком действия, все попадают в дашборд истечений. */
export const VehicleDocumentType = {
  REGISTRATION: 'REGISTRATION',
  INSURANCE_OSAGO: 'INSURANCE_OSAGO',
  INSURANCE_CASCO: 'INSURANCE_CASCO',
  TECH_INSPECTION: 'TECH_INSPECTION',
  /** Разрешение на движение по контролируемой зоне аэродрома */
  AIRSIDE_VEHICLE_PERMIT: 'AIRSIDE_VEHICLE_PERMIT',
  /** Свидетельство о поверке (для топливозаправщиков, деайсеров) */
  CALIBRATION_CERTIFICATE: 'CALIBRATION_CERTIFICATE',
  LEASE_CONTRACT: 'LEASE_CONTRACT',
  TACHOGRAPH: 'TACHOGRAPH',
  OTHER: 'OTHER',
} as const;
export type VehicleDocumentType =
  (typeof VehicleDocumentType)[keyof typeof VehicleDocumentType];

/** Откуда взялось показание счётчика — влияет на доверие к цифре. */
export const MeterSource = {
  /** Введено вручную диспетчером */
  MANUAL: 'MANUAL',
  /** Из путевого листа при закрытии */
  WAYBILL: 'WAYBILL',
  /** С GPS-трекера */
  TELEMETRY: 'TELEMETRY',
  /** Фото одометра из мобильного приложения */
  MOBILE_PHOTO: 'MOBILE_PHOTO',
  /** Корректировка (замена счётчика, исправление ошибки) */
  ADJUSTMENT: 'ADJUSTMENT',
} as const;
export type MeterSource = (typeof MeterSource)[keyof typeof MeterSource];

export const LicenseCategory = {
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  BE: 'BE',
  CE: 'CE',
  DE: 'DE',
  /** Тракторист-машинист */
  TRACTOR: 'TRACTOR',
  /** Удостоверение водителя погрузчика */
  FORKLIFT: 'FORKLIFT',
} as const;
export type LicenseCategory = (typeof LicenseCategory)[keyof typeof LicenseCategory];

/**
 * Зоны допуска. Без действующего допуска водитель не должен попадать
 * в путевой лист на технику, работающую в соответствующей зоне.
 */
export const PermitZone = {
  /** Общедоступная зона (привокзальная площадь) */
  LANDSIDE: 'LANDSIDE',
  /** Контролируемая зона аэродрома */
  AIRSIDE: 'AIRSIDE',
  /** Перрон */
  APRON: 'APRON',
  /** Площадь манёврирования (РД) */
  MANEUVERING_AREA: 'MANEUVERING_AREA',
  /** ВПП */
  RUNWAY: 'RUNWAY',
} as const;
export type PermitZone = (typeof PermitZone)[keyof typeof PermitZone];

export const CheckResult = {
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  CONDITIONAL: 'CONDITIONAL',
} as const;
export type CheckResult = (typeof CheckResult)[keyof typeof CheckResult];

/** Откуда выдано топливо. Влияет на то, списывается ли объём с ёмкости. */
export const FuelSource = {
  /** Собственная ёмкость / бочка / АЗС предприятия */
  TANK: 'TANK',
  /** Топливная карта на внешней АЗС */
  FUEL_CARD: 'FUEL_CARD',
  /** Наличными по авансовому отчёту */
  CASH: 'CASH',
  /** Заправка от стороннего поставщика по договору */
  EXTERNAL: 'EXTERNAL',
} as const;
export type FuelSource = (typeof FuelSource)[keyof typeof FuelSource];

/**
 * База расчёта нормы расхода. У аэропортовой техники это ключевое различие:
 * тягач за смену проезжает 12 км, но молотит 9 моточасов.
 */
export const NormType = {
  /** Литров на 100 км — автобусы, легковые, грузовые */
  PER_100KM: 'PER_100KM',
  /** Литров на моточас — тягачи, GPU, ASU, деайсеры */
  PER_ENGINE_HOUR: 'PER_ENGINE_HOUR',
  /** Литров на одну операцию — обработка одного ВС деайсером */
  PER_OPERATION: 'PER_OPERATION',
  /** Литров на тонно-километр — надбавка для грузовых */
  PER_TON_KM: 'PER_TON_KM',
  /** Фиксированный расход за смену */
  PER_SHIFT: 'PER_SHIFT',
} as const;
export type NormType = (typeof NormType)[keyof typeof NormType];

/** Надбавки к базовой норме. Каждая — отдельная запись с периодом действия. */
export const NormAdjustmentKind = {
  /** Зимняя надбавка (у каждого региона свой процент и период) */
  WINTER: 'WINTER',
  /** Работа кондиционера */
  AIR_CONDITIONING: 'AIR_CONDITIONING',
  /** Работа с частыми остановками (перронные автобусы) */
  FREQUENT_STOPS: 'FREQUENT_STOPS',
  /** Возраст техники / износ двигателя */
  VEHICLE_AGE: 'VEHICLE_AGE',
  /** Работа спецоборудования на стоянке */
  IDLE_EQUIPMENT: 'IDLE_EQUIPMENT',
  /** Обкатка после капремонта */
  RUN_IN: 'RUN_IN',
  OTHER: 'OTHER',
} as const;
export type NormAdjustmentKind =
  (typeof NormAdjustmentKind)[keyof typeof NormAdjustmentKind];

export const WaybillType = {
  /** На одну смену */
  SHIFT: 'SHIFT',
  /** На период (неделя, декада, месяц) */
  PERIOD: 'PERIOD',
} as const;
export type WaybillType = (typeof WaybillType)[keyof typeof WaybillType];

/**
 * Жизненный цикл путевого листа.
 * DRAFT → ISSUED → IN_PROGRESS → SUBMITTED → CLOSED
 * Из любого состояния до CLOSED возможен CANCELLED.
 */
export const WaybillStatus = {
  /** Черновик, ещё не выдан */
  DRAFT: 'DRAFT',
  /** Выдан водителю, пройден предрейсовый контроль */
  ISSUED: 'ISSUED',
  /** Смена идёт */
  IN_PROGRESS: 'IN_PROGRESS',
  /** Сдан водителем, ждёт проверки диспетчера */
  SUBMITTED: 'SUBMITTED',
  /** Закрыт, расход рассчитан, редактирование запрещено */
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;
export type WaybillStatus = (typeof WaybillStatus)[keyof typeof WaybillStatus];

export const MaintenanceKind = {
  /** Ежедневное обслуживание */
  DAILY: 'DAILY',
  TO_1: 'TO_1',
  TO_2: 'TO_2',
  SEASONAL: 'SEASONAL',
  /** Текущий ремонт */
  CURRENT_REPAIR: 'CURRENT_REPAIR',
  /** Капитальный ремонт */
  OVERHAUL: 'OVERHAUL',
  /** Замена шин */
  TIRE_SERVICE: 'TIRE_SERVICE',
} as const;
export type MaintenanceKind = (typeof MaintenanceKind)[keyof typeof MaintenanceKind];

export const WorkOrderStatus = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_PARTS: 'WAITING_PARTS',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
} as const;
export type WorkOrderStatus = (typeof WorkOrderStatus)[keyof typeof WorkOrderStatus];

/** Триггеры плановых ТО. По пробегу, моточасам или календарю — что наступит раньше. */
export const MaintenanceTrigger = {
  ODOMETER: 'ODOMETER',
  ENGINE_HOURS: 'ENGINE_HOURS',
  CALENDAR: 'CALENDAR',
} as const;
export type MaintenanceTrigger =
  (typeof MaintenanceTrigger)[keyof typeof MaintenanceTrigger];

export const AlertSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const;
export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];

/** Типы событий, на которые система реагирует автоматически. */
export const AlertType = {
  /** Истекает срок документа (страховка, техосмотр, допуск) */
  DOCUMENT_EXPIRING: 'DOCUMENT_EXPIRING',
  DOCUMENT_EXPIRED: 'DOCUMENT_EXPIRED',
  /** Истекает права/допуск/медосмотр водителя */
  DRIVER_CLEARANCE_EXPIRING: 'DRIVER_CLEARANCE_EXPIRING',
  /** Расход выше нормы более чем на заданный процент */
  FUEL_OVERCONSUMPTION: 'FUEL_OVERCONSUMPTION',
  /** Заправлено больше, чем вмещает бак */
  FUEL_TANK_OVERFLOW: 'FUEL_TANK_OVERFLOW',
  /** Две заправки в разных точках за слишком короткий срок */
  FUEL_IMPOSSIBLE_SEQUENCE: 'FUEL_IMPOSSIBLE_SEQUENCE',
  /** Резкое падение уровня топлива при заглушенном двигателе */
  FUEL_DRAIN_SUSPECTED: 'FUEL_DRAIN_SUSPECTED',
  /** Расхождение GPS-пробега и пробега в путевом листе */
  MILEAGE_MISMATCH: 'MILEAGE_MISMATCH',
  /** Выезд за геозону */
  GEOFENCE_EXIT: 'GEOFENCE_EXIT',
  GEOFENCE_ENTRY: 'GEOFENCE_ENTRY',
  /** Превышение скорости на перроне */
  SPEEDING: 'SPEEDING',
  /** Подошёл срок планового ТО */
  MAINTENANCE_DUE: 'MAINTENANCE_DUE',
  /** Остаток в ёмкости ниже минимума */
  TANK_LOW_LEVEL: 'TANK_LOW_LEVEL',
  /** Расхождение книжного и фактического остатка при инвентаризации */
  INVENTORY_DISCREPANCY: 'INVENTORY_DISCREPANCY',
} as const;
export type AlertType = (typeof AlertType)[keyof typeof AlertType];

export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  RESTORE: 'RESTORE',
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  EXPORT: 'EXPORT',
  PRINT: 'PRINT',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const Locale = {
  RU: 'ru',
  UZ: 'uz',
  UZ_CYRL: 'uz-Cyrl',
  EN: 'en',
} as const;
export type Locale = (typeof Locale)[keyof typeof Locale];
