import { Empty, Tooltip } from 'antd';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Схема территории: геозоны и положение техники.
 *
 * Почему свой SVG, а не картографическая библиотека с тайлами: подложка
 * тянется из интернета, а в технологической сети аэропорта его может не быть
 * вовсе. Схема же показывает главное — где машина относительно перрона,
 * стоянки и периметра, — и работает в любой сети без единого запроса наружу.
 *
 * Когда решится вопрос с источником подложки (свой тайл-сервер или схема
 * аэродрома растром), компонент заменяется целиком: наружу он отдаёт только
 * клик по машине.
 */

export interface PlanFence {
  id: number;
  name: string;
  color: string | null;
  area: number[][] | null;
}

export interface PlanVehicle {
  vehicleId: number;
  garageNumber: string;
  activity: string;
  position: { latitude: number; longitude: number; heading: number | null } | null;
}

interface Props {
  fences: PlanFence[];
  vehicles: PlanVehicle[];
  selectedId?: number | null;
  onSelect?: (vehicleId: number) => void;
  height?: number;
}

const ACTIVITY_COLOR: Record<string, string> = {
  MOVING: '#52c41a',
  IDLE: '#faad14',
  PARKED: '#8c8c8c',
  OFFLINE: '#cf1322',
  NO_DATA: '#d9d9d9',
};

/** Поля вокруг содержимого, доли ширины: подпись машины не должна упираться в край. */
const PADDING = 0.06;

export function PlanMap({ fences, vehicles, selectedId, onSelect, height = 460 }: Props) {
  const { t } = useTranslation();

  const scene = useMemo(() => {
    const lons: number[] = [];
    const lats: number[] = [];

    for (const fence of fences) {
      for (const [lon, lat] of fence.area ?? []) {
        lons.push(lon);
        lats.push(lat);
      }
    }
    for (const vehicle of vehicles) {
      if (vehicle.position) {
        lons.push(vehicle.position.longitude);
        lats.push(vehicle.position.latitude);
      }
    }

    if (lons.length === 0) return null;

    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    // Градус долготы короче градуса широты — на широте Ташкента примерно
    // в 1,33 раза. Без поправки квадратный перрон выглядел бы вытянутым.
    const midLat = (minLat + maxLat) / 2;
    const lonScale = Math.cos((midLat * Math.PI) / 180);

    const width = Math.max((maxLon - minLon) * lonScale, 1e-6);
    const heightDeg = Math.max(maxLat - minLat, 1e-6);
    const span = Math.max(width, heightDeg);

    // Единичная система координат 0…1 с общим масштабом по обеим осям,
    // иначе фигуры искажаются при вытянутой территории.
    const project = (lon: number, lat: number): [number, number] => {
      const x = ((lon - minLon) * lonScale - width / 2) / span + 0.5;
      const y = ((lat - minLat) - heightDeg / 2) / span + 0.5;
      return [
        PADDING + x * (1 - 2 * PADDING),
        // Экранная ось Y направлена вниз, географическая — вверх.
        1 - (PADDING + y * (1 - 2 * PADDING)),
      ];
    };

    return { project };
  }, [fences, vehicles]);

  if (scene === null) {
    return <Empty description={t('Нет данных для отображения: не заданы геозоны и нет точек')} />;
  }

  const { project } = scene;
  const SIZE = 1000;
  const px = (v: number): number => v * SIZE;

  return (
    <div
      style={{
        position: 'relative',
        height,
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--gsm-plan-bg, #f5f7fa)',
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%" role="img">
        <defs>
          <pattern id="gsm-plan-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={SIZE} height={SIZE} fill="url(#gsm-plan-grid)" />

        {fences.map((fence) => {
          if (!fence.area || fence.area.length < 3) return null;
          const color = fence.color ?? '#1677ff';
          const points = fence.area
            .map(([lon, lat]) => {
              const [x, y] = project(lon, lat);
              return `${px(x)},${px(y)}`;
            })
            .join(' ');

          const [cx, cy] = project(
            fence.area.reduce((sum, p) => sum + p[0], 0) / fence.area.length,
            fence.area.reduce((sum, p) => sum + p[1], 0) / fence.area.length,
          );

          return (
            <g key={fence.id}>
              <polygon
                points={points}
                fill={color}
                fillOpacity={0.08}
                stroke={color}
                strokeWidth={2}
                strokeDasharray="6 4"
              />
              <text
                x={px(cx)}
                y={px(cy)}
                textAnchor="middle"
                fontSize={16}
                fill={color}
                opacity={0.75}
              >
                {fence.name}
              </text>
            </g>
          );
        })}

        {vehicles.map((vehicle) => {
          if (!vehicle.position) return null;
          const [x, y] = project(vehicle.position.longitude, vehicle.position.latitude);
          const selected = selectedId === vehicle.vehicleId;
          const color = ACTIVITY_COLOR[vehicle.activity] ?? '#8c8c8c';

          return (
            <g
              key={vehicle.vehicleId}
              onClick={() => onSelect?.(vehicle.vehicleId)}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
            >
              {selected && (
                <circle cx={px(x)} cy={px(y)} r={16} fill={color} fillOpacity={0.25} />
              )}
              <circle
                cx={px(x)}
                cy={px(y)}
                r={selected ? 8 : 6}
                fill={color}
                stroke="#fff"
                strokeWidth={2}
              />
              {/* Курс рисуем только у едущих: у стоящей машины он случаен. */}
              {vehicle.activity === 'MOVING' && vehicle.position.heading !== null && (
                <line
                  x1={px(x)}
                  y1={px(y)}
                  x2={px(x) + 16 * Math.sin((vehicle.position.heading * Math.PI) / 180)}
                  y2={px(y) - 16 * Math.cos((vehicle.position.heading * Math.PI) / 180)}
                  stroke={color}
                  strokeWidth={2.5}
                />
              )}
              <text
                x={px(x)}
                y={px(y) - 12}
                textAnchor="middle"
                fontSize={14}
                fontWeight={selected ? 700 : 400}
                fill="var(--gsm-plan-label, #262626)"
              >
                {vehicle.garageNumber}
              </text>
            </g>
          );
        })}
      </svg>

      <Tooltip
        title={t(
          'Схема территории без картографической подложки: относительное положение техники, геозоны и курс движения.',
        )}
      >
        <span
          style={{
            position: 'absolute',
            right: 10,
            bottom: 8,
            fontSize: 12,
            opacity: 0.45,
            userSelect: 'none',
          }}
        >
          {t('схема')}
        </span>
      </Tooltip>
    </div>
  );
}
