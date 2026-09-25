import { useEffect, useRef, useState } from 'react';

import { loadYandexMaps } from '@/lib/yandexMaps';
import { edgeInsertIndex, type LonLat } from '@/lib/geo';

import { type CanvasProps } from './geofenceCanvas';

/**
 * Карта редактора зон на Яндекс.Картах (JS API 2.1).
 *
 * Подложка гибридная: спутник с подписями, а переключатель типа карты даёт
 * схему и чистый спутник. Обводить перрон по снимку удобнее всего.
 *
 * Порядок координат Яндекса — [широта, долгота], обратный нашему. Все
 * перестановки собраны здесь и в YandexAirportMap.
 *
 * Редактор Яндекса для многоугольников не используется: наши инструменты
 * (круг, прямоугольник, замыкание по первой точке, запрет самопересечений)
 * одинаковы на любой карте, поэтому вершины — это перетаскиваемые метки,
 * а логика рисования лежит в самом редакторе.
 */

const toYandex = ([lon, lat]: LonLat): YMaps.LatLng => [lat, lon];
const fromYandex = ([lat, lon]: YMaps.LatLng): LonLat => [lon, lat];

/** Пиксели «плоской» карты при данном масштабе — только для сравнения расстояний на экране. */
function toPixels([lon, lat]: LonLat, zoom: number): { x: number; y: number } {
  const size = 256 * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

function vertexIcon(color: string, size: number, fill: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${fill}" stroke="${color}" stroke-width="3"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function GeofenceYandexCanvas(props: CanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<YMaps.Map | null>(null);
  const apiRef = useRef<YMaps.Api | null>(null);
  const [ready, setReady] = useState(false);
  // Счётчик нужен, чтобы перерисовать метки после перетаскивания.
  const [tick, setTick] = useState(0);

  const live = useRef(props);
  live.current = props;

  const dragging = useRef<number | null>(null);
  const cursor = useRef<YMaps.CursorAccessor | null>(null);
  const othersObjects = useRef<YMaps.GeoObject[]>([]);
  const polyObject = useRef<YMaps.GeoObject | null>(null);
  const vertexObjects = useRef<YMaps.GeoObject[]>([]);

  useEffect(() => {
    let cancelled = false;

    loadYandexMaps()
      .then((maps) => {
        if (cancelled || !container.current) return;
        const { center } = live.current;

        apiRef.current = maps;
        const map = new maps.Map(
          container.current,
          {
            center: toYandex(center),
            zoom: 16,
            type: 'yandex#hybrid',
            controls: ['zoomControl', 'typeSelector', 'fullscreenControl'],
          },
          { minZoom: 5, maxZoom: 19, suppressMapOpenBlock: true },
        );
        // Двойной щелчок удаляет точку, а не приближает карту.
        map.behaviors.disable('dblClickZoom');

        map.events.add('click', (event) => {
          const coords = event.get('coords') as YMaps.LatLng | undefined;
          if (!coords) return;
          const point = fromYandex(coords);
          const zoom = map.getZoom();
          const click = toPixels(point, zoom);
          const { ring, onClick } = live.current;
          onClick({
            point,
            // Попадание по метке обрабатывает сама метка, сюда оно не доходит.
            nearest: null,
            insertIndex: edgeInsertIndex(ring, click, (q) => toPixels(q, zoom)),
          });
        });

        mapRef.current = map;
        setReady(true);
      })
      .catch((e: Error) => {
        if (!cancelled) live.current.onUnavailable?.(e.message);
      });

    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
      othersObjects.current = [];
      polyObject.current = null;
      vertexObjects.current = [];
      setReady(false);
    };
  }, []);

  // Показать все зоны офиса и обводимую зону целиком.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const { others, ring } = live.current;

    const points: LonLat[] = ring.length >= 3 ? ring : others.flatMap((o) => o.area);
    if (points.length < 2) return;

    const lons = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    void map.setBounds(
      [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ],
      { checkZoomRange: true, zoomMargin: 70 },
    );
  }, [ready]);

  // Остальные зоны офиса — для ориентира. Щелчки пропускают в карту.
  useEffect(() => {
    const map = mapRef.current;
    const maps = apiRef.current;
    if (!ready || !map || !maps) return;

    for (const object of othersObjects.current) map.geoObjects.remove(object);
    othersObjects.current = props.others
      .filter((o) => o.area.length >= 3)
      .map((o) => {
        const ring = o.area.map(toYandex);
        const polygon = new maps.Polygon(
          [[...ring, ring[0]]],
          { hintContent: o.name },
          {
            strokeColor: o.color,
            strokeWidth: 2,
            strokeOpacity: 0.7,
            fillColor: o.color,
            fillOpacity: 0.1,
            interactivityModel: 'default#transparent',
            zIndex: 1,
          },
        );
        map.geoObjects.add(polygon);
        return polygon;
      });
  }, [ready, props.others]);

  // Контур.
  useEffect(() => {
    const map = mapRef.current;
    const maps = apiRef.current;
    if (!ready || !map || !maps) return;
    const { ring, color } = props;

    if (polyObject.current) map.geoObjects.remove(polyObject.current);
    polyObject.current = null;

    const opts = {
      strokeColor: color,
      strokeWidth: 3,
      fillColor: color,
      fillOpacity: 0.22,
      interactivityModel: 'default#transparent',
      zIndex: 2,
    };
    if (ring.length >= 3) {
      const yring = ring.map(toYandex);
      polyObject.current = new maps.Polygon([[...yring, yring[0]]], {}, opts);
    } else if (ring.length === 2) {
      polyObject.current = new maps.Polyline(ring.map(toYandex), {}, opts);
    }
    if (polyObject.current) map.geoObjects.add(polyObject.current);
  }, [ready, props.ring, props.color]);

  // Вершины — метки. Пока одну из них тянут, остальные не пересоздаются:
  // иначе перетаскиваемая метка исчезала бы из-под курсора.
  useEffect(() => {
    const map = mapRef.current;
    const maps = apiRef.current;
    if (!ready || !map || !maps) return;
    if (dragging.current !== null) return;

    for (const object of vertexObjects.current) map.geoObjects.remove(object);
    vertexObjects.current = [];

    const { ring, color, pending, closingFirst, circleCenter } = props;

    const add = (
      point: LonLat,
      index: number,
      style: { size: number; fill: string; draggable: boolean },
    ): void => {
      const placemark = new maps.Placemark(
        toYandex(point),
        {},
        {
          draggable: style.draggable,
          iconLayout: 'default#image',
          iconImageHref: vertexIcon(color, style.size, style.fill),
          iconImageSize: [style.size, style.size],
          iconImageOffset: [-style.size / 2, -style.size / 2],
          hasBalloon: false,
          hasHint: false,
          zIndex: 10,
        },
      );

      if (index >= 0) {
        // Щелчок по точке не должен ставить новую под ней.
        placemark.events.add('click', (event) => {
          event.stopPropagation();
          live.current.onClick({ point, nearest: index, insertIndex: null });
        });
        placemark.events.add('dblclick', (event) => {
          event.stopPropagation();
          live.current.onVertexDelete(index);
        });
        placemark.events.add('dragstart', () => {
          dragging.current = index;
        });
        placemark.events.add('drag', () => {
          const coords = placemark.geometry.getCoordinates() as YMaps.LatLng;
          live.current.onVertexMove(index, fromYandex(coords));
        });
        placemark.events.add('dragend', () => {
          const coords = placemark.geometry.getCoordinates() as YMaps.LatLng;
          live.current.onVertexMove(index, fromYandex(coords));
          dragging.current = null;
          setTick((n) => n + 1);
        });
      }

      map.geoObjects.add(placemark);
      vertexObjects.current.push(placemark);
    };

    if (circleCenter) {
      // У круга ручек нет: сорок восемь точек на окружности только мешают.
      add(circleCenter, -1, { size: 16, fill: '#faad14', draggable: false });
    } else {
      ring.forEach((p, i) =>
        add(p, i, {
          size: closingFirst && i === 0 ? 22 : 16,
          fill: '#ffffff',
          draggable: true,
        }),
      );
    }
    if (pending) add(pending, -1, { size: 16, fill: '#faad14', draggable: false });
  }, [
    ready,
    props.ring,
    props.color,
    props.pending,
    props.closingFirst,
    props.circleCenter,
    tick,
  ]);

  // Курсор: прицел, пока контур рисуется.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    cursor.current?.remove();
    cursor.current = props.drawing ? map.cursors.push('crosshair') : null;
  }, [ready, props.drawing]);

  return (
    <div
      ref={container}
      style={{
        height: 560,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid rgba(0,0,0,0.12)',
      }}
    />
  );
}
