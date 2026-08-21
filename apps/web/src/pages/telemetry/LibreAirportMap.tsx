import { Alert } from 'antd';
// MapLibre 6 отдаёт только именованный экспорт — экспорта по умолчанию нет.
import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  addProtocol,
  type ErrorEvent,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import 'maplibre-gl/dist/maplibre-gl.css';

import { buildStyle } from '@/lib/basemap';

import type { PlanFence, PlanVehicle } from './PlanMap';

/**
 * Карта аэродрома на MapLibre с подложкой из собственного файла тайлов.
 *
 * Геозоны и техника рисуются слоями GeoJSON, а не отдельными объектами
 * на каждую машину: живая карта обновляется каждые пятнадцать секунд,
 * и пересоздавать сотню маркеров при каждом обновлении — это заметное
 * мигание. Слою достаточно подменить данные.
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
}

const ACTIVITY_COLOR: Record<string, string> = {
  MOVING: '#52c41a',
  IDLE: '#faad14',
  PARKED: '#8c8c8c',
  OFFLINE: '#cf1322',
  NO_DATA: '#d9d9d9',
};

const FENCE_FILL = 'gsm-fence-fill';
const FENCE_LINE = 'gsm-fence-line';
const FENCE_LABEL = 'gsm-fence-label';
const TRACK_LINE = 'gsm-track-line';
const VEHICLE_POINT = 'gsm-vehicle-point';
const VEHICLE_LABEL = 'gsm-vehicle-label';

/** Радиус области, за которую карту не выпускаем, км. */
const BOUND_KM = 6;

/**
 * Протокол pmtiles регистрируется один раз на всё приложение: повторный
 * вызов addProtocol с тем же именем MapLibre считает ошибкой, а карта
 * монтируется дважды — на вкладке и в панели трека.
 */
let protocolRegistered = false;

