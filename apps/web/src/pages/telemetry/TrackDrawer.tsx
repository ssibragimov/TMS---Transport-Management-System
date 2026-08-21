import { useQuery } from '@tanstack/react-query';
import { Alert, DatePicker, Drawer, Empty, Space, Statistic } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import { EntityId } from '@/components/EntityId';
import { fmt } from '@/lib/labels';

import { AirportMap } from './AirportMap';

interface Props {
  vehicleId: number | null;
  onClose: () => void;
}

interface TrackPoint {
  ts: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  ignition: boolean | null;
}

interface TrackResponse {
  vehicle: { id: number; garageNumber: string };
  points: TrackPoint[];
  distanceKm: number;
  maxSpeed: number | null;
  truncated: boolean;
}

interface FenceRow {
  id: number;
  name: string;
  color: string | null;
  area: number[][] | null;
  isActive: boolean;
}

/**
 * Трек одной машины за смену.
 *
 * Пробег считается по точкам и показывается рядом с картой: это то самое
 * число, которое сверяется с путевым листом, и смотреть на него удобнее
 * там же, где виден маршрут.
 */
export function TrackDrawer({ vehicleId, onClose }: Props) {
  const { t } = useTranslation();

  const [day, setDay] = useState(() => dayjs());

  const open = vehicleId !== null;
  const from = day.startOf('day').toISOString();
  const to = day.endOf('day').toISOString();

  const track = useQuery({
    queryKey: ['telemetry-track', vehicleId, from],
    enabled: open,
    queryFn: async () =>
      (
        await api.get<TrackResponse>(`/telemetry/vehicles/${vehicleId}/track`, {
          params: { from, to },
        })
      ).data,
  });

  const fences = useQuery({
    queryKey: ['geofences'],
    enabled: open,
    queryFn: async () => (await api.get<FenceRow[]>('/geofences')).data,
  });

  const data = track.data;

  // Трек рисуется той же схемой, что и живая карта: каждая точка — маркер.
  // Прореживаем, иначе полторы тысячи кружков за смену сливаются в кляксу
  // и подпись гаражного номера повторяется на каждом.
  const step = data && data.points.length > 300 ? Math.ceil(data.points.length / 300) : 1;
  const thinned = (data?.points ?? []).filter((_, index) => index % step === 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={900}
      loading={track.isLoading}
      title={data ? `${t('Трек')} · ${data.vehicle.garageNumber}` : t('Трек')}
      extra={
        <Space>
          <DatePicker
            value={day}
            onChange={(value) => value && setDay(value)}
            format="DD.MM.YYYY"
            allowClear={false}
          />
          <EntityId id={data?.vehicle.id} />
        </Space>
      }
    >
      {data && (
        <>
          <Space size="large" style={{ marginBottom: 16 }}>
            <Statistic title={t('Пробег по треку')} value={fmt(data.distanceKm, 2)} suffix="км" />
            <Statistic
              title={t('Максимальная скорость')}
              value={data.maxSpeed === null ? '—' : fmt(data.maxSpeed, 0)}
              suffix={data.maxSpeed === null ? '' : 'км/ч'}
            />
            <Statistic title={t('Точек')} value={data.points.length} />
          </Space>

          {data.truncated && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={t('Показана только часть трека')}
              description={t(
                'За период накопилось больше точек, чем отдаётся за один запрос. Пробег посчитан по показанной части — выберите более узкий интервал.',
              )}
            />
          )}

          {data.points.length === 0 ? (
            <Empty description={t('За выбранные сутки трека нет')} />
          ) : (
            <AirportMap
              asTrack
              height={520}
              fences={(fences.data ?? [])
                .filter((fence) => fence.isActive)
                .map((fence) => ({
                  id: fence.id,
                  name: fence.name,
                  color: fence.color,
                  area: fence.area,
                }))}
              vehicles={thinned.map((point, index) => ({
                vehicleId: index,
                // Подписываем только каждую двадцатую точку временем —
                // сплошная лента подписей нечитаема.
                garageNumber: index % 20 === 0 ? dayjs(point.ts).format('HH:mm') : '',
                activity: (point.speed ?? 0) > 3 ? 'MOVING' : 'PARKED',
                position: {
                  latitude: point.latitude,
                  longitude: point.longitude,
                  heading: point.heading,
                },
              }))}
            />
          )}
        </>
      )}
    </Drawer>
  );
}
