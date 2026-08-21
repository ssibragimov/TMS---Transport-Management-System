import { EnvironmentOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Empty, Segmented, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@gsm/shared';

import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { CATEGORY_LABEL, fmt } from '@/lib/labels';

import { AirportMap } from './telemetry/AirportMap';
import type { PlanFence, PlanVehicle } from './telemetry/PlanMap';
import { TrackDrawer } from './telemetry/TrackDrawer';

/** Как часто перезапрашивается живая карта. */
const LIVE_REFRESH_MS = 15_000;

export const ACTIVITY_LABEL: Record<string, string> = {
  MOVING: 'В движении',
  IDLE: 'Работает на месте',
  PARKED: 'Стоит',
  OFFLINE: 'Нет связи',
  NO_DATA: 'Нет данных',
};

const ACTIVITY_BADGE: Record<string, 'success' | 'warning' | 'default' | 'error'> = {
  MOVING: 'success',
  IDLE: 'warning',
  PARKED: 'default',
  OFFLINE: 'error',
  NO_DATA: 'default',
};

interface LiveRow {
  vehicleId: number;
  garageNumber: string;
  plateNumber: string | null;
  category: string;
  department: string | null;
  hasDevice: boolean;
  imei: string | null;
  activity: string;
  position: {
    ts: string;
    latitude: number;
    longitude: number;
    speed: number | null;
    heading: number | null;
    ignition: boolean | null;
  } | null;
}

interface FenceRow {
  id: number;
  name: string;
  kind: string;
  area: number[][] | null;
  speedLimit: number | null;
  alertOnEntry: boolean;
  alertOnExit: boolean;
  color: string | null;
  isActive: boolean;
  eventCount: number;
}

interface DeviceRow {
  id: number;
  imei: string;
  provider: string | null;
  model: string | null;
  simNumber: string | null;
  installedAt: string;
  removedAt: string | null;
  lastSeenAt: string | null;
  isActive: boolean;
  vehicle: { id: number; garageNumber: string; plateNumber: string | null };
}

interface EventRow {
  id: string;
  eventType: string;
  occurredAt: string;
  speed: number | null;
  geofence: { id: number; name: string; color: string | null };
  vehicle: { id: number; garageNumber: string };
}

/**
 * Давность последней точки словами.
 *
 * Считается вручную, а не плагином relativeTime: в проекте он не подключён,
 * а тянуть его ради одной колонки — лишняя зависимость в сборке.
 */
function minutesAgo(ts: string): string {
  const minutes = Math.max(0, Math.round(dayjs().diff(dayjs(ts), 'minute')));
  if (minutes === 0) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return dayjs(ts).format('DD.MM HH:mm');
}

const FENCE_KIND_LABEL: Record<string, string> = {
  APRON: 'Перрон',
  PARKING: 'Стоянка',
  FUEL_DEPOT: 'Склад ГСМ',
  PERIMETER: 'Периметр',
  OTHER: 'Прочее',
};

export function TelemetryPage() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const [selected, setSelected] = useState<number | null>(null);
  const [trackVehicle, setTrackVehicle] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'tracked'>('tracked');

  const live = useQuery({
    queryKey: ['telemetry-live'],
    queryFn: async () => (await api.get<LiveRow[]>('/telemetry/live')).data,
    // Живая карта на то и живая: без автообновления диспетчер видел бы
    // положение на момент открытия вкладки и не знал бы об этом.
    refetchInterval: LIVE_REFRESH_MS,
  });

  const fences = useQuery({
    queryKey: ['geofences'],
    queryFn: async () => (await api.get<FenceRow[]>('/geofences')).data,
  });

  const devices = useQuery({
    queryKey: ['telemetry-devices'],
    queryFn: async () => (await api.get<DeviceRow[]>('/telemetry/devices')).data,
  });

  const events = useQuery({
    queryKey: ['telemetry-events'],
    queryFn: async () =>
      (await api.get<{ items: EventRow[]; meta: { total: number } }>('/telemetry/events', {
        params: { pageSize: 50 },
      })).data,
  });

  if (!can(PERMISSIONS.TELEMETRY_READ)) {
    return <Typography.Text type="danger">{t('Нет прав на просмотр телеметрии')}</Typography.Text>;
  }

  const rows = live.data ?? [];
  const tracked = rows.filter((row) => row.position !== null);
  const visible = filter === 'tracked' ? tracked : rows;

  // Головной офис своей техники не имеет: там раздел пуст по существу,
  // и без объяснения это выглядит как поломка карты.
  const isHeadquarters = rows.length === 0 && !live.isLoading;

  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.activity] = (acc[row.activity] ?? 0) + 1;
    return acc;
  }, {});

  const planFences: PlanFence[] = (fences.data ?? [])
    .filter((fence) => fence.isActive)
    .map((fence) => ({ id: fence.id, name: fence.name, color: fence.color, area: fence.area }));

  const planVehicles: PlanVehicle[] = tracked.map((row) => ({
    vehicleId: row.vehicleId,
    garageNumber: row.garageNumber,
    activity: row.activity,
    position: row.position && {
      latitude: row.position.latitude,
      longitude: row.position.longitude,
      heading: row.position.heading,
    },
  }));

  return (
    <>
      <Tabs
        items={[
          {
            key: 'live',
            label: t('Живая карта'),
            children: (
              <Card
                title={
                  <Space wrap size="small">
                    <EnvironmentOutlined />
                    <span>{t('Положение техники')}</span>
                    {Object.entries(counts).map(([activity, count]) => (
                      <Badge
                        key={activity}
                        status={ACTIVITY_BADGE[activity] ?? 'default'}
                        text={`${t(ACTIVITY_LABEL[activity] ?? activity)}: ${count}`}
                      />
                    ))}
                  </Space>
                }
                extra={
                  <Space>
                    <Segmented
                      size="small"
                      value={filter}
                      onChange={(value) => setFilter(value as 'all' | 'tracked')}
                      options={[
                        { label: t('С трекером'), value: 'tracked' },
                        { label: t('Вся техника'), value: 'all' },
                      ]}
                    />
                    <Tooltip title={t('Обновляется автоматически каждые 15 секунд')}>
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        loading={live.isFetching}
                        onClick={() => void live.refetch()}
                      />
                    </Tooltip>
                  </Space>
                }
              >
                {isHeadquarters ? (
                  <Empty
                    description={
                      <Space direction="vertical" size={4}>
                        <span>{t('В этом офисе нет техники с трекерами')}</span>
                        <Typography.Text type="secondary">
                          {t('Телеметрия ведётся по аэропортам — выберите офис аэропорта в шапке.')}
                        </Typography.Text>
                      </Space>
                    }
                    style={{ padding: '48px 0' }}
                  />
                ) : (
                  <AirportMap
                    explainFallback
                    fences={planFences}
                    vehicles={planVehicles}
                    selectedId={selected}
                    onSelect={setSelected}
                  />
                )}

                <Table<LiveRow>
                  rowKey="vehicleId"
                  size="small"
                  style={{ marginTop: 16 }}
                  loading={live.isLoading}
                  dataSource={visible}
                  pagination={false}
                  scroll={{ y: 320 }}
                  rowClassName={(row) => (row.vehicleId === selected ? 'ant-table-row-selected' : '')}
                  onRow={(row) => ({
                    onClick: () => setSelected(row.vehicleId),
                    style: { cursor: 'pointer' },
                  })}
                  locale={{ emptyText: <Empty description={t('Техники с данными нет')} /> }}
                  columns={[
                    { title: t('Гаражный'), dataIndex: 'garageNumber', width: 110 },
                    {
                      title: t('Категория'),
                      dataIndex: 'category',
                      width: 190,
                      render: (value: string) => t(CATEGORY_LABEL[value] ?? value),
                    },
                    {
                      title: t('Состояние'),
                      dataIndex: 'activity',
                      width: 170,
                      render: (value: string) => (
                        <Badge
                          status={ACTIVITY_BADGE[value] ?? 'default'}
                          text={t(ACTIVITY_LABEL[value] ?? value)}
                        />
                      ),
                    },
                    {
                      title: t('Скорость'),
                      width: 100,
                      align: 'right',
                      render: (_: unknown, row: LiveRow) =>
                        row.position?.speed === null || row.position === null
                          ? '—'
                          : `${fmt(row.position.speed, 0)} км/ч`,
                    },
                    {
                      title: t('Последняя точка'),
                      width: 150,
                      render: (_: unknown, row: LiveRow) =>
                        row.position ? (
                          <Tooltip title={dayjs(row.position.ts).format('DD.MM.YYYY HH:mm:ss')}>
                            {minutesAgo(row.position.ts)}
                          </Tooltip>
                        ) : (
                          <Typography.Text type="secondary">
                            {row.hasDevice ? t('трекер молчит') : t('трекера нет')}
                          </Typography.Text>
                        ),
                    },
                    {
                      title: '',
                      width: 110,
                      render: (_: unknown, row: LiveRow) =>
                        row.position && (
                          <Button
                            type="link"
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTrackVehicle(row.vehicleId);
                            }}
                          >
                            {t('Трек')}
                          </Button>
                        ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'devices',
            label: t('Трекеры'),
            children: (
              <Card>
                <Table<DeviceRow>
                  rowKey="id"
                  size="small"
                  loading={devices.isLoading}
                  dataSource={devices.data ?? []}
                  pagination={false}
                  locale={{ emptyText: <Empty description={t('Трекеры не зарегистрированы')} /> }}
                  columns={[
                    { title: t('IMEI'), dataIndex: 'imei', width: 180 },
                    {
                      title: t('Техника'),
                      width: 160,
                      render: (_: unknown, row: DeviceRow) =>
                        `${row.vehicle.garageNumber}${row.vehicle.plateNumber ? ` · ${row.vehicle.plateNumber}` : ''}`,
                    },
                    { title: t('Поставщик'), dataIndex: 'provider', width: 130 },
                    { title: t('Модель'), dataIndex: 'model', width: 130 },
                    { title: t('SIM'), dataIndex: 'simNumber', width: 140 },
                    {
                      title: t('Последний сеанс'),
                      dataIndex: 'lastSeenAt',
                      width: 170,
                      render: (value: string | null) =>
                        value ? (
                          dayjs(value).format('DD.MM.YYYY HH:mm')
                        ) : (
                          <Typography.Text type="secondary">{t('не выходил на связь')}</Typography.Text>
                        ),
                    },
                    {
                      title: t('Состояние'),
                      width: 120,
                      render: (_: unknown, row: DeviceRow) =>
                        row.removedAt ? (
                          <Tag>{t('снят')}</Tag>
                        ) : row.isActive ? (
                          <Tag color="green">{t('работает')}</Tag>
                        ) : (
                          <Tag color="default">{t('отключён')}</Tag>
                        ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'fences',
            label: t('Геозоны'),
            children: (
              <Card>
                <Table<FenceRow>
                  rowKey="id"
                  size="small"
                  loading={fences.isLoading}
                  dataSource={fences.data ?? []}
                  pagination={false}
                  locale={{ emptyText: <Empty description={t('Геозоны не заданы')} /> }}
                  columns={[
                    {
                      title: t('Название'),
                      width: 220,
                      render: (_: unknown, row: FenceRow) => (
                        <Space size={6}>
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 2,
                              background: row.color ?? '#1677ff',
                              display: 'inline-block',
                            }}
                          />
                          {row.name}
                        </Space>
                      ),
                    },
                    {
                      title: t('Тип'),
                      dataIndex: 'kind',
                      width: 130,
                      render: (value: string) => t(FENCE_KIND_LABEL[value] ?? value),
                    },
                    {
                      title: t('Ограничение'),
                      dataIndex: 'speedLimit',
                      width: 130,
                      render: (value: number | null) => (value ? `${value} км/ч` : '—'),
                    },
                    {
                      title: t('Оповещения'),
                      width: 200,
                      render: (_: unknown, row: FenceRow) => {
                        const tags = [];
                        if (row.alertOnEntry) tags.push(t('на въезд'));
                        if (row.alertOnExit) tags.push(t('на выезд'));
                        return tags.length === 0 ? (
                          <Typography.Text type="secondary">{t('не настроены')}</Typography.Text>
                        ) : (
                          tags.map((tag) => <Tag key={tag}>{tag}</Tag>)
                        );
                      },
                    },
                    {
                      title: t('Событий'),
                      dataIndex: 'eventCount',
                      width: 100,
                      align: 'right',
                    },
                    {
                      title: t('Полигон'),
                      width: 120,
                      render: (_: unknown, row: FenceRow) =>
                        row.area ? (
                          `${row.area.length} ${t('точек')}`
                        ) : (
                          <Typography.Text type="warning">{t('не обведён')}</Typography.Text>
                        ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'events',
            label: (
              <Space size={6}>
                {t('События')}
                {events.data && <Tag>{events.data.meta.total}</Tag>}
              </Space>
            ),
            children: (
              <Card>
                <Table<EventRow>
                  rowKey="id"
                  size="small"
                  loading={events.isLoading}
                  dataSource={events.data?.items ?? []}
                  pagination={false}
                  scroll={{ y: 520 }}
                  locale={{ emptyText: <Empty description={t('Пересечений границ не зафиксировано')} /> }}
                  columns={[
                    {
                      title: t('Время'),
                      dataIndex: 'occurredAt',
                      width: 170,
                      render: (value: string) => dayjs(value).format('DD.MM.YYYY HH:mm:ss'),
                    },
                    {
                      title: t('Событие'),
                      dataIndex: 'eventType',
                      width: 110,
                      render: (value: string) => (
                        <Tag color={value === 'ENTRY' ? 'blue' : 'orange'}>
                          {value === 'ENTRY' ? t('въезд') : t('выезд')}
                        </Tag>
                      ),
                    },
                    {
                      title: t('Геозона'),
                      width: 220,
                      render: (_: unknown, row: EventRow) => row.geofence.name,
                    },
                    {
                      title: t('Техника'),
                      width: 140,
                      render: (_: unknown, row: EventRow) => row.vehicle.garageNumber,
                    },
                    {
                      title: t('Скорость'),
                      width: 110,
                      align: 'right',
                      render: (_: unknown, row: EventRow) =>
                        row.speed === null ? '—' : `${fmt(row.speed, 0)} км/ч`,
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />

      <TrackDrawer vehicleId={trackVehicle} onClose={() => setTrackVehicle(null)} />
    </>
  );
}
