import {
  Alert,
  App,
  Button,
  Col,
  ColorPicker,
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
} from 'antd';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import {
  circleRing,
  distanceM,
  rectRing,
  ringAreaM2,
  selfIntersects,
  type LonLat,
} from '@/lib/geo';
import { YANDEX_MAPS_KEY } from '@/lib/yandexMaps';

import type { CanvasClick, CanvasOtherZone } from './geofenceCanvas';
import { GeofenceLibreCanvas } from './GeofenceLibreCanvas';
import { GeofenceYandexCanvas } from './GeofenceYandexCanvas';

/**
 * Редактор геозоны на карте.
 *
 * Контур строится щелчками по карте: многоугольник по точкам, круг (центр и
 * радиус) или прямоугольник (два угла). Любой из них потом правится как обычный
 * многоугольник — точки двигаются, по линии добавляются новые, двойной щелчок
 * по точке удаляет её.
 *
 * Карта — Яндекс, если задан ключ и он принят, иначе OpenStreetMap. Вся логика
 * рисования здесь, карты только показывают состояние (см. geofenceCanvas).
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

interface Props {
  open: boolean;
  /** null — новая зона */
  fence: EditableFence | null;
  /** Остальные зоны офиса — рисуются для ориентира */
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
  const [color, setColor] = useState(fence?.color ?? KIND_COLOR.APRON);
  const [tilesError, setTilesError] = useState(false);
  // Причина, по которой Яндекс не открылся; пока null — пробуем его.
  const [yandexError, setYandexError] = useState<string | null>(null);
  const useYandex = Boolean(YANDEX_MAPS_KEY) && yandexError === null;

  // Обработчики карты вызываются из событий, а состояние меняется — читаем
  // актуальное через ссылку, чтобы карта не переподписывалась на каждый щелчок.
  const live = useRef({ ring, finished, tool, pending });
  live.current = { ring, finished, tool, pending };

  const otherZones = useMemo<CanvasOtherZone[]>(
    () =>
      others
        .filter((o) => o.isActive && o.area && o.area.length >= 3)
        .map((o) => ({
          name: o.name,
          color: o.color ?? '#8c8c8c',
          area: o.area as LonLat[],
        })),
    [others],
  );

  const finish = (points: LonLat[]): void => {
    setRing(points);
    setFinished(true);
    setPending(null);
  };

  const handleClick = ({ point, nearest, insertIndex }: CanvasClick): void => {
    const {
      ring: points,
      finished: done,
      tool: currentTool,
      pending: first,
    } = live.current;
    const hit = nearest !== null;

    if (!done) {
      if (currentTool === 'polygon') {
        if (hit) {
          if (nearest === 0 && points.length >= 3) finish(points);
          return;
        }
        setRing([...points, point]);
      } else if (!first) {
        setPending(point);
      } else if (currentTool === 'circle') {
        const radius = Math.max(5, Math.round(distanceM(first, point)));
        setCircle({ center: first, radius });
        finish(circleRing(first, radius));
      } else {
        finish(rectRing(first, point));
      }
      return;
    }

    if (hit || insertIndex === null) return;
    setCircle(null);
    setRing([...points.slice(0, insertIndex), point, ...points.slice(insertIndex)]);
  };

  const handleVertexMove = (index: number, point: LonLat): void => {
    setCircle(null);
    setRing((current) => current.map((p, i) => (i === index ? point : p)));
  };

  const handleVertexDelete = (index: number): void => {
    if (live.current.ring.length <= 3) return;
    setCircle(null);
    setRing((current) => current.filter((_, i) => i !== index));
  };

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

  const canvasProps = {
    center,
    others: otherZones,
    ring,
    color,
    drawing: !finished,
    closingFirst: !finished && tool === 'polygon' && ring.length >= 3,
    pending,
    circleCenter: circle ? circle.center : null,
    onClick: handleClick,
    onVertexMove: handleVertexMove,
    onVertexDelete: handleVertexDelete,
  };

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

          {YANDEX_MAPS_KEY && yandexError !== null && (
            <Alert
              type="info"
              showIcon
              message={t('Карта Яндекса недоступна — показана резервная (OpenStreetMap)')}
              description={
                <Typography.Text type="secondary">{yandexError}</Typography.Text>
              }
            />
          )}
          {tilesError && (
            <Alert
              type="warning"
              showIcon
              message={t(
                'Подложка карты не загрузилась — проверьте подключение к интернету. Зону можно обвести и без неё.',
              )}
            />
          )}

          {useYandex ? (
            <GeofenceYandexCanvas {...canvasProps} onUnavailable={setYandexError} />
          ) : (
            <GeofenceLibreCanvas
              {...canvasProps}
              onTilesError={() => setTilesError(true)}
            />
          )}

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
