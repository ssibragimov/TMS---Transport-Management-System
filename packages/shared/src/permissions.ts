/**
 * Модель прав доступа.
 *
 * Право = "<ресурс>.<действие>". Роль = именованный набор прав.
 * Пользователь получает роли в разрезе офиса (см. UserRole в схеме БД):
 * один и тот же человек может быть диспетчером в Ташкенте и наблюдателем в Самарканде.
 *
 * Роли — это данные (таблица roles), а не код. Константы ниже описывают
 * стартовый набор, который создаёт seed; администратор может править их в UI.
 */

export const PERMISSIONS = {
  // ─── Справочники и настройки ──────────────────────────────────────────
  OFFICE_READ: 'office.read',
  OFFICE_MANAGE: 'office.manage',
  DICTIONARY_READ: 'dictionary.read',
  DICTIONARY_MANAGE: 'dictionary.manage',

  // ─── Пользователи и права ─────────────────────────────────────────────
  USER_READ: 'user.read',
  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',

  // ─── Транспорт ────────────────────────────────────────────────────────
  VEHICLE_READ: 'vehicle.read',
  VEHICLE_CREATE: 'vehicle.create',
  VEHICLE_UPDATE: 'vehicle.update',
  VEHICLE_DELETE: 'vehicle.delete',
  /** Перевод техники в другой офис — отдельное право, редкая и чувствительная операция */
  VEHICLE_TRANSFER: 'vehicle.transfer',
  VEHICLE_DOCUMENT_MANAGE: 'vehicle.document.manage',
  VEHICLE_METER_ADJUST: 'vehicle.meter.adjust',
  /**
   * Предрейсовый контроль технического состояния — право механика.
   *
   * Отделено от vehicle.update намеренно: диспетчер, правящий карточку
   * техники, не должен подписывать заключение о её исправности.
   */
  VEHICLE_TECHNICAL_INSPECT: 'vehicle.technical.inspect',

  // ─── Водители ─────────────────────────────────────────────────────────
  DRIVER_READ: 'driver.read',
  DRIVER_CREATE: 'driver.create',
  /** Правка карточки водителя, включая табельный номер */
  DRIVER_UPDATE: 'driver.update',
  DRIVER_DELETE: 'driver.delete',
  /** Удостоверения и допуски в зоны. Медосмотры сюда НЕ входят. */
  DRIVER_CLEARANCE_MANAGE: 'driver.clearance.manage',
  /**
   * Проведение медосмотров — право медработника здравпункта.
   *
   * Отделено от driver.clearance.manage намеренно: начальник автослужбы
   * не должен подписывать медосмотр, а врач — продлевать удостоверение.
   * Разделение и есть смысл предрейсового контроля.
   */
  DRIVER_MEDICAL_MANAGE: 'driver.medical.manage',

  // ─── ГСМ ──────────────────────────────────────────────────────────────
  FUEL_READ: 'fuel.read',
  /** Оприходование топлива в ёмкость */
  FUEL_RECEIPT_MANAGE: 'fuel.receipt.manage',
  /** Выдача топлива в бак техники */
  FUEL_ISSUE_CREATE: 'fuel.issue.create',
  FUEL_ISSUE_UPDATE: 'fuel.issue.update',
  FUEL_ISSUE_DELETE: 'fuel.issue.delete',
  FUEL_TANK_MANAGE: 'fuel.tank.manage',
  FUEL_CARD_MANAGE: 'fuel.card.manage',
  /** Правка норм расхода — влияет на все расчёты, отдельное право */
  FUEL_NORM_MANAGE: 'fuel.norm.manage',
  FUEL_INVENTORY_MANAGE: 'fuel.inventory.manage',

  // ─── Путевые листы ────────────────────────────────────────────────────
  WAYBILL_READ: 'waybill.read',
  WAYBILL_CREATE: 'waybill.create',
  WAYBILL_UPDATE: 'waybill.update',
  WAYBILL_ISSUE: 'waybill.issue',
  WAYBILL_CLOSE: 'waybill.close',
  WAYBILL_CANCEL: 'waybill.cancel',
  WAYBILL_PRINT: 'waybill.print',
  /** Изменение уже закрытого путевого листа — только руководитель */
  WAYBILL_REOPEN: 'waybill.reopen',
  /**
   * Выдача листа без предрейсового медосмотра.
   *
   * Отдельное право, а не часть waybill.issue: диспетчер не должен решать
   * этот вопрос сам. Отказ врача не обходится и этим правом — оно снимает
   * только отсутствие осмотра, например когда здравпункт закрыт и запись
   * переносится с бумаги позже.
   */
  WAYBILL_OVERRIDE_MEDICAL: 'waybill.override_medical',
  /**
   * Выдача листа без заключения механика под запись причины.
   * Отказ механика этим не снимается: неисправная техника на перрон
   * не выезжает ни по чьему распоряжению.
   */
  WAYBILL_OVERRIDE_TECHNICAL: 'waybill.override_technical',

  // ─── ТО и ремонты ─────────────────────────────────────────────────────
  MAINTENANCE_READ: 'maintenance.read',
  MAINTENANCE_MANAGE: 'maintenance.manage',
  WORK_ORDER_APPROVE: 'workorder.approve',
  /** Чтение номенклатуры ТМЦ */
  SPARE_PART_READ: 'sparepart.read',
  /** Правка номенклатуры и складов */
  SPARE_PART_MANAGE: 'sparepart.manage',

  // ─── Склад ТМЦ ────────────────────────────────────────────────────────
  /** Остатки, журнал движений, складские документы */
  STOCK_READ: 'stock.read',
  /** Оприходование от поставщика */
  STOCK_RECEIPT: 'stock.receipt',
  /**
   * Выдача и возврат. Возврат намеренно не отделён: это та же операция
   * в обратную сторону, у того же кладовщика, в том же окне выдачи.
   */
  STOCK_ISSUE: 'stock.issue',
  /**
   * Списание по акту — отдельное право, и по умолчанию его нет у кладовщика.
   *
   * Списание единственное уменьшает остаток без встречного документа:
   * ни получателя, ни техники, ни поставщика в нём нет. Именно через него
   * уходит недостача, поэтому подписывать его должен не тот, кто хранит.
   */
  STOCK_WRITE_OFF: 'stock.write_off',
  /** Перемещение между складами офиса */
  STOCK_TRANSFER: 'stock.transfer',

  // ─── Телематика ───────────────────────────────────────────────────────
  TELEMETRY_READ: 'telemetry.read',
  TELEMETRY_MANAGE: 'telemetry.manage',
  GEOFENCE_MANAGE: 'geofence.manage',

  // ─── Отчёты и аудит ───────────────────────────────────────────────────
  REPORT_READ: 'report.read',
  REPORT_EXPORT: 'report.export',
  /** Сводные отчёты по всем офисам страны */
  REPORT_CROSS_OFFICE: 'report.cross_office',
  AUDIT_READ: 'audit.read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/** Системные коды ролей. Роли с этими кодами seed создаёт и не даёт удалить. */
export const SYSTEM_ROLES = {
  /** Полный доступ ко всем офисам. Заводится только вручную. */
  SUPER_ADMIN: 'SUPER_ADMIN',
  /** Администратор своего офиса */
  OFFICE_ADMIN: 'OFFICE_ADMIN',
  /** Начальник службы спецтранспорта */
  FLEET_MANAGER: 'FLEET_MANAGER',
  /** Диспетчер — выдаёт и закрывает путевые листы */
  DISPATCHER: 'DISPATCHER',
  /** Оператор ГСМ / заправщик */
  FUEL_OPERATOR: 'FUEL_OPERATOR',
  /** Механик */
  MECHANIC: 'MECHANIC',
  /** Медработник здравпункта — предрейсовые осмотры и допуск к смене */
  MEDIC: 'MEDIC',
  /** Кладовщик — приём, хранение и выдача ТМЦ */
  STOREKEEPER: 'STOREKEEPER',
  /** Бухгалтер — читает всё, правит ничего, выгружает отчёты */
  ACCOUNTANT: 'ACCOUNTANT',
  /** Водитель — свой профиль и свои путевые листы (мобильное приложение) */
  DRIVER: 'DRIVER',
  /** Наблюдатель — только чтение */
  VIEWER: 'VIEWER',
} as const;
export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

const P = PERMISSIONS;

/** Стартовая раскладка прав по ролям. Используется seed'ом. */
export const DEFAULT_ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  [SYSTEM_ROLES.SUPER_ADMIN]: ALL_PERMISSIONS,

  [SYSTEM_ROLES.OFFICE_ADMIN]: ALL_PERMISSIONS.filter(
    (p) => p !== P.REPORT_CROSS_OFFICE,
  ),

  [SYSTEM_ROLES.FLEET_MANAGER]: [
    P.OFFICE_READ, P.DICTIONARY_READ, P.USER_READ,
    P.VEHICLE_READ, P.VEHICLE_CREATE, P.VEHICLE_UPDATE, P.VEHICLE_TRANSFER,
    P.VEHICLE_DOCUMENT_MANAGE, P.VEHICLE_METER_ADJUST,
    P.DRIVER_READ, P.DRIVER_CREATE, P.DRIVER_UPDATE, P.DRIVER_CLEARANCE_MANAGE,
    P.FUEL_READ, P.FUEL_NORM_MANAGE, P.FUEL_INVENTORY_MANAGE,
    P.WAYBILL_READ, P.WAYBILL_CREATE, P.WAYBILL_ISSUE, P.WAYBILL_CLOSE,
    P.WAYBILL_CANCEL, P.WAYBILL_PRINT, P.WAYBILL_REOPEN,
    P.MAINTENANCE_READ, P.MAINTENANCE_MANAGE, P.WORK_ORDER_APPROVE,
    // Начальник автослужбы списывает и перемещает, но не выдаёт:
    // выдача — работа кладовщика, а подпись под списанием — его.
    P.SPARE_PART_READ, P.SPARE_PART_MANAGE,
    P.STOCK_READ, P.STOCK_WRITE_OFF, P.STOCK_TRANSFER,
    P.TELEMETRY_READ, P.GEOFENCE_MANAGE,
    P.REPORT_READ, P.REPORT_EXPORT, P.AUDIT_READ,
  ],

  [SYSTEM_ROLES.DISPATCHER]: [
    P.OFFICE_READ, P.DICTIONARY_READ,
    P.VEHICLE_READ, P.DRIVER_READ,
    P.FUEL_READ, P.FUEL_ISSUE_CREATE,
    P.WAYBILL_READ, P.WAYBILL_CREATE, P.WAYBILL_UPDATE, P.WAYBILL_ISSUE,
    P.WAYBILL_CLOSE, P.WAYBILL_CANCEL, P.WAYBILL_PRINT,
    P.MAINTENANCE_READ, P.TELEMETRY_READ, P.REPORT_READ,
  ],

  [SYSTEM_ROLES.FUEL_OPERATOR]: [
    P.OFFICE_READ, P.DICTIONARY_READ, P.VEHICLE_READ, P.DRIVER_READ,
    P.FUEL_READ, P.FUEL_RECEIPT_MANAGE, P.FUEL_ISSUE_CREATE,
    P.FUEL_ISSUE_UPDATE, P.FUEL_TANK_MANAGE, P.FUEL_CARD_MANAGE,
    P.FUEL_INVENTORY_MANAGE,
    P.WAYBILL_READ, P.REPORT_READ,
  ],

  [SYSTEM_ROLES.MECHANIC]: [
    P.OFFICE_READ, P.DICTIONARY_READ, P.VEHICLE_READ, P.VEHICLE_UPDATE,
    P.VEHICLE_METER_ADJUST, P.VEHICLE_TECHNICAL_INSPECT, P.DRIVER_READ, P.WAYBILL_READ,
    P.MAINTENANCE_READ, P.MAINTENANCE_MANAGE,
    // Механик получает ТМЦ, но не выдаёт их сам: иначе подпись выдавшего
    // и подпись получившего окажутся одной и той же.
    P.SPARE_PART_READ, P.STOCK_READ, P.REPORT_READ,
  ],

  /*
   * Медработник намеренно почти ничего не может: только видеть водителей
   * и проводить осмотры. Ни путевых листов, ни техники, ни ГСМ — его
   * подпись должна значить медицинское заключение, и ничего сверх того.
   */
  [SYSTEM_ROLES.MEDIC]: [
    P.OFFICE_READ, P.DICTIONARY_READ,
    P.DRIVER_READ, P.DRIVER_MEDICAL_MANAGE,
  ],

  /*
   * Кладовщик: номенклатура, склады, приход, выдача, возврат.
   *
   * Списания среди прав нет намеренно — см. комментарий к STOCK_WRITE_OFF.
   * Техника и водители доступны только на чтение: без них нельзя заполнить
   * «на какую машину» и «кто получил», а это обязательные поля выдачи.
   */
  [SYSTEM_ROLES.STOREKEEPER]: [
    P.OFFICE_READ, P.DICTIONARY_READ,
    P.VEHICLE_READ, P.DRIVER_READ, P.USER_READ,
    P.SPARE_PART_READ, P.SPARE_PART_MANAGE,
    P.STOCK_READ, P.STOCK_RECEIPT, P.STOCK_ISSUE, P.STOCK_TRANSFER,
    P.MAINTENANCE_READ, P.REPORT_READ,
  ],

  [SYSTEM_ROLES.ACCOUNTANT]: [
    P.OFFICE_READ, P.DICTIONARY_READ, P.VEHICLE_READ, P.DRIVER_READ,
    P.FUEL_READ, P.WAYBILL_READ, P.WAYBILL_PRINT,
    P.MAINTENANCE_READ, P.SPARE_PART_READ, P.STOCK_READ,
    P.REPORT_READ, P.REPORT_EXPORT, P.AUDIT_READ,
  ],

  [SYSTEM_ROLES.DRIVER]: [
    P.VEHICLE_READ, P.WAYBILL_READ,
  ],

  [SYSTEM_ROLES.VIEWER]: [
    P.OFFICE_READ, P.DICTIONARY_READ, P.VEHICLE_READ, P.DRIVER_READ,
    P.FUEL_READ, P.WAYBILL_READ, P.MAINTENANCE_READ, P.STOCK_READ,
    P.REPORT_READ,
  ],
};

