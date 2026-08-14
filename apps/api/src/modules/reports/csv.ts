/**
 * Выгрузка в CSV.
 *
 * Два неочевидных решения, оба ради того, чтобы файл открывался двойным
 * щелчком в Excel с русской локалью, а не превращался в один столбец
 * с кракозябрами:
 *   • разделитель — точка с запятой (в ru-локали Excel запятая занята
 *     под десятичный разделитель);
 *   • в начало файла пишется BOM, иначе Excel читает UTF-8 как ANSI.
 */

export interface CsvColumn<T> {
  key: keyof T & string;
  title: string;
  /** Преобразование значения; по умолчанию — как есть. */
  format?: (value: T[keyof T & string], row: T) => string | number | null;
}

const DELIMITER = ';';
const BOM = '﻿';

function escape(value: unknown): string {
  if (value === null || value === undefined) return '';

  // Дробные числа — с запятой: иначе Excel в ru-локали считает их текстом.
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
  }

  const text = String(value);
  if (text.includes(DELIMITER) || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// Ограничение — просто «объект»: интерфейсы отчётов не имеют индексной
// сигнатуры, и Record<string, unknown> их бы не принял.
export function toCsv<T extends object>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escape(c.title)).join(DELIMITER);
  const body = rows.map((row) =>
    columns
      .map((column) => {
        const raw = row[column.key];
        return escape(column.format ? column.format(raw as never, row) : raw);
      })
      .join(DELIMITER),
  );

  return BOM + [header, ...body].join('\r\n');
}

/** Имя файла с датой — иначе в папке «Загрузки» окажется десять report.csv. */
export function csvFileName(prefix: string, from: Date, to: Date): string {
  const date = (value: Date): string => value.toISOString().slice(0, 10);
  return `${prefix}_${date(from)}_${date(to)}.csv`;
}
