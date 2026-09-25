import {
  Alert,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Switch,
  Typography,
  ColorPicker,
  App,
} from 'antd';
import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  LngLatBounds,
  type GeoJSONSource,
  type MapMouseEvent,
} from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import 'maplibre-gl/dist/maplibre-gl.css';

import { useApiMutation } from '@/api/hooks';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { buildOnlineStyle } from '@/lib/basemap';
import {
  circleRing,
  distanceM,
  edgeInsertIndex,
  rectRing,
  ringAreaM2,
  selfIntersects,
  type LonLat,
} from '@/lib/geo';

/**
 * Редактор геозоны на карте.
 *
 * Контур строится щелчками по карте: многоугольник по точкам, круг (центр и
 * радиус) или прямоугольник (два угла). Любой из них потом правится как обычный
 * многоугольник — точки двигаются, по линии добавляются новые, двойной щелчок
 * по точке удаляет её. Библиотеки рисования не подключаются: набор действий
 * небольшой, а лишняя зависимость в сборке дороже сорока строк своего кода.
 */

export interface EditableFence {
  id: number;
  name: string;
  kind: string;
  area: number[][] | null;
  speedLimit: number | null;
  alertOnEntry: boolean;
  alertOnExit: boolean;
  color: string | null;
  isActive: boolean;
}

export const FENCE_KIND_LABEL: Record<string, string> = {
  APRON: 'Перрон',
  PARKING: 'Стоянка',
  FUEL_DEPOT: 'Склад ГСМ',
  PERIMETER: 'Периметр',
  OTHER: 'Прочее',
};

const KIND_COLOR: Record<string, string> = {
  APRON: '#1677ff',
  PARKING: '#52c41a',
  FUEL_DEPOT: '#fa8c16',
  PERIMETER: '#cf1322',
  OTHER: '#722ed1',
};

/** Ограничение скорости, которое разумно предложить для нового перрона. */
const APRON_SPEED = 25;

const DEFAULT_CENTER: LonLat = [69.2401, 41.2995];

type Tool = 'polygon' | 'circle' | 'rect';

const SRC_OTHERS = 'ed-others';
const SRC_POLY = 'ed-poly';
const SRC_VERTS = 'ed-verts';

interface Props {
  open: boolean;
  /** null — новая зона */
  fence: EditableFence | null;
  /** Остальные зоны офиса — рисуются серым для ориентира */
  others: EditableFence[];
  onClose: () => void;
}

export function GeofenceEditor({ open, fence, others, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      width={1220}
      centered
      destroyOnHidden
      maskClosable={false}
      footer={null}
      onCancel={onClose}
      title={fence ? `${t('Геозона')}: ${fence.name}` : t('Новая геозона')}
    >
      <EditorBody fence={fence} others={others} onClose={onClose} />
    </Modal>
  );
}

