import dayjs from 'dayjs';
import type { TFunction } from 'i18next';
import type { ColumnType } from 'antd/es/table';

/** Колонка «Дата создания записи» — одинаковая во всех таблицах. */
export function createdAtColumn<T extends object>(t: TFunction): ColumnType<T> {
  return {
    title: t('Дата создания'),
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 150,
    render: (value?: string | null) =>
      value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—',
  };
}

/** Сначала самые новые: по дате создания, при равенстве — по номеру записи. */
export function newestFirst<T extends { id: number; createdAt?: string | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const byDate = (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    return byDate !== 0 ? byDate : b.id - a.id;
  });
}
