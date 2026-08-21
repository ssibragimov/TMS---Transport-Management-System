import {
  VehicleCategory,
  VehicleStatus,
  VehicleDocumentType,
  WaybillStatus,
  PermitZone,
  NormType,
  ROLE_LABELS,
  type SystemRole,
} from '@gsm/shared';

/**
 * Русские подписи для перечислений.
 *
 * Пока лежат здесь, а не в файлах i18n: это доменная терминология, которую
 * согласовывают со службой спецтранспорта, и правят её чаще, чем интерфейсные
 * строки. При запуске узбекской версии переедут в общий словарь переводов.
 */

export const CATEGORY_LABEL: Record<string, string> = {
  [VehicleCategory.APRON_BUS]: 'Перронный автобус',
  [VehicleCategory.PUSHBACK_TUG]: 'Тягач (pushback)',
  [VehicleCategory.BAGGAGE_TUG]: 'Багажный тягач',
  [VehicleCategory.BELT_LOADER]: 'Ленточный транспортёр',
  [VehicleCategory.AMBULIFT]: 'Амбулифт',
  [VehicleCategory.DEICER]: 'Деайсер',
  [VehicleCategory.REFUELLER]: 'Топливозаправщик',
  [VehicleCategory.GPU]: 'Источник питания (GPU)',
  [VehicleCategory.ASU]: 'Установка воздушного запуска',
  [VehicleCategory.ACU]: 'Кондиционер ВС',
  [VehicleCategory.CATERING_TRUCK]: 'Машина бортпитания',
  [VehicleCategory.WATER_TRUCK]: 'Водозаправщик',
  [VehicleCategory.LAVATORY_TRUCK]: 'Ассенизатор',
  [VehicleCategory.CARGO_LOADER]: 'Контейнерный погрузчик',
  [VehicleCategory.SNOW_REMOVAL]: 'Снегоуборочная',
  [VehicleCategory.FIRE_TRUCK]: 'Пожарный автомобиль',
  [VehicleCategory.FOLLOW_ME]: 'Follow-me',
  [VehicleCategory.CAR]: 'Легковой',
  [VehicleCategory.STAFF_BUS]: 'Служебный автобус',
  [VehicleCategory.TRUCK]: 'Грузовой',
  [VehicleCategory.FORKLIFT]: 'Автопогрузчик',
  [VehicleCategory.TRAILER]: 'Прицеп',
  [VehicleCategory.STATIONARY_EQUIPMENT]: 'Стационарное оборудование',
  [VehicleCategory.OTHER]: 'Прочее',
};

export const STATUS_LABEL: Record<string, string> = {
  [VehicleStatus.ACTIVE]: 'В строю',
  [VehicleStatus.MAINTENANCE]: 'На ТО',
  [VehicleStatus.REPAIR]: 'В ремонте',
  [VehicleStatus.RESERVE]: 'В резерве',
  [VehicleStatus.IN_TRANSFER]: 'В передаче',
  [VehicleStatus.DECOMMISSIONED]: 'Списана',
};

export const STATUS_COLOR: Record<string, string> = {
  [VehicleStatus.ACTIVE]: 'green',
  [VehicleStatus.MAINTENANCE]: 'gold',
  [VehicleStatus.REPAIR]: 'red',
  [VehicleStatus.RESERVE]: 'default',
  [VehicleStatus.IN_TRANSFER]: 'purple',
  [VehicleStatus.DECOMMISSIONED]: 'default',
};

export const METER_LABEL: Record<string, string> = {
  ODOMETER: 'Одометр (км)',
  ENGINE_HOURS: 'Моточасы',
  BOTH: 'Одометр и моточасы',
  NONE: 'Без счётчика',
};

export const OWNERSHIP_LABEL: Record<string, string> = {
  OWNED: 'Собственная',
  LEASED: 'Лизинг',
  RENTED: 'Аренда',
};

export const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  [VehicleDocumentType.REGISTRATION]: 'Свидетельство о регистрации',
  [VehicleDocumentType.INSURANCE_OSAGO]: 'ОСАГО',
  [VehicleDocumentType.INSURANCE_CASCO]: 'КАСКО',
  [VehicleDocumentType.TECH_INSPECTION]: 'Техосмотр',
  [VehicleDocumentType.AIRSIDE_VEHICLE_PERMIT]: 'Пропуск на перрон',
  [VehicleDocumentType.CALIBRATION_CERTIFICATE]: 'Свидетельство о поверке',
  [VehicleDocumentType.LEASE_CONTRACT]: 'Договор лизинга',
  [VehicleDocumentType.TACHOGRAPH]: 'Тахограф',
  [VehicleDocumentType.OTHER]: 'Прочее',
  LICENSE: 'Водительское удостоверение',
  MEDICAL: 'Медосмотр',
  PERMIT_APRON: 'Допуск: перрон',
  PERMIT_AIRSIDE: 'Допуск: контролируемая зона',
  PERMIT_RUNWAY: 'Допуск: ВПП',
  PERMIT_MANEUVERING_AREA: 'Допуск: площадь манёврирования',
  PERMIT_LANDSIDE: 'Допуск: привокзальная зона',
};