/** Человекочитаемые названия ролей для UI. */
export const ROLE_LABELS: Record<SystemRole, { ru: string; uz: string; en: string }> = {
  [SYSTEM_ROLES.SUPER_ADMIN]: { ru: 'Суперадминистратор', uz: 'Superadministrator', en: 'Super admin' },
  [SYSTEM_ROLES.OFFICE_ADMIN]: { ru: 'Администратор офиса', uz: 'Ofis administratori', en: 'Office admin' },
  [SYSTEM_ROLES.FLEET_MANAGER]: { ru: 'Начальник автослужбы', uz: 'Avtoxizmat boshlig‘i', en: 'Fleet manager' },
  [SYSTEM_ROLES.DISPATCHER]: { ru: 'Диспетчер', uz: 'Dispetcher', en: 'Dispatcher' },
  [SYSTEM_ROLES.FUEL_OPERATOR]: { ru: 'Оператор ГСМ', uz: 'YoMM operatori', en: 'Fuel operator' },
  [SYSTEM_ROLES.MECHANIC]: { ru: 'Механик', uz: 'Mexanik', en: 'Mechanic' },
  [SYSTEM_ROLES.MEDIC]: { ru: 'Медработник', uz: 'Tibbiyot xodimi', en: 'Medic' },
  [SYSTEM_ROLES.STOREKEEPER]: { ru: 'Кладовщик', uz: 'Omborchi', en: 'Storekeeper' },
  [SYSTEM_ROLES.ACCOUNTANT]: { ru: 'Бухгалтер', uz: 'Buxgalter', en: 'Accountant' },
  [SYSTEM_ROLES.DRIVER]: { ru: 'Водитель', uz: 'Haydovchi', en: 'Driver' },
  [SYSTEM_ROLES.VIEWER]: { ru: 'Наблюдатель', uz: 'Kuzatuvchi', en: 'Viewer' },
};
