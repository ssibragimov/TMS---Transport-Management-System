import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  LngLatBounds,
  type GeoJSONSource,
  type MapMouseEvent,
} from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

import 'maplibre-gl/dist/maplibre-gl.css';

import { buildOnlineStyle } from '@/lib/basemap';
import { edgeInsertIndex, type LonLat } from '@/lib/geo';

import { VERTEX_HIT_PX, type CanvasProps } from './geofenceCanvas';

/**
 * Запасная карта редактора: MapLibre с растром OpenStreetMap. Нужна, пока
 * ключа Яндекса нет или он не принят.
 */

const SRC_OTHERS = 'ed-others';
const SRC_POLY = 'ed-poly';
const SRC_VERTS = 'ed-verts';

type VertexEvent = MapMouseEvent & {
  features?: Array<{ properties: Record<string, unknown> }>;
};

export function GeofenceLibreCanvas(props: CanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const dragMoved = useRef(false);

  // Обработчики карты создаются один раз, а свойства меняются — читаем
  // актуальные через ссылку, чтобы не переподписываться при каждой правке.
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    if (!container.current) return;
    const { center } = live.current;

    const map = new MapLibreMap({
      container: container.current,
      style: buildOnlineStyle(),
      center,
      zoom: 16,
      minZoom: 5,
      maxZoom: 19,
      doubleClickZoom: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('error', (e) => {
      if ((e as { sourceId?: string }).sourceId === 'osm') live.current.onTilesError?.();
    });

    map.on('load', () => {
      const empty = { type: 'FeatureCollection' as const, features: [] };
      map.addSource(SRC_OTHERS, { type: 'geojson', data: empty });
      map.addSource(SRC_POLY, { type: 'geojson', data: empty });
      map.addSource(SRC_VERTS, { type: 'geojson', data: empty });

      map.addLayer({
        id: 'ed-others-fill',
        type: 'fill',
        source: SRC_OTHERS,
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.1 },
      });
      map.addLayer({
        id: 'ed-others-line',
        type: 'line',
        source: SRC_OTHERS,
        paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.6 },
      });
      map.addLayer({
        id: 'ed-others-label',
        type: 'symbol',
        source: SRC_OTHERS,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Medium'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#595959',
          'text-halo-color': '#fff',
          'text-halo-width': 1.5,
        },
      });
      map.addLayer({
        id: 'ed-poly-fill',
        type: 'fill',
        source: SRC_POLY,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 },
      });
      map.addLayer({
        id: 'ed-poly-line',
        type: 'line',
        source: SRC_POLY,
        paint: { 'line-color': ['get', 'color'], 'line-width': 3 },
      });
      map.addLayer({
        id: 'ed-verts',
        type: 'circle',
        source: SRC_VERTS,
        paint: {
          'circle-radius': ['case', ['get', 'closing'], 9, 6],
          'circle-color': ['case', ['get', 'pending'], '#faad14', '#ffffff'],
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-width': 3,
        },
      });

      map.on('mouseenter', 'ed-verts', () => {
        map.getCanvas().style.cursor = 'grab';
      });
      map.on('mouseleave', 'ed-verts', () => {
        map.getCanvas().style.cursor = live.current.drawing ? 'crosshair' : '';
      });

      // Перетаскивание точки: пока тянем, карта не должна ехать вместе с мышью.
      map.on('mousedown', 'ed-verts', (e: VertexEvent) => {
        const index = e.features?.[0]?.properties?.index;
        if (typeof index !== 'number' || index < 0) return;
        e.preventDefault();
        dragIndex.current = index;
        dragMoved.current = false;
        map.dragPan.disable();
        map.getCanvas().style.cursor = 'grabbing';
      });
      map.on('mousemove', (e) => {
        const index = dragIndex.current;
        if (index === null) return;
        dragMoved.current = true;
        live.current.onVertexMove(index, [e.lngLat.lng, e.lngLat.lat]);
      });
      const endDrag = (): void => {
        if (dragIndex.current === null) return;
        dragIndex.current = null;
        map.dragPan.enable();
        map.getCanvas().style.cursor = live.current.drawing ? 'crosshair' : '';
      };
      map.on('mouseup', endDrag);
      window.addEventListener('mouseup', endDrag);

      map.on('dblclick', 'ed-verts', (e: VertexEvent) => {
        e.preventDefault();
        const index = e.features?.[0]?.properties?.index;
        if (typeof index === 'number' && index >= 0) live.current.onVertexDelete(index);
      });

      map.on('click', (e) => {
        // Щелчок, которым закончили перетаскивание, точкой не считается.
        if (dragMoved.current) {
          dragMoved.current = false;
          return;
        }
        const { ring, onClick } = live.current;
        const point: LonLat = [e.lngLat.lng, e.lngLat.lat];
        // Попадание по точке считаем сами, по расстоянию на экране: так надёжнее,
        // чем спрашивать у карты, что нарисовано под курсором.
        const nearest = ring.findIndex((q) => {
          const s = map.project(q);
          return Math.hypot(s.x - e.point.x, s.y - e.point.y) <= VERTEX_HIT_PX;
        });
        onClick({
          point,
          nearest: nearest >= 0 ? nearest : null,
          insertIndex: edgeInsertIndex(ring, e.point, (q) => map.project(q)),
        });
      });

      setReady(true);
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Показать все зоны офиса и, если она есть, обводимую зону целиком.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const { others, ring } = live.current;

    const points: LonLat[] = ring.length >= 3 ? ring : others.flatMap((o) => o.area);
    if (points.length >= 2) {
      const bounds = points.reduce(
        (b, p) => b.extend(p),
        new LngLatBounds(points[0], points[0]),
      );
      map.fitBounds(bounds, { padding: 70, maxZoom: 18, duration: 0 });
    }
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    (map.getSource(SRC_OTHERS) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: props.others
        .filter((o) => o.area.length >= 3)
        .map((o) => ({
          type: 'Feature' as const,
          properties: { name: o.name, color: o.color },
          geometry: { type: 'Polygon' as const, coordinates: [[...o.area, o.area[0]]] },
        })),
    });
  }, [ready, props.others]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const { ring, color, pending, closingFirst, circleCenter } = props;

    const poly = map.getSource(SRC_POLY) as GeoJSONSource | undefined;
    if (ring.length >= 3) {
      poly?.setData({
        type: 'Feature',
        properties: { color },
        geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
      });
    } else if (ring.length === 2) {
      poly?.setData({
        type: 'Feature',
        properties: { color },
        geometry: { type: 'LineString', coordinates: ring },
      });
    } else {
      poly?.setData({ type: 'FeatureCollection', features: [] });
    }

    const vertex = (
      index: number,
      coordinates: LonLat,
      isPending: boolean,
      closing: boolean,
    ) => ({
      type: 'Feature' as const,
      properties: { index, color, closing, pending: isPending },
      geometry: { type: 'Point' as const, coordinates },
    });

    (map.getSource(SRC_VERTS) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: [
        // У круга ручек нет: сорок восемь точек на окружности только мешают.
        ...(circleCenter
          ? [vertex(-1, circleCenter, true, false)]
          : ring.map((p, i) => vertex(i, p, false, closingFirst && i === 0))),
        ...(pending ? [vertex(-1, pending, true, false)] : []),
      ],
    });

    map.getCanvas().style.cursor = props.drawing ? 'crosshair' : '';
  }, [
    ready,
    props.ring,
    props.color,
    props.pending,
    props.closingFirst,
    props.circleCenter,
    props.drawing,
  ]);

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