export function LibreAirportMap({
  center,
  fences,
  vehicles,
  selectedId,
  onSelect,
  height = 460,
  asTrack = false,
}: Props) {
  const { t } = useTranslation();

  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Обработчик клика держим в ссылке: он меняется вместе с родителем,
  // а переподписывать слушателя карты на каждой отрисовке незачем.
  const selectHandler = useRef(onSelect);
  selectHandler.current = onSelect;

  useEffect(() => {
    if (!container.current) return;

    if (!protocolRegistered) {
      addProtocol('pmtiles', new Protocol().tile);
      protocolRegistered = true;
    }

    const dLat = BOUND_KM / 111.32;
    const dLon = BOUND_KM / (111.32 * Math.cos((center.lat * Math.PI) / 180));

    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: container.current,
        style: buildStyle(),
        center: [center.lon, center.lat],
        zoom: 14,
        minZoom: 12,
        maxZoom: 18,
        // Карта закреплена за своим аэродромом: уехать в другой регион
        // диспетчеру незачем, а утащить её перетаскиванием — обычное дело.
        maxBounds: [
          [center.lon - dLon, center.lat - dLat],
          [center.lon + dLon, center.lat + dLat],
        ],
        attributionControl: { compact: true },
      });
    } catch (e) {
      setError((e as Error).message);
      return;
    }

    map.current = instance;
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    instance.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

    instance.on('error', (e: ErrorEvent) => {
      const message = e.error?.message ?? 'неизвестная ошибка';
      // Ошибки отдельных тайлов не должны гасить карту целиком: за краем
      // вырезанного района тайлов нет, и это нормально.
      console.warn('MapLibre:', message);

      // А вот сорванная загрузка стиля, шрифтов или самого файла тайлов
      // означает, что карты не будет вовсе. Молчать об этом нельзя:
      // пустой прямоугольник не объясняет, что чинить.
      if (/style|sprite|glyph|pmtiles|font/i.test(message)) {
        setError(message);
      }
    });

    // Если за это время стиль не поднялся, значит что-то не отдаётся.
    // Без таймера отказ выглядит как бесконечная пустота.
    const watchdog = window.setTimeout(() => {
      if (!instance.isStyleLoaded()) {
        setError(
          'Подложка не загрузилась за 15 секунд. Проверьте, что файл apps/web/public/map/tashkent.pmtiles на месте — он собирается командой npm run map:tiles.',
        );
      }
    }, 15_000);

    const empty = { type: 'FeatureCollection' as const, features: [] };

    instance.on('load', () => {
      instance.addSource('gsm-fences', { type: 'geojson', data: empty });
      instance.addSource('gsm-vehicles', { type: 'geojson', data: empty });
      instance.addSource('gsm-track', { type: 'geojson', data: empty });

      instance.addLayer({
        id: FENCE_FILL,
        type: 'fill',
        source: 'gsm-fences',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 },
      });
      instance.addLayer({
        id: FENCE_LINE,
        type: 'line',
        source: 'gsm-fences',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [3, 2] },
      });
      instance.addLayer({
        id: FENCE_LABEL,
        type: 'symbol',
        source: 'gsm-fences',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Medium'],
          'text-size': 13,
        },
        paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      });

      instance.addLayer({
        id: TRACK_LINE,
        type: 'line',
        source: 'gsm-track',
        paint: { 'line-color': '#1677ff', 'line-width': 3, 'line-opacity': 0.85 },
      });

      instance.addLayer({
        id: VEHICLE_POINT,
        type: 'circle',
        source: 'gsm-vehicles',
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 9, ['get', 'small'], 4, 7],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': ['case', ['get', 'small'], 1, 2],
        },
      });
      instance.addLayer({
        id: VEHICLE_LABEL,
        type: 'symbol',
        source: 'gsm-vehicles',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Medium'],
          'text-size': 12,
          'text-offset': [0, -1.4],
          'text-allow-overlap': false,
        },
        paint: { 'text-color': '#141414', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      });

      instance.on('click', VEHICLE_POINT, (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.vehicleId;
        if (id !== undefined) selectHandler.current?.(Number(id));
      });
      instance.on('mouseenter', VEHICLE_POINT, () => {
        instance.getCanvas().style.cursor = 'pointer';
      });
      instance.on('mouseleave', VEHICLE_POINT, () => {
        instance.getCanvas().style.cursor = '';
      });

      window.clearTimeout(watchdog);
      setReady(true);
    });

    return () => {
      window.clearTimeout(watchdog);
      instance.remove();
      map.current = null;
      setReady(false);
    };
  }, [center.lat, center.lon]);

  // Данные обновляются отдельно от создания карты: живая карта
  // перезапрашивается часто, а карта строится один раз.
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;

    const fenceSource = instance.getSource('gsm-fences') as GeoJSONSource | undefined;
    fenceSource?.setData({
      type: 'FeatureCollection',
      features: fences
        .filter((fence) => fence.area && fence.area.length >= 3)
        .map((fence) => ({
          type: 'Feature' as const,
          properties: { name: fence.name, color: fence.color ?? '#1677ff' },
          geometry: {
            type: 'Polygon' as const,
            // GeoJSON требует замкнутое кольцо, в базе оно хранится открытым.
            coordinates: [[...fence.area!, fence.area![0]]],
          },
        })),
    });

    const points = vehicles.filter((v) => v.position);

    const vehicleSource = instance.getSource('gsm-vehicles') as GeoJSONSource | undefined;
    vehicleSource?.setData({
      type: 'FeatureCollection',
      features: points.map((vehicle) => ({
        type: 'Feature' as const,
        properties: {
          vehicleId: vehicle.vehicleId,
          label: vehicle.garageNumber,
          color: ACTIVITY_COLOR[vehicle.activity] ?? '#8c8c8c',
          selected: vehicle.vehicleId === selectedId,
          small: asTrack,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [vehicle.position!.longitude, vehicle.position!.latitude],
        },
      })),
    });

    const trackSource = instance.getSource('gsm-track') as GeoJSONSource | undefined;
    trackSource?.setData(
      asTrack && points.length > 1
        ? {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: points.map((v) => [v.position!.longitude, v.position!.latitude]),
            },
          }
        : { type: 'FeatureCollection', features: [] },
    );
  }, [ready, fences, vehicles, selectedId, asTrack]);

  if (error) {
    return (
      <Alert type="warning" showIcon message={t('Карта не открылась')} description={error} />
    );
  }

  return (
    <div
      ref={container}
      style={{ height, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)' }}
    />
  );
}
