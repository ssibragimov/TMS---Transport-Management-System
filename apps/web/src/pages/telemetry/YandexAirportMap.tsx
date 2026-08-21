import { Alert } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { loadYandexMaps } from '@/lib/yandexMaps';

import type { PlanFence, PlanVehicle } from './PlanMap';

/**
 * Карта аэродрома на Яндекс.Картах (JS API 2.1).
 *
 * Подложка гибридная — спутник с подписями. Ради этого карта и подключалась:
 * на снимке видны стоянки, рулёжные дорожки и ангары, и положение машины
 * читается как «у третьего терминала», а не как точка на сетке.
 *
 * Порядок координат в версии 2.1 — [широта, долгота], обратный тому, что
 * принят в GeoJSON и хранится у нас. Все перестановки собраны в этом файле:
 * если размазать их по коду, рано или поздно карта покажет технику в Африке.
 */

interface Props {
  center: { lat: number; lon: number };
  fences: PlanFence[];
  vehicles: PlanVehicle[];
  selectedId?: number | null;
  onSelect?: (vehicleId: number) => void;
  height?: number;
  /** Соединять точки линией — режим просмотра трека. */
  asTrack?: boolean;
  /**
   * Яндекс недоступен — ключ отклонён, нет сети или исчерпан суточный лимит.
   * Родитель по этому сигналу переходит на следующую подложку: остаться
   * с сообщением об ошибке вместо карты хуже, чем показать карту попроще.
   */
  onUnavailable?: (reason: string) => void;
}

const ACTIVITY_COLOR: Record<string, string> = {
  MOVING: '#52c41a',
  IDLE: '#faad14',
  PARKED: '#8c8c8c',
  OFFLINE: '#cf1322',
  NO_DATA: '#d9d9d9',
};

/** Радиус области, за которую карту не выпускаем, км. */
const BOUND_KM = 6;

export function YandexAirportMap({
  center,
  fences,
  vehicles,
  selectedId,
  onSelect,
  height = 460,
  asTrack = false,
  onUnavailable,
}: Props) {
  const { t } = useTranslation();

  const container = useRef<HTMLDivElement>(null);
  const map = useRef<YMaps.Map | null>(null);
  const api = useRef<YMaps.Api | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectHandler = useRef(onSelect);
  selectHandler.current = onSelect;

  const unavailableHandler = useRef(onUnavailable);
  unavailableHandler.current = onUnavailable;

  useEffect(() => {
    let cancelled = false;

    loadYandexMaps()
      .then((maps) => {
        if (cancelled || !container.current) return;

        const dLat = BOUND_KM / 111.32;
        const dLon = BOUND_KM / (111.32 * Math.cos((center.lat * Math.PI) / 180));

        api.current = maps;
        map.current = new maps.Map(
          container.current,
          {
            center: [center.lat, center.lon],
            zoom: 15,
            // Спутник с подписями: без подписей теряются ориентиры,
            // без спутника пропадает причина брать карту вместо схемы.
            type: 'yandex#hybrid',
            controls: ['zoomControl', 'typeSelector', 'fullscreenControl'],
          },
          {
            // Карта закреплена за своим аэродромом: уехать в другой регион
            // диспетчеру незачем, а утащить её перетаскиванием — обычное дело.
            restrictMapArea: [
              [center.lat - dLat, center.lon - dLon],
              [center.lat + dLat, center.lon + dLon],
            ],
            minZoom: 12,
            maxZoom: 19,
            suppressMapOpenBlock: true,
          },
        );

        setReady(true);
      })
      .catch((e: Error) => {
        if (cancelled) return;

        // Сообщаем родителю и ничего не рисуем сами: дальше он покажет
        // следующую подложку вместе с пояснением, почему не эта.
        if (unavailableHandler.current) {
          unavailableHandler.current(e.message);
        } else {
          setError(e.message);
        }
      });

    return () => {
      cancelled = true;
      map.current?.destroy();
      map.current = null;
      setReady(false);
    };
  }, [center.lat, center.lon]);

  // Данные обновляются отдельно от создания карты: живая карта
  // перезапрашивается каждые пятнадцать секунд, карта строится один раз.
  useEffect(() => {
    const instance = map.current;
    const maps = api.current;
    if (!ready || !instance || !maps) return;

    instance.geoObjects.removeAll();

    try {
      for (const fence of fences) {
        if (!fence.area || fence.area.length < 3) continue;
        const color = fence.color ?? '#1677ff';
        // Наш полигон хранится как [долгота, широта] — переставляем.
        const ring = fence.area.map(([lon, lat]) => [lat, lon] as YMaps.LatLng);

        instance.geoObjects.add(
          new maps.Polygon([[...ring, ring[0]]], {}, {
            strokeColor: color,
            strokeWidth: 2,
            fillColor: color,
            fillOpacity: 0.15,
          }),
        );
      }

      const points = vehicles.filter((v) => v.position);

      if (asTrack && points.length > 1) {
        instance.geoObjects.add(
          new maps.Polyline(
            points.map((v) => [v.position!.latitude, v.position!.longitude] as YMaps.LatLng),
            {},
            { strokeColor: '#1677ff', strokeWidth: 3, strokeOpacity: 0.85 },
          ),
        );
      }

      for (const vehicle of points) {
        const selected = vehicle.vehicleId === selectedId;
        const placemark = new maps.Placemark(
          [vehicle.position!.latitude, vehicle.position!.longitude],
          {
            // Точки трека не подписываем: их сотни, и подпись у каждой
            // превратила бы маршрут в сплошную ленту текста.
            iconCaption: asTrack ? undefined : vehicle.garageNumber,
            hintContent: vehicle.garageNumber,
          },
          {
            preset: asTrack ? 'islands#circleIcon' : 'islands#circleDotIcon',
            iconColor: ACTIVITY_COLOR[vehicle.activity] ?? '#8c8c8c',
            zIndex: selected ? 1000 : 1,
          },
        );

        if (selectHandler.current) {
          placemark.events.add('click', () => selectHandler.current?.(vehicle.vehicleId));
        }
        instance.geoObjects.add(placemark);
      }
    } catch (e) {
      // Ошибка в описании объекта не должна оставлять карту без объяснения.
      setError(`Не удалось нанести объекты на карту: ${(e as Error).message}`);
    }
  }, [ready, fences, vehicles, selectedId, asTrack]);

  if (error) {
    return <Alert type="warning" showIcon message={t('Карта Яндекса не открылась')} description={error} />;
  }

  return (
    <div
      ref={container}
      style={{ height, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)' }}
    />
  );
}
