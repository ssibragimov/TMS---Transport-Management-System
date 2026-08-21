/**
 * Нумерация документов.
 *
 * Номера обязаны быть уникальны в разрезе офиса и года и не должны конфликтовать
 * при сведении данных всех аэропортов в один отчёт. Отсюда формат с кодом офиса.
 * Последовательность выдаётся из таблицы document_sequences под блокировкой строки —
 * не из sequence PostgreSQL, потому что нумерация должна быть без пропусков
 * (пропуск номера в путевых листах — вопрос от проверяющего).
 */

export const DocumentKind = {
  WAYBILL: 'WAYBILL',
  FUEL_RECEIPT: 'FUEL_RECEIPT',
  FUEL_ISSUE: 'FUEL_ISSUE',
  WORK_ORDER: 'WORK_ORDER',
  INVENTORY_ACT: 'INVENTORY_ACT',
  /** Акт о состоянии техники при возврате из смены */
  CONDITION_ACT: 'CONDITION_ACT',

  /*
   * Склад ТМЦ. Каждый вид документа нумеруется своей серией: кладовщик
   * сдаёт отчётность по каждой из них отдельно, а сплошная сквозная
   * нумерация «всех складских документов подряд» превращает сверку
   * прихода за месяц в перебор журнала.
   */
  STOCK_RECEIPT: 'STOCK_RECEIPT',
  STOCK_ISSUE: 'STOCK_ISSUE',
  STOCK_RETURN: 'STOCK_RETURN',
  STOCK_WRITE_OFF: 'STOCK_WRITE_OFF',
  STOCK_TRANSFER: 'STOCK_TRANSFER',
} as const;
export type DocumentKind = (typeof DocumentKind)[keyof typeof DocumentKind];

const PREFIX: Record<DocumentKind, string> = {
  [DocumentKind.WAYBILL]: 'PL',
  [DocumentKind.FUEL_RECEIPT]: 'GSM-P',
  [DocumentKind.FUEL_ISSUE]: 'GSM-V',
  [DocumentKind.WORK_ORDER]: 'NZ',
  [DocumentKind.INVENTORY_ACT]: 'INV',
  [DocumentKind.CONDITION_ACT]: 'AKT',
  [DocumentKind.STOCK_RECEIPT]: 'TMC-P',
  [DocumentKind.STOCK_ISSUE]: 'TMC-V',
  [DocumentKind.STOCK_RETURN]: 'TMC-VZ',
  [DocumentKind.STOCK_WRITE_OFF]: 'TMC-SP',
  [DocumentKind.STOCK_TRANSFER]: 'TMC-PM',
};

export interface DocumentNumberParts {
  kind: DocumentKind;
  officeCode: string;
  year: number;
  sequence: number;
}

/** Формат: `PL-TAS-2026-000123` */
export function formatDocumentNumber(parts: DocumentNumberParts): string {
  const seq = String(parts.sequence).padStart(6, '0');
  return `${PREFIX[parts.kind]}-${parts.officeCode}-${parts.year}-${seq}`;
}

const NUMBER_RE = /^([A-Z-]+)-([A-Z]{3})-(\d{4})-(\d{6})$/;

export function parseDocumentNumber(value: string): DocumentNumberParts | null {
  const match = NUMBER_RE.exec(value.trim().toUpperCase());
  if (!match) return null;

  const [, prefix, officeCode, year, sequence] = match;
  const kind = (Object.keys(PREFIX) as DocumentKind[]).find((k) => PREFIX[k] === prefix);
  if (!kind) return null;

  return {
    kind,
    officeCode,
    year: Number(year),
    sequence: Number(sequence),
  };
}
