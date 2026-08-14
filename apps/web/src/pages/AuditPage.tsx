import { useQuery } from '@tanstack/react-query';
import {
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { PERMISSIONS } from '@gsm/shared';

import { api } from '@/api/client';
import { usePaged } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddress: string | null;
  requestId: string | null;
  createdAt: string;
  officeId: number | null;
  user: { id: number; fullName: string; email: string } | null;
}

const ACTION_LABEL: Record<string, string> = {
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

const ACTION_COLOR: Record<string, string> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  APPROVE: 'cyan',
  REJECT: 'orange',
  EXPORT: 'purple',
  LOGIN: 'default',
  LOGIN_FAILED: 'red',
};

const ENTITY_LABEL: Record<string, string> = {
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
  SparePart: 'Запчасть',
  VehiclePhoto: 'Фото техники',
  VehicleDocument: 'Документ техники',
  VehicleMeterReading: 'Показания счётчика',
  DriverLicense: 'Удостоверение',
  DriverPermit: 'Допуск водителя',
  MedicalCheck: 'Медосмотр',
  UserPassword: 'Пароль пользователя',
};

/** Человекочитаемое значение поля: null и объекты иначе выглядят как «[object]». */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function AuditPage() {
  const { can } = useAuth();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [action, setAction] = useState<string | undefined>();
  const [entity, setEntity] = useState<string | undefined>();
  const [entityId, setEntityId] = useState('');
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const query = usePaged<AuditRow>(['audit'], '/audit', {
    page,
    pageSize,
    action,
    entity,
    entityId: entityId || undefined,
    dateFrom: range?.[0]?.format('YYYY-MM-DD'),
    dateTo: range?.[1]?.format('YYYY-MM-DD'),
  });

  const entities = useQuery({
    queryKey: ['audit-entities'],
    queryFn: async () =>
      (await api.get<Array<{ entity: string; count: number }>>('/audit/entities')).data,
  });

  if (!can(PERMISSIONS.AUDIT_READ)) {
    return <Typography.Text type="danger">Нет прав на просмотр журнала</Typography.Text>;
  }

  // Поля, изменившиеся в этой записи: объединение ключей «до» и «после».
  const changedKeys = selected
    ? [...new Set([...Object.keys(selected.before ?? {}), ...Object.keys(selected.after ?? {})])]
    : [];

  return (
    <Card
      title="Журнал действий"
      extra={
        <Space wrap>
          <DatePicker.RangePicker
            format="DD.MM.YYYY"
            onChange={(value) => {
              setRange(value as [dayjs.Dayjs, dayjs.Dayjs] | null);
              setPage(1);
            }}
          />
          <Select
            allowClear
            placeholder="Объект"
            style={{ width: 190 }}
            value={entity}
            onChange={(value) => {
              setEntity(value);
              setPage(1);
            }}
            options={(entities.data ?? []).map((item) => ({
              value: item.entity,
              label: `${ENTITY_LABEL[item.entity] ?? item.entity} (${item.count})`,
            }))}
          />
          <Select
            allowClear
            placeholder="Действие"
            style={{ width: 170 }}
            value={action}
            onChange={(value) => {
              setAction(value);
              setPage(1);
            }}
            options={Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }))}
          />
          <Input
            allowClear
            placeholder="ID объекта"
            style={{ width: 130 }}
            value={entityId}
            onChange={(event) => {
              setEntityId(event.target.value);
              setPage(1);
            }}
          />
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">
        Журнал только для чтения — записи нельзя изменить или удалить ни через интерфейс,
        ни через API. Для изменений сохраняются лишь те поля, которые действительно
        поменялись.
      </Typography.Paragraph>

      <Table<AuditRow>
        rowKey="id"
        size="small"
        loading={query.isLoading}
        dataSource={query.data?.items ?? []}
        onRow={(row) => ({ onClick: () => setSelected(row), style: { cursor: 'pointer' } })}
        pagination={{
          current: page,
          pageSize,
          total: query.data?.meta.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `Записей: ${total}`,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          },
        }}
        columns={[
          {
            title: 'Дата и время',
            dataIndex: 'createdAt',
            width: 160,
            render: (value: string) => dayjs(value).format('DD.MM.YYYY HH:mm:ss'),
          },
          {
            title: 'Пользователь',
            width: 220,
            render: (_: unknown, row: AuditRow) =>
              row.user ? (
                <Space direction="vertical" size={0}>
                  <span>{row.user.fullName}</span>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {row.user.email}
                  </Typography.Text>
                </Space>
              ) : (
                <Typography.Text type="secondary">система</Typography.Text>
              ),
          },
          {
            title: 'Действие',
            dataIndex: 'action',
            width: 140,
            render: (value: string) => (
              <Tag color={ACTION_COLOR[value] ?? 'default'}>{ACTION_LABEL[value] ?? value}</Tag>
            ),
          },
          {
            title: 'Объект',
            dataIndex: 'entity',
            width: 170,
            render: (value: string) => ENTITY_LABEL[value] ?? value,
          },
          { title: 'ID', dataIndex: 'entityId', width: 80 },
          {
            title: 'Изменённые поля',
            render: (_: unknown, row: AuditRow) => {
              const keys = [
                ...new Set([...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})]),
              ];
              if (keys.length === 0) return <Typography.Text type="secondary">—</Typography.Text>;
              return (
                <Space size={[0, 4]} wrap>
                  {keys.slice(0, 5).map((key) => (
                    <Tag key={key}>{key}</Tag>
                  ))}
                  {keys.length > 5 && <Tag>+{keys.length - 5}</Tag>}
                </Space>
              );
            },
          },
          { title: 'IP', dataIndex: 'ipAddress', width: 130 },
        ]}
      />

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        width={720}
        title={
          selected
            ? `${ACTION_LABEL[selected.action] ?? selected.action}: ${ENTITY_LABEL[selected.entity] ?? selected.entity}${selected.entityId ? ` #${selected.entityId}` : ''}`
            : 'Запись журнала'
        }
      >
        {selected && (
          <>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Когда">
                {dayjs(selected.createdAt).format('DD.MM.YYYY HH:mm:ss')}
              </Descriptions.Item>
              <Descriptions.Item label="Кто">
                {selected.user
                  ? `${selected.user.fullName} (${selected.user.email})`
                  : 'система'}
              </Descriptions.Item>
              <Descriptions.Item label="IP-адрес">
                {selected.ipAddress ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Идентификатор запроса">
                <Typography.Text code copyable>
                  {selected.requestId ?? '—'}
                </Typography.Text>
              </Descriptions.Item>
            </Descriptions>

            <h4 style={{ marginTop: 24 }}>Что изменилось</h4>
            {changedKeys.length === 0 ? (
              <Empty description="Изменённых полей не зафиксировано" />
            ) : (
              <Table
                size="small"
                pagination={false}
                rowKey="field"
                dataSource={changedKeys.map((key) => ({
                  field: key,
                  before: selected.before?.[key],
                  after: selected.after?.[key],
                }))}
                columns={[
                  { title: 'Поле', dataIndex: 'field', width: 200 },
                  {
                    title: 'Было',
                    dataIndex: 'before',
                    render: (value: unknown) => (
                      <Typography.Text type="secondary" delete={value !== undefined}>
                        {renderValue(value)}
                      </Typography.Text>
                    ),
                  },
                  {
                    title: 'Стало',
                    dataIndex: 'after',
                    render: (value: unknown) => (
                      <Typography.Text strong>{renderValue(value)}</Typography.Text>
                    ),
                  },
                ]}
              />
            )}
          </>
        )}
      </Drawer>
    </Card>
  );
}