export const WAYBILL_STATUS_LABEL: Record<string, string> = {
  [WaybillStatus.DRAFT]: 'Черновик',
  [WaybillStatus.ISSUED]: 'Выдан',
  [WaybillStatus.IN_PROGRESS]: 'В работе',
  [WaybillStatus.SUBMITTED]: 'Сдан',
  [WaybillStatus.CLOSED]: 'Закрыт',
  [WaybillStatus.CANCELLED]: 'Аннулирован',
};

export const WAYBILL_STATUS_COLOR: Record<string, string> = {
  [WaybillStatus.DRAFT]: 'default',
  [WaybillStatus.ISSUED]: 'blue',
  [WaybillStatus.IN_PROGRESS]: 'processing',
  [WaybillStatus.SUBMITTED]: 'gold',
  [WaybillStatus.CLOSED]: 'green',
  [WaybillStatus.CANCELLED]: 'red',
};

export const PERMIT_ZONE_LABEL: Record<string, string> = {
  [PermitZone.LANDSIDE]: 'Привокзальная зона',
  [PermitZone.AIRSIDE]: 'Контролируемая зона',
  [PermitZone.APRON]: 'Перрон',
  [PermitZone.MANEUVERING_AREA]: 'Площадь манёврирования',
  [PermitZone.RUNWAY]: 'ВПП',
};

export const NORM_TYPE_LABEL: Record<string, string> = {
  [NormType.PER_100KM]: 'л на 100 км',
  [NormType.PER_ENGINE_HOUR]: 'л на моточас',
  [NormType.PER_OPERATION]: 'л на операцию',
  [NormType.PER_TON_KM]: 'л на т·км',
  [NormType.PER_SHIFT]: 'л на смену',
};

export const FUEL_SOURCE_LABEL: Record<string, string> = {
  TANK: 'Из ёмкости',
  FUEL_CARD: 'Топливная карта',
  CASH: 'Наличные',
  EXTERNAL: 'Сторонний поставщик',
};

/*
 * ─── Журнал действий ────────────────────────────────────────────────────────
 * Словари вынесены сюда, а не оставлены в AuditPage: те же подписи нужны
 * вкладке журнала в карточке сущности, и две копии рано или поздно разошлись бы.
 */

export const ACTION_LABEL: Record<string, string> = {
  CREATE: 'Создание',
  UPDATE: 'Изменение',
  DELETE: 'Удаление',
  RESTORE: 'Восстановление',
  LOGIN: 'Вход',
  LOGIN_FAILED: 'Неудачный вход',
  LOGOUT: 'Выход',
  EXPORT: 'Выгрузка',
  PRINT: 'Печать',
  APPROVE: 'Утверждение',
  REJECT: 'Отклонение',
};

export const ACTION_COLOR: Record<string, string> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  APPROVE: 'cyan',
  REJECT: 'orange',
  EXPORT: 'purple',
  LOGIN: 'default',
  LOGIN_FAILED: 'red',
};

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  Vehicle: 'Транспорт',
  Driver: 'Водитель',
  Waybill: 'Путевой лист',
  Fuel: 'ГСМ',
  User: 'Пользователь',
  Role: 'Роль',
  Office: 'Офис',
  Report: 'Отчёт',
  FuelType: 'Вид топлива',
  VehicleModel: 'Модель техники',
  Department: 'Подразделение',
  Counterparty: 'Контрагент',
  SparePart: 'Номенклатура ТМЦ',
  Stock: 'Склад ТМЦ',
  Warehouse: 'Склад',
  VehiclePhoto: 'Фото техники',
  VehicleDocument: 'Документ техники',
  VehicleMeterReading: 'Показания счётчика',
  DriverLicense: 'Удостоверение',
  DriverPermit: 'Допуск водителя',
  MedicalCheck: 'Медосмотр',
  UserPassword: 'Пароль пользователя',
  UserPhoto: 'Фото сотрудника',
};

/**
 * Название роли на языке интерфейса.
 *
 * Здесь единственное место, где перевод берётся НЕ из словаря i18next:
 * ROLE_LABELS в общем пакете уже содержит все три языка, потому что
 * названия ролей нужны и серверу (в seed'е). Гонять их через русский ключ
 * значило бы хранить одно и то же дважды и однажды разойтись.
 *
 * Роли, созданные администратором, в ROLE_LABELS отсутствуют — для них
 * возвращается код как есть; их собственное название хранится в БД
 * одной строкой и по языкам не разделено.
 */
export function roleLabel(code: string, language: string): string {
  const labels = ROLE_LABELS[code as SystemRole];
  if (!labels) return code;
  if (language.startsWith('uz')) return labels.uz;
  if (language.startsWith('en')) return labels.en;
  return labels.ru;
}

/** Число с разделителями разрядов; null отображается прочерком. */
export function fmt(value: string | number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Цвет отклонения: перерасход свыше 10 % — красный, свыше 3 % — оранжевый. */
export function deviationColor(percent: number | null): string {
  if (percent === null) return 'inherit';
  if (percent > 10) return '#cf1322';
  if (percent > 3) return '#d46b08';
  if (percent < -10) return '#0958d9';
  return '#389e0d';
}
