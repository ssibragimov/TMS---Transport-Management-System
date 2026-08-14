import { PlusOutlined } from '@ant-design/icons';
import { Button, DatePicker, Input, Select, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS, WaybillStatus } from '@gsm/shared';

import { usePaged } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { StickyTable } from '@/components/StickyTable';
import { TableCard } from '@/components/TableCard';
import {
  WAYBILL_STATUS_COLOR,
  WAYBILL_STATUS_LABEL,
  deviationColor,
  fmt,
} from '@/lib/labels';

import { WaybillDrawer } from './waybills/WaybillDrawer';
import { WaybillFormModal } from './waybills/WaybillFormModal';

interface WaybillRow {
  id: number;
  number: string;
  status: string;
  validFrom: string;
  validTo: string;
  fuelNorm: string | null;
  fuelConsumed: string | null;
  fuelDeviationPct: string | null;
  distanceKm: string | null;
  vehicle: { garageNumber: string; plateNumber: string | null } | null;
  driver: { lastName: string; firstName: string } | null;
}

export function WaybillsPage() {
  const { can } = useAuth();
  const { t } = useTranslation();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [onlyOverrun, setOnlyOverrun] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const query = usePaged<WaybillRow>(['waybills'], '/waybills', {
    page,
    pageSize,
    search: search || undefined,
    status,
    dateFrom: range?.[0]?.format('YYYY-MM-DD'),
    dateTo: range?.[1]?.format('YYYY-MM-DD'),
    deviationOver: onlyOverrun ? 10 : undefined,
  });

  if (!can(PERMISSIONS.WAYBILL_READ)) {
    return <Typography.Text type="danger">{t('Нет прав на просмотр путевых листов')}</Typography.Text>;
  }

  return (
    <TableCard
      title={t('Путевые листы')}
      extra={
        <Space wrap>
          <Input.Search
            allowClear
            placeholder={t('Номер листа')}
            style={{ width: 200 }}
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
          <DatePicker.RangePicker
            format="DD.MM.YYYY"
            onChange={(value) => {
              setRange(value as [dayjs.Dayjs, dayjs.Dayjs] | null);
              setPage(1);
            }}
          />
          <Select
            allowClear
            placeholder={t('Статус')}
            style={{ width: 160 }}
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={Object.values(WaybillStatus).map((s) => ({
              value: s,
              label: t(WAYBILL_STATUS_LABEL[s] ?? s),
            }))}
          />
          {/* Быстрый фильтр «где перерасход» — главный сценарий работы с журналом. */}
          <Button
            type={onlyOverrun ? 'primary' : 'default'}
            danger={onlyOverrun}
            onClick={() => {
              setOnlyOverrun((value) => !value);
              setPage(1);
            }}
          >
            {t('Только перерасход')}
          </Button>
          {can(PERMISSIONS.WAYBILL_CREATE) && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              {t('Создать')}
            </Button>
          )}
        </Space>
      }
    >
      <StickyTable<WaybillRow>
        rowKey="id"
        loading={query.isLoading}
        dataSource={query.data?.items ?? []}
        onRow={(row) => ({ onClick: () => setDetailId(row.id), style: { cursor: 'pointer' } })}
        pagination={{
          current: page,
          pageSize,
          total: query.data?.meta.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${t('Всего:')} ${total}`,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          },
        }}
        columns={[
          { title: t('Номер'), dataIndex: 'number', width: 185 },
          {
            title: t('Период'),
            width: 200,
            render: (_: unknown, row: WaybillRow) =>
              `${dayjs(row.validFrom).format('DD.MM.YYYY HH:mm')} — ${dayjs(row.validTo).format('HH:mm')}`,
          },
          {
            title: t('Техника'),
            render: (_: unknown, row: WaybillRow) => row.vehicle?.garageNumber ?? '—',
          },
          {
            title: t('Водитель'),
            render: (_: unknown, row: WaybillRow) =>
              row.driver ? `${row.driver.lastName} ${row.driver.firstName}` : '—',
          },
          {
            title: t('Статус'),
            dataIndex: 'status',
            width: 130,
            render: (value: string) => (
              <Tag color={WAYBILL_STATUS_COLOR[value] ?? 'default'}>
                {t(WAYBILL_STATUS_LABEL[value] ?? value)}
              </Tag>
            ),
          },
          {
            title: t('Пробег, км'),
            dataIndex: 'distanceKm',
            width: 110,
            align: 'right',
            render: (value: string | null) => fmt(value, 1),
          },
          {
            title: t('Норма, л'),
            dataIndex: 'fuelNorm',
            width: 100,
            align: 'right',
            render: (value: string | null) => fmt(value, 2),
          },
          {
            title: t('Факт, л'),
            dataIndex: 'fuelConsumed',
            width: 100,
            align: 'right',
            render: (value: string | null) => fmt(value, 2),
          },
          {
            title: t('Отклонение'),
            dataIndex: 'fuelDeviationPct',
            width: 120,
            align: 'right',
            render: (value: string | null) => {
              if (value === null) return '—';
              const percent = Number(value);
              return (
                <Typography.Text strong style={{ color: deviationColor(percent) }}>
                  {percent > 0 ? '+' : ''}
                  {percent.toFixed(1)} %
                </Typography.Text>
              );
            },
          },
        ]}
      />

      <WaybillFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <WaybillDrawer waybillId={detailId} onClose={() => setDetailId(null)} />
    </TableCard>
  );
}
