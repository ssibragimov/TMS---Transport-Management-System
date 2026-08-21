/**
 * Товарно-материальные ценности: номенклатура, склады и движения.
 *
 * Ключевое правило блока: правда — это журнал движений, а не поле остатка.
 * Остаток (stock_balances) хранится только ради скорости и всегда обязан
 * совпадать с суммой движений по той же паре «склад — позиция». Отсюда
 * знаковое количество: приход записывается со знаком плюс, расход — минус,
 * и остаток буквально равен SUM(quantity). Без этого правила отчёт
 * «оборотная ведомость» пришлось бы собирать по списку исключений,
 * а расхождение при инвентаризации было бы нечем объяснить.
 *
 * ВАЖНО: значения перечислений обязаны совпадать с prisma/schema.prisma.
 */

// ─── Номенклатура ───────────────────────────────────────────────────────────

/**
 * Категория позиции. Нужна не для красоты: по ней собираются отчёты
 * («сколько ушло масла за квартал») и настраиваются нормы выдачи.
 */
export const StockCategory = {
  /** Масла и смазки */
  OIL: 'OIL',
  /** Фильтры */
  FILTER: 'FILTER',
  /** Шины и камеры */
  TIRE: 'TIRE',
  /** Аккумуляторные батареи */
  BATTERY: 'BATTERY',
  /** Тормозная система */
  BRAKE: 'BRAKE',
  /** Электрооборудование, лампы, проблесковые маячки */
  ELECTRIC: 'ELECTRIC',
  /** Технические жидкости: антифриз, тормозная, омывайка, реагенты */
  FLUID: 'FLUID',
  /** Запасные части общего назначения */
  SPARE: 'SPARE',
  /** Крепёж и мелкие расходники */
  HARDWARE: 'HARDWARE',
  /** Инструмент и инвентарь */
  TOOL: 'TOOL',
  /** Спецодежда и средства защиты */
  PPE: 'PPE',
  OTHER: 'OTHER',
} as const;
export type StockCategory = (typeof StockCategory)[keyof typeof StockCategory];

export const STOCK_CATEGORY_LABEL: Record<StockCategory, string> = {
  OIL: 'Масла и смазки',
  FILTER: 'Фильтры',
  TIRE: 'Шины',
  BATTERY: 'Аккумуляторы',
  BRAKE: 'Тормозная система',
  ELECTRIC: 'Электрооборудование',
  FLUID: 'Технические жидкости',
  SPARE: 'Запасные части',
  HARDWARE: 'Крепёж и расходники',
  TOOL: 'Инструмент и инвентарь',
  PPE: 'Спецодежда и СИЗ',
  OTHER: 'Прочее',
};

/**
 * Способ учёта позиции.
 *
 * Масло считают литрами, а аккумулятор — штуками с номером: у него своя
 * история, свой срок службы и свой ответ на вопрос «почему эта батарея
 * умерла за полгода». Поштучный учёт (SERIAL) вводится следующим этапом;
 * поле заполняется уже сейчас, чтобы номенклатура была размечена заранее
 * и переход не потребовал ручной разметки сотен позиций.
 */
export const StockTracking = {
  /** По количеству: масло, фильтры, лампы */
  QUANTITY: 'QUANTITY',
  /** Поштучно с серийным номером: аккумуляторы, шины, рации */
  SERIAL: 'SERIAL',
  /** Партиями со сроком годности */
  BATCH: 'BATCH',
} as const;
export type StockTracking = (typeof StockTracking)[keyof typeof StockTracking];

export const STOCK_TRACKING_LABEL: Record<StockTracking, string> = {
  QUANTITY: 'По количеству',
  SERIAL: 'Поштучно, с номером',
  BATCH: 'По партиям',
};

// ─── Склады ─────────────────────────────────────────────────────────────────

/**
 * Назначение склада.
 *
 * Отработанные материалы — не мусор, а подотчётные ценности: свинец
 * в аккумуляторах стоит денег, отработка сдаётся по акту, и за неё
 * спрашивают. Поэтому у отработанного своё место хранения, а «сколько
 * накоплено к сдаче» — это просто остаток склада UTILIZATION.
 */
export const WarehouseKind = {
  /** Основной склад офиса */
  MAIN: 'MAIN',
  /** Кладовая при гараже, участке, смене */
  SUB: 'SUB',
  /** Накопитель отработанных материалов до сдачи на утилизацию */
  UTILIZATION: 'UTILIZATION',
} as const;
export type WarehouseKind = (typeof WarehouseKind)[keyof typeof WarehouseKind];

export const WAREHOUSE_KIND_LABEL: Record<WarehouseKind, string> = {
  MAIN: 'Основной склад',
  SUB: 'Кладовая',
  UTILIZATION: 'Отработанные материалы',
};

// ─── Документы ──────────────────────────────────────────────────────────────

