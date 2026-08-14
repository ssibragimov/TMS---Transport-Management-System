import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { WaybillType, calculateNormConsumption, type NormAdjustment, type NormRule } from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { NORM_TYPE_LABEL, fmt } from '@/lib/labels';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface VehicleOption {
  id: number;
  garageNumber: string;
  plateNumber: string | null;
  meterType: string;
  currentOdometer: string | null;
  currentEngineHours: string | null;
  currentFuelLevel: string;
  requiresAirsidePermit: boolean;
}

interface NormsResponse {
  rules: Array<Omit<NormRule, 'validFrom' | 'validTo'> & { validFrom: string; validTo: string | null }>;
  adjustments: Array<
    Omit<NormAdjustment, 'validFrom' | 'validTo'> & { validFrom: string; validTo: string | null }
  >;
}

export function WaybillFormModal({ open, onClose }: Props) {
  const [form] = Form.useForm();
  const [vehicleId, setVehicleId] = useState<number | null>(null);

  const vehicles = useQuery({
    queryKey: ['vehicles-lookup'],
    enabled: open,
    queryFn: async () =>
      (await api.get('/vehicles', { params: { pageSize: 200, status: 'ACTIVE' } })).data as {
        items: VehicleOption[];
      },
  });

  const drivers = useQuery({
    queryKey: ['drivers-lookup'],
    enabled: open,
    queryFn: async () =>
      (await api.get('/drivers', { params: { pageSize: 200, isActive: true } })).data as {
        items: Array<{ id: number; lastName: string; firstName: string; personnelNumber: string }>;
      },
  });

  // Нормы подтягиваются на выбранную технику: диспетчер должен видеть,
  // по какой ставке будет считаться расход, ДО выдачи листа.
  const norms = useQuery({
    queryKey: ['norms-preview', vehicleId],
    enabled: open && vehicleId !== null,
    queryFn: async () =>
      (await api.get<NormsResponse>('/fuel/norms/preview', { params: { vehicleId } })).data,
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      type: WaybillType.SHIFT,
      period: [dayjs().hour(8).minute(0), dayjs().hour(20).minute(0)],
      tasks: [{ sequence: 1 }],
    });
    setVehicleId(null);
  }, [open, form]);

  const create = useApiMutation(
    async (values: Record<string, unknown>) => {
      const [from, to] = values.period as [dayjs.Dayjs, dayjs.Dayjs];
      const tasks = ((values.tasks as Array<Record<string, unknown>>) ?? []).map((task, index) => ({
        ...task,
        sequence: index + 1,
      }));

      const { data } = await api.post('/waybills', {
        type: values.type,
        vehicleId: values.vehicleId,
        driverId: values.driverId,
        validFrom: from.toISOString(),
        validTo: to.toISOString(),
        odometerStart: values.odometerStart,
        engineHoursStart: values.engineHoursStart,
        notes: values.notes,
        tasks,
      });
      return data;
    },
    {
      successMessage: 'Путевой лист создан',
      invalidate: [['waybills'], ['office-summary']],
    },
  );

  const vehicle = vehicles.data?.items.find((v) => v.id === vehicleId);

  /**
   * Предварительный расчёт нормы по введённым заданиям.
   * Считается тем же движком, что и на сервере при закрытии, поэтому
   * цифра в форме и цифра в закрытом документе совпадут.
   */
  const preview = (() => {
    if (!norms.data) return null;
    const tasks = (form.getFieldValue('tasks') as Array<Record<string, number>> | undefined) ?? [];
    const distanceKm = tasks.reduce((sum, t) => sum + (Number(t?.distanceKm) || 0), 0);
    const engineHours = tasks.reduce((sum, t) => sum + (Number(t?.engineHours) || 0), 0);
    if (distanceKm === 0 && engineHours === 0) return null;

    return calculateNormConsumption({
      onDate: new Date(),
      volume: { distanceKm, engineHours, operations: tasks.length, shifts: 1 },
      rules: norms.data.rules.map((r) => ({
        ...r,
        validFrom: new Date(r.validFrom),
        validTo: r.validTo ? new Date(r.validTo) : null,
      })),
      adjustments: norms.data.adjustments.map((a) => ({
        ...a,
        validFrom: new Date(a.validFrom),
        validTo: a.validTo ? new Date(a.validTo) : null,
      })),
    });
  })();

  return (
    <Modal
      open={open}
      title="Создание путевого листа"
      okText="Создать"
      cancelText="Отмена"
      width={900}
      confirmLoading={create.isPending}
      onCancel={onClose}
      onOk={() => {
        void form.validateFields().then((values) => {
          create.mutate(values, { onSuccess: onClose });
        });
      }}
    >
      <Form form={form} layout="vertical" onValuesChange={() => undefined}>
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item name="type" label="Тип" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: WaybillType.SHIFT, label: 'На смену' },
                  { value: WaybillType.PERIOD, label: 'На период' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={9}>
            <Form.Item name="vehicleId" label="Техника" rules={[{ required: true }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={vehicles.isLoading}
                onChange={(id: number) => {
                  setVehicleId(id);
                  const selected = vehicles.data?.items.find((v) => v.id === id);
                  form.setFieldsValue({
                    odometerStart: selected?.currentOdometer
                      ? Number(selected.currentOdometer)
                      : undefined,
                    engineHoursStart: selected?.currentEngineHours
                      ? Number(selected.currentEngineHours)
                      : undefined,
                  });
                }}
                options={vehicles.data?.items.map((v) => ({
                  value: v.id,
                  label: `${v.garageNumber}${v.plateNumber ? ` · ${v.plateNumber}` : ''}`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={9}>
            <Form.Item name="driverId" label="Водитель" rules={[{ required: true }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={drivers.isLoading}
                options={drivers.data?.items.map((d) => ({
                  value: d.id,
                  label: `${d.lastName} ${d.firstName} (${d.personnelNumber})`,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        {vehicle && (
          <Descriptions size="small" column={4} style={{ marginBottom: 16 }} bordered>
            <Descriptions.Item label="Одометр">{fmt(vehicle.currentOdometer)} км</Descriptions.Item>
            <Descriptions.Item label="Моточасы">{fmt(vehicle.currentEngineHours)}</Descriptions.Item>
            <Descriptions.Item label="В баке">{fmt(vehicle.currentFuelLevel, 1)} л</Descriptions.Item>
            <Descriptions.Item label="Допуск на перрон">
              {vehicle.requiresAirsidePermit ? 'нужен' : 'не нужен'}
            </Descriptions.Item>
          </Descriptions>
        )}

        <Row gutter={16}>
          <Col span={10}>
            <Form.Item name="period" label="Период" rules={[{ required: true }]}>
              <DatePicker.RangePicker showTime format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={7}>
            <Form.Item name="odometerStart" label="Одометр на выезд">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={7}>
            <Form.Item name="engineHoursStart" label="Моточасы на выезд">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          Задания
        </Divider>

        <Form.List name="tasks">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Row key={field.key} gutter={8} align="middle" style={{ marginBottom: 4 }}>
                  <Col span={4}>
                    <Form.Item {...field} name={[field.name, 'flightNumber']} noStyle>
                      <Input placeholder="Рейс" />
                    </Form.Item>
                  </Col>
                  <Col span={4}>
                    <Form.Item {...field} name={[field.name, 'aircraftReg']} noStyle>
                      <Input placeholder="Борт" />
                    </Form.Item>
                  </Col>
                  <Col span={3}>
                    <Form.Item {...field} name={[field.name, 'standNumber']} noStyle>
                      <Input placeholder="Стоянка" />
                    </Form.Item>
                  </Col>
                  <Col span={5}>
                    <Form.Item {...field} name={[field.name, 'toPoint']} noStyle>
                      <Input placeholder="Куда" />
                    </Form.Item>
                  </Col>
                  <Col span={3}>
                    <Form.Item {...field} name={[field.name, 'distanceKm']} noStyle>
                      <InputNumber placeholder="км" min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={3}>
                    <Form.Item {...field} name={[field.name, 'engineHours']} noStyle>
                      <InputNumber placeholder="мч" min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={2}>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                    />
                  </Col>
                </Row>
              ))}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => add({})}
                style={{ width: '100%', marginTop: 8 }}
              >
                Добавить задание
              </Button>
            </>
          )}
        </Form.List>

        {/*
          Предпросмотр нормы обновляется по кнопке, а не на каждое нажатие
          клавиши: пересчёт по каждому символу в поле «км» мешает вводу.
        */}
        <Divider orientation="left" plain>
          Расчёт нормы
        </Divider>

        <Space direction="vertical" style={{ width: '100%' }}>
          <Button onClick={() => form.setFieldsValue({ tasks: form.getFieldValue('tasks') })}>
            Пересчитать по введённым заданиям
          </Button>

          {!vehicleId && <Typography.Text type="secondary">Выберите технику</Typography.Text>}

          {vehicleId && norms.data?.rules.length === 0 && (
            <Alert
              type="warning"
              showIcon
              message="Для этой техники не задано ни одной нормы — расход при закрытии посчитается нулевым"
            />
          )}

          {norms.data && norms.data.rules.length > 0 && (
            <Typography.Text type="secondary">
              Действующие ставки:{' '}
              {norms.data.rules
                .map((r) => `${r.baseRate} ${NORM_TYPE_LABEL[r.normType] ?? r.normType}`)
                .join(' · ')}
              {norms.data.adjustments.length > 0 &&
                ` · надбавки: ${norms.data.adjustments
                  .map((a) => (a.percent !== null ? `${a.percent}%` : `${a.absolutePerUnit} л`))
                  .join(', ')}`}
            </Typography.Text>
          )}

          {preview && (
            <Alert
              type="info"
              showIcon
              message={`Нормативный расход: ${preview.totalLitres} л`}
              description={preview.lines
                .map((line) => `${line.rate} × ${line.quantity} ${line.unit} = ${line.litres} л`)
                .join(' · ')}
            />
          )}
        </Space>

        <Form.Item name="notes" label="Примечание" style={{ marginTop: 16 }}>
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