function EditorBody({
  fence,
  others,
  onClose,
}: {
  fence: EditableFence | null;
  others: EditableFence[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { user } = useAuth();
  const [form] = Form.useForm();

  const office = user?.activeOffice;
  const center: LonLat =
    office?.longitude != null && office?.latitude != null
      ? [office.longitude, office.latitude]
      : DEFAULT_CENTER;

  const initialRing = (fence?.area ?? []) as LonLat[];
  const [ring, setRing] = useState<LonLat[]>(initialRing);
  const [finished, setFinished] = useState(initialRing.length >= 3);
  const [tool, setTool] = useState<Tool>('polygon');
  const [pending, setPending] = useState<LonLat | null>(null);
  const [circle, setCircle] = useState<{ center: LonLat; radius: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [tilesError, setTilesError] = useState(false);
  const [color, setColor] = useState(fence?.color ?? KIND_COLOR.APRON);

  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const dragIndex = useRef<number | null>(null);
  const dragMoved = useRef(false);

  // Обработчики карты создаются один раз, а состояние меняется — читаем его
  // через ссылку, чтобы не переподписываться на каждое движение мыши.
  const live = useRef({ ring, finished, tool, pending });
  live.current = { ring, finished, tool, pending };

  const finish = (points: LonLat[]): void => {
    setRing(points);
    setFinished(true);
    setPending(null);
  };

  useEffect(() => {
    if (!container.current) return;

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
      if ((e as { sourceId?: string }).sourceId === 'osm') setTilesError(true);
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
          'circle-radius': ['case', ['get', 'closing'], 9, ['get', 'pending'], 6, 6],
          'circle-color': ['case', ['get', 'pending'], '#faad14', '#ffffff'],
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-width': 3,
        },
      });

      map.on('mouseenter', 'ed-verts', () => {
        map.getCanvas().style.cursor = 'grab';
      });
      map.on('mouseleave', 'ed-verts', () => {
        map.getCanvas().style.cursor = live.current.finished ? '' : 'crosshair';
      });

      // Перетаскивание точки: пока тянем, карта не должна ехать вместе с мышью.
      map.on(
        'mousedown',
        'ed-verts',
        (
          e: MapMouseEvent & {
            features?: Array<{ properties: Record<string, unknown> }>;
          },
        ) => {
          const index = e.features?.[0]?.properties?.index;
          if (typeof index !== 'number' || index < 0) return;
          e.preventDefault();
          dragIndex.current = index;
          dragMoved.current = false;
          map.dragPan.disable();
          map.getCanvas().style.cursor = 'grabbing';
        },
      );
      map.on('mousemove', (e) => {
        const index = dragIndex.current;
        if (index === null) return;
        dragMoved.current = true;
        setCircle(null);
        setRing((current) =>
          current.map((p, i) =>
            i === index ? ([e.lngLat.lng, e.lngLat.lat] as LonLat) : p,
          ),
        );
      });
      const endDrag = (): void => {
        if (dragIndex.current === null) return;
        dragIndex.current = null;
        map.dragPan.enable();
        map.getCanvas().style.cursor = live.current.finished ? '' : 'crosshair';
      };
      map.on('mouseup', endDrag);
      window.addEventListener('mouseup', endDrag);

      // Двойной щелчок по точке удаляет её — но контур остаётся многоугольником.
      map.on(
        'dblclick',
        'ed-verts',
        (
          e: MapMouseEvent & {
            features?: Array<{ properties: Record<string, unknown> }>;
          },
        ) => {
          e.preventDefault();
          const index = e.features?.[0]?.properties?.index;
          if (typeof index !== 'number' || index < 0 || live.current.ring.length <= 3)
            return;
          setCircle(null);
          setRing((current) => current.filter((_, i) => i !== index));
        },
      );

      map.on('click', (e) => {
        // Щелчок, которым закончили перетаскивание, точкой не считается.
        if (dragMoved.current) {
          dragMoved.current = false;
          return;
        }
        const {
          ring: points,
          finished: done,
          tool: currentTool,
          pending: first,
        } = live.current;
        const p: LonLat = [e.lngLat.lng, e.lngLat.lat];
        // Попадание по точке считаем сами, по расстоянию на экране: так надёжнее,
        // чем спрашивать у карты, что нарисовано под курсором.
        const nearest = points.findIndex((q) => {
          const s = map.project(q);
          return Math.hypot(s.x - e.point.x, s.y - e.point.y) <= 12;
        });
        const hit = nearest >= 0;

        if (!done) {
          if (currentTool === 'polygon') {
            if (hit) {
              if (nearest === 0 && points.length >= 3) finish(points);
              return;
            }
            setRing([...points, p]);
          } else if (!first) {
            setPending(p);
          } else if (currentTool === 'circle') {
            const radius = Math.max(5, Math.round(distanceM(first, p)));
            setCircle({ center: first, radius });
            finish(circleRing(first, radius));
          } else {
            finish(rectRing(first, p));
          }
          return;
        }

        if (hit) return;
        const index = edgeInsertIndex(points, e.point, (q) => map.project(q));
        if (index !== null) {
          setCircle(null);
          setRing([...points.slice(0, index), p, ...points.slice(index)]);
        }
      });

      setReady(true);
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
    // Карта создаётся один раз на время открытого окна.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Показать все зоны офиса и, если она есть, обводимую зону целиком.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const source = map.getSource(SRC_OTHERS) as GeoJSONSource | undefined;
    source?.setData({
      type: 'FeatureCollection',
      features: others
        .filter((o) => o.isActive && o.area && o.area.length >= 3)
        .map((o) => ({
          type: 'Feature' as const,
          properties: { name: o.name, color: o.color ?? '#8c8c8c' },
          geometry: { type: 'Polygon' as const, coordinates: [[...o.area!, o.area![0]]] },
        })),
    });

    const points: LonLat[] =
      ring.length >= 3
        ? ring
        : (others.flatMap((o) => (o.isActive && o.area ? o.area : [])) as LonLat[]);
    if (points.length >= 2) {
      const bounds = points.reduce(
        (b, p) => b.extend(p),
        new LngLatBounds(points[0], points[0]),
      );
      map.fitBounds(bounds, { padding: 70, maxZoom: 18, duration: 0 });
    }
    // Только при открытии: дальше карту двигает сам пользователь.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Контур и его точки перерисовываются при каждом изменении.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

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

    const verts = map.getSource(SRC_VERTS) as GeoJSONSource | undefined;
    verts?.setData({
      type: 'FeatureCollection',
      features: [
        // У круга ручек нет: сорок восемь точек на окружности только мешают,
        // радиус задаётся числом, а для иной формы контур обводится заново.
        ...(circle
          ? [
              {
                type: 'Feature' as const,
                properties: { index: -1, color, closing: false, pending: true },
                geometry: { type: 'Point' as const, coordinates: circle.center },
              },
            ]
          : ring.map((p, index) => ({
              type: 'Feature' as const,
              properties: {
                index,
                color,
                // Первая точка крупнее: по ней замыкается многоугольник.
                closing:
                  !finished && tool === 'polygon' && index === 0 && ring.length >= 3,
                pending: false,
              },
              geometry: { type: 'Point' as const, coordinates: p },
            }))),
        ...(pending
          ? [
              {
                type: 'Feature' as const,
                properties: { index: -1, color, closing: false, pending: true },
                geometry: { type: 'Point' as const, coordinates: pending },
              },
            ]
          : []),
      ],
    });

    map.getCanvas().style.cursor = finished ? '' : 'crosshair';
  }, [ready, ring, pending, finished, tool, color, circle]);

  const restart = (): void => {
    setRing([]);
    setFinished(false);
    setPending(null);
    setCircle(null);
  };

  const undoPoint = (): void => {
    if (pending) {
      setPending(null);
      return;
    }
    setRing((current) => current.slice(0, -1));
  };

  const changeRadius = (radius: number | null): void => {
    if (!circle || !radius || radius < 1) return;
    setCircle({ ...circle, radius });
    setRing(circleRing(circle.center, radius));
  };

  const areaM2 = Math.round(ringAreaM2(ring));
  const crossing = finished && selfIntersects(ring);

  const save = useApiMutation(
    async (values: Record<string, unknown>) => {
      const body = {
        name: values.name,
        kind: values.kind,
        area: ring,
        speedLimit: values.speedLimit ?? null,
        alertOnEntry: Boolean(values.alertOnEntry),
        alertOnExit: Boolean(values.alertOnExit),
        color,
        ...(fence && { isActive: Boolean(values.isActive) }),
      };
      return fence
        ? (await api.patch(`/geofences/${fence.id}`, body)).data
        : (await api.post('/geofences', body)).data;
    },
    {
      successMessage: fence ? t('Геозона сохранена') : t('Геозона создана'),
      invalidate: [['geofences']],
    },
  );

  const submit = (): void => {
    void form.validateFields().then((values) => {
      if (!finished || ring.length < 3) {
        void message.warning(
          t('Обведите зону на карте: минимум три точки, контур нужно замкнуть.'),
        );
        return;
      }
      if (crossing) {
        void message.warning(t('Контур пересекает сам себя — поправьте точки.'));
        return;
      }
      save.mutate(values, { onSuccess: onClose });
    });
  };

  const hint = !finished
    ? tool === 'polygon'
      ? ring.length === 0
        ? t('Щёлкайте по карте, ставя углы зоны.')
        : ring.length < 3
          ? t('Поставьте ещё точки — нужно минимум три.')
          : t('Замкните контур: щёлкните по первой точке или нажмите «Замкнуть».')
      : pending
        ? tool === 'circle'
          ? t('Теперь щёлкните точку на границе круга — это задаст радиус.')
          : t('Теперь щёлкните противоположный угол прямоугольника.')
        : tool === 'circle'
          ? t('Щёлкните центр круга.')
          : t('Щёлкните один из углов прямоугольника.')
    : t(
        'Тяните точки, чтобы подвинуть. Щёлкните по линии — добавится точка. Двойной щелчок по точке удаляет её.',
      );

  return (
    <Row gutter={16}>
      <Col xs={24} lg={15}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {/* Высота панели закреплена: кнопки появляются по ходу рисования, и без
              резерва карта под курсором «уезжала» бы на каждом щелчке. */}
          <Space wrap style={{ minHeight: 72, alignContent: 'flex-start' }}>
            <Segmented<Tool>
              value={tool}
              disabled={finished || ring.length > 0 || pending !== null}
              onChange={setTool}
              options={[
                { label: t('Многоугольник'), value: 'polygon' },
                { label: t('Круг'), value: 'circle' },
                { label: t('Прямоугольник'), value: 'rect' },
              ]}
            />
            {!finished && tool === 'polygon' && ring.length >= 3 && (
              <Button type="primary" onClick={() => finish(ring)}>
                {t('Замкнуть')}
              </Button>
            )}
            {!finished && (ring.length > 0 || pending) && (
              <Button onClick={undoPoint}>{t('Убрать последнюю точку')}</Button>
            )}
            {(finished || ring.length > 0) && (
              <Button danger onClick={restart}>
                {t('Обвести заново')}
              </Button>
            )}
            {circle && (
              <Space size={6}>
                <Typography.Text type="secondary">{t('Радиус, м')}</Typography.Text>
                <InputNumber
                  min={1}
                  max={20000}
                  value={circle.radius}
                  onChange={changeRadius}
                  style={{ width: 100 }}
                />
              </Space>
            )}
          </Space>

          <Typography.Text type="secondary" style={{ display: 'block', minHeight: 44 }}>
            {hint}
          </Typography.Text>

          {tilesError && (
            <Alert
              type="warning"
              showIcon
              message={t(
                'Подложка карты не загрузилась — проверьте подключение к интернету. Зону можно обвести и без неё.',
              )}
            />
          )}

          <div
            ref={container}
            style={{
              height: 560,
              borderRadius: 8,
              overflow: 'hidden',
              border: '1px solid rgba(0,0,0,0.12)',
            }}
          />

          <Typography.Text type={crossing ? 'danger' : 'secondary'}>
            {crossing
              ? t('Контур пересекает сам себя — поправьте точки.')
              : `${t('Точек')}: ${ring.length}${
                  finished && areaM2 > 0
                    ? ` · ${t('Площадь')}: ${
                        areaM2 >= 10_000
                          ? `${(areaM2 / 10_000).toFixed(2)} ${t('га')}`
                          : `${areaM2.toLocaleString('ru-RU')} ${t('м²')}`
                      }`
                    : ''
                }`}
          </Typography.Text>
        </Space>
      </Col>

      <Col xs={24} lg={9}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            name: fence?.name,
            kind: fence?.kind ?? 'APRON',
            speedLimit: fence ? fence.speedLimit : APRON_SPEED,
            alertOnEntry: fence?.alertOnEntry ?? false,
            alertOnExit: fence?.alertOnExit ?? false,
            isActive: fence?.isActive ?? true,
          }}
          onValuesChange={(changed) => {
            // У нового перрона сразу предлагаются привычные цвет и скорость;
            // у существующей зоны выбор пользователя не трогаем.
            if ('kind' in changed && !fence) {
              setColor(KIND_COLOR[changed.kind as string] ?? KIND_COLOR.OTHER);
              form.setFieldValue(
                'speedLimit',
                changed.kind === 'APRON' ? APRON_SPEED : undefined,
              );
            }
          }}
        >
          <Form.Item
            name="name"
            label={t('Название')}
            rules={[{ required: true, message: t('Обязательное поле') }]}
          >
            <Input maxLength={160} placeholder={t('Например: Перрон 2')} />
          </Form.Item>

          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="kind" label={t('Тип')}>
                <Select
                  options={Object.entries(FENCE_KIND_LABEL).map(([value, label]) => ({
                    value,
                    label: t(label),
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item label={t('Цвет')}>
                <ColorPicker
                  value={color}
                  disabledAlpha
                  onChange={(c) => setColor(c.toHexString())}
                  presets={[{ label: t('Цвета'), colors: Object.values(KIND_COLOR) }]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="speedLimit"
            label={t('Ограничение скорости, км/ч')}
            tooltip={t(
              'Если техника едет быстрее внутри зоны, появится оповещение. Пусто — без ограничения.',
            )}
          >
            <InputNumber min={1} max={200} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="alertOnEntry"
            label={t('Оповещать о въезде')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="alertOnExit"
            label={t('Оповещать о выезде')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          {fence && (
            <Form.Item
              name="isActive"
              label={t('Зона действует')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          )}
        </Form>

        <Space style={{ justifyContent: 'flex-end', width: '100%', marginTop: 8 }}>
          <Button onClick={onClose}>{t('Отмена')}</Button>
          <Button type="primary" loading={save.isPending} onClick={submit}>
            {t('Сохранить')}
          </Button>
        </Space>
      </Col>
    </Row>
  );
}