export const StockDocumentKind = {
  /** Приход от поставщика */
  RECEIPT: 'RECEIPT',
  /** Выдача в эксплуатацию: на технику, работнику, по наряд-заказу */
  ISSUE: 'ISSUE',
  /** Возврат неиспользованного на склад */
  RETURN: 'RETURN',
  /** Списание по акту */
  WRITE_OFF: 'WRITE_OFF',
  /** Перемещение между складами */
  TRANSFER: 'TRANSFER',
} as const;
export type StockDocumentKind =
  (typeof StockDocumentKind)[keyof typeof StockDocumentKind];

export const STOCK_DOCUMENT_LABEL: Record<StockDocumentKind, string> = {
  RECEIPT: 'Приход',
  ISSUE: 'Выдача',
  RETURN: 'Возврат',
  WRITE_OFF: 'Списание',
  TRANSFER: 'Перемещение',
};

/** Основание выдачи. Попадает в отчёт и в разбор «почему выдали раньше срока». */
export const StockIssuePurpose = {
  /** Плановая замена по регламенту */
  SCHEDULED: 'SCHEDULED',
  /** Замена по износу или отказу */
  REPLACEMENT: 'REPLACEMENT',
  /** Ремонт по наряд-заказу */
  REPAIR: 'REPAIR',
  /** Аварийная выдача: техника стоит на перроне */
  EMERGENCY: 'EMERGENCY',
  /** Обеспечение работника: спецодежда, инструмент */
  SUPPLY: 'SUPPLY',
  OTHER: 'OTHER',
} as const;
export type StockIssuePurpose =
  (typeof StockIssuePurpose)[keyof typeof StockIssuePurpose];

export const STOCK_PURPOSE_LABEL: Record<StockIssuePurpose, string> = {
  SCHEDULED: 'Плановая замена',
  REPLACEMENT: 'Замена по износу',
  REPAIR: 'Ремонт по наряд-заказу',
  EMERGENCY: 'Аварийная выдача',
  SUPPLY: 'Обеспечение работника',
  OTHER: 'Прочее',
};

// ─── Движения ───────────────────────────────────────────────────────────────

export const StockMovementType = {
  RECEIPT: 'RECEIPT',
  ISSUE: 'ISSUE',
  RETURN: 'RETURN',
  /** Приём отработанного при обмене «старое на новое» */
  USED_RETURN: 'USED_RETURN',
  WRITE_OFF: 'WRITE_OFF',
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
  /** Корректировка по результатам инвентаризации */
  INVENTORY_ADJ: 'INVENTORY_ADJ',
} as const;
export type StockMovementType =
  (typeof StockMovementType)[keyof typeof StockMovementType];

export const STOCK_MOVEMENT_LABEL: Record<StockMovementType, string> = {
  RECEIPT: 'Приход',
  ISSUE: 'Выдача',
  RETURN: 'Возврат на склад',
  USED_RETURN: 'Приём отработанного',
  WRITE_OFF: 'Списание',
  TRANSFER_OUT: 'Перемещение со склада',
  TRANSFER_IN: 'Перемещение на склад',
  INVENTORY_ADJ: 'Корректировка по инвентаризации',
};

/**
 * Знак движения: +1 увеличивает остаток, −1 уменьшает.
 *
 * У корректировки знака нет: она принимает и недостачу, и излишек,
 * поэтому её количество приходит из документа уже со знаком.
 */
const SIGN: Record<StockMovementType, 1 | -1 | 0> = {
  RECEIPT: 1,
  ISSUE: -1,
  RETURN: 1,
  USED_RETURN: 1,
  WRITE_OFF: -1,
  TRANSFER_OUT: -1,
  TRANSFER_IN: 1,
  INVENTORY_ADJ: 0,
};

export function movementSign(type: StockMovementType): 1 | -1 | 0 {
  return SIGN[type];
}

/**
 * Приводит введённое кладовщиком количество к знаковому виду для журнала.
 *
 * Кладовщик всегда вводит положительное число — он думает «выдал пять
 * литров», а не «минус пять». Знак ставит система, один раз и в одном месте:
 * если это отдать на откуп каждому обработчику, рано или поздно один
 * из них ошибётся, и остаток разойдётся с журналом.
 */
export function signedQuantity(type: StockMovementType, quantity: number): number {
  const sign = SIGN[type];
  return sign === 0 ? quantity : Math.abs(quantity) * sign;
}

/**
 * Средневзвешенная цена после прихода.
 *
 * Считается здесь, а не в сервисе, чтобы форма прихода могла показать
 * будущую себестоимость до проведения документа: «было 62 000, станет 64 300».
 * Отрицательный или нулевой итоговый остаток означает ошибку вызывающего —
 * возвращаем прежнюю цену, а не делим на ноль.
 */
export function movingAveragePrice(
  currentQuantity: number,
  currentPrice: number,
  incomingQuantity: number,
  incomingPrice: number,
): number {
  const total = currentQuantity + incomingQuantity;
  if (total <= 0) return currentPrice;
  return (currentQuantity * currentPrice + incomingQuantity * incomingPrice) / total;
}
