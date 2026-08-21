import { useQuery } from '@tanstack/react-query';
import { Empty, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@gsm/shared';

import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { ACTION_COLOR, ACTION_LABEL, AUDIT_ENTITY_LABEL } from '@/lib/labels';

/**
 * Журнал действий по одной записи — вкладка в карточке сущности.
 *
 * Запрос идёт по relatedEntity/relatedId, а не по entity/entityId: так в
 * журнал техники попадают и операции над её вложенными объектами — загрузка
 * фотографии, правка документа, корректировка счётчика. Они пишутся под
 * своими именами и со своими идентификаторами, и по прямому фильтру
 * не нашлись бы (см. parentEntity в AuditInterceptor).
 *
 * Показываются последние записи без разбивки на страницы: карточка — это
 * быстрый взгляд «кто и что менял», а полный разбор с фильтрами живёт
 * в разделе «Журнал действий».
 */
interface EntityAuditLogProps {
  /** Имя сущности в журнале: Vehicle, Driver, Waybill, User. */
  entity: string;
  entityId: number | string | undefined;
  /** Сколько последних записей показывать. */
  limit?: number;
}

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  user: { id: number; fullName: string } | null;
}

export function EntityAuditLog({ entity, entityId, limit = 50 }: EntityAuditLogProps) {
  const { t } = useTranslation();
  const { can } = useAuth();

  const allowed = can(PERMISSIONS.AUDIT_READ);

  const query = useQuery({
    queryKey: ['entity-audit', entity, entityId, limit],
    enabled: allowed && entityId !== undefined,
    queryFn: async () => {
      const { data } = await api.get<{ items: AuditRow[]; meta: { total: number } }>(
        '/audit',
        {
          params: {
            relatedEntity: entity,
            relatedId: String(entityId),
            pageSize: limit,
          },
        },
      );
      return data;
    },
  });

  if (!allowed) {
    return (
      <Typography.Text type="secondary">
        {t('Нет прав на просмотр журнала действий')}
      </Typography.Text>
    );
  }

  return (
    <>
      <Typography.Paragraph type="secondary">
        {t('Показаны последние изменения этой записи и связанных с ней объектов. Полный журнал с фильтрами — в разделе «Журнал действий».')}
      </Typography.Paragraph>

      <Table<AuditRow>
        rowKey="id"
        size="small"
        loading={query.isLoading}
        dataSource={query.data?.items ?? []}
        pagination={false}
        scroll={{ y: 420 }}
        locale={{ emptyText: <Empty description={t('Изменений не зафиксировано')} /> }}
        columns={[
          {
            title: t('Дата и время'),
            dataIndex: 'createdAt',
            width: 150,
            render: (value: string) => dayjs(value).format('DD.MM.YYYY HH:mm:ss'),
          },
          {
            title: t('Действие'),
            dataIndex: 'action',
            width: 130,
            render: (value: string) => (
              <Tag color={ACTION_COLOR[value] ?? 'default'}>
                {t(ACTION_LABEL[value] ?? value)}
              </Tag>
            ),
          },
          {
            // Колонка нужна, потому что в списке смешаны записи о самой
            // сущности и о вложенных: без неё непонятно, к чему относится строка.
            title: t('Объект'),
            dataIndex: 'entity',
            width: 150,
            render: (value: string) => t(AUDIT_ENTITY_LABEL[value] ?? value),
          },
          {
            title: t('Кто'),
            width: 180,
            render: (_: unknown, row: AuditRow) =>
              row.user?.fullName ?? (
                <Typography.Text type="secondary">{t('система')}</Typography.Text>
              ),
          },
          {
            title: t('Изменённые поля'),
            render: (_: unknown, row: AuditRow) => {
              const keys = [
                ...new Set([...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})]),
              ];
              if (keys.length === 0) {
                return <Typography.Text type="secondary">—</Typography.Text>;
              }
              return (
                <Space size={[0, 4]} wrap>
                  {keys.slice(0, 4).map((key) => (
                    <Tag key={key}>{key}</Tag>
                  ))}
                  {keys.length > 4 && <Tag>+{keys.length - 4}</Tag>}
                </Space>
              );
            },
          },
        ]}
      />
    </>
  );
}
