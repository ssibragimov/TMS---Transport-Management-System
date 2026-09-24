import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
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
import {
  WaybillType,
  calculateNormConsumption,
  type NormAdjustment,
  type NormRule,
} from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation, useDictionaries } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { NORM_TYPE_LABEL, fmt } from '@/lib/labels';

/** Достаточно полей из карточки листа, чтобы предзаполнить форму редактирования. */
export interface EditableWaybill {
  id: number;
  type: string;
  vehicleId: number;
  driverId: number;
  validFrom: string;
  validTo: string;
  odometerStart: string | null;
  engineHoursStart: string | null;
  notes: string | null;
  tasks: Array<{
    sequence: number;
    fromPoint: string | null;
    toPoint: string | null;
    flightNumber: string | null;
    aircraftReg: string | null;
    standNumber: string | null;
    distanceKm: string | null;
    engineHours: string | null;
  }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Если задан — редактирование существующего черновика, иначе создание нового. */
  editing?: EditableWaybill | null;
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
  rules: Array<
    Omit<NormRule, 'validFrom' | 'validTo'> & {
      validFrom: string;
      validTo: string | null;
    }
  >;
  adjustments: Array<
    Omit<NormAdjustment, 'validFrom' | 'validTo'> & {
      validFrom: string;
      validTo: string | null;
    }
  >;
}

export function WaybillFormModal({ open, onClose, editing = null }: Props) {
  const { t } = useTranslation();

  const [form] = Form.useForm();
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [driverId, setDriverId] = useState<number | null>(null);

  const { user } = useAuth();
  const dictionaries = useDictionaries();
  // Раскладка задания настраивается по офису (Office.taskLayout): у аэропортов
  // остаётся Рейс/Борт/Стоянка, у офисов из других сфер — либо универсальный
  // Адрес А/Б, либо (TOSHSHAHARNUR и подобные) каскад Регион → Район на месте
  // «Адрес А» (см. AdminPage → «Офисы и аэропорты»).
  const taskLayout = user?.activeOffice.taskLayout ?? 'FLIGHT';
  const isAddressLayout = taskLayout === 'ADDRESS';
  const isRegionDistrictLayout = taskLayout === 'REGION_DISTRICT';
  const hasLocationList = user?.activeOffice.taskAddressALocations ?? false;

  const vehicles = useQuery({
    queryKey: ['vehicles-lookup'],
    enabled: open,
    queryFn: async () =>
      (await api.get('/vehicles', { params: { pageSize: 200, status: 'ACTIVE' } }))
        .data as {
        items: VehicleOption[];
      },
  });

  const drivers = useQuery({
    queryKey: ['drivers-lookup'],
    enabled: open,
    queryFn: async () =>
      (await api.get('/drivers', { params: { pageSize: 200, isActive: true } })).data as {
        items: Array<{
          id: number;
          lastName: string;
          firstName: string;
          personnelNumber: string;
        }>;
      },
  });

  /*
   * Медицинский допуск выбранного водителя.
   *
   * Запрашивается сразу при выборе, а не при сохранении: диспетчер должен
   * видеть запрет до того, как заполнит задания и упрётся в отказ сервера.
   *
   * Блокирует любое отсутствие действующего допуска, а не только отказ врача:
   * порядок в службе — сначала здравпункт, потом техника, поэтому к моменту
   * оформления листа заключение обязано существовать.
   */
  const clearance = useQuery({
    queryKey: ['driver-medical-clearance', driverId],
    enabled: open && driverId !== null,
    queryFn: async () =>
      (
        await api.get<{
          state: string;
          allowed: boolean;
          label: string;
          validUntil: string | null;
        }>(`/drivers/${driverId}/medical-clearance`)
      ).data,
  });

  const refusedByDoctor = clearance.data?.state === 'FAILED';
  /** Нет действующего допуска — лист не создаётся ни в каком виде. */
  const blockedByMedical = clearance.data !== undefined && !clearance.data.allowed;

  // Нормы подтягиваются на выбранную технику: диспетчер должен видеть,
  // по какой ставке будет считаться расход, ДО выдачи листа.
  const norms = useQuery({
    queryKey: ['norms-preview', vehicleId],
    enabled: open && vehicleId !== null,
    queryFn: async () =>
      (await api.get<NormsResponse>('/fuel/norms/preview', { params: { vehicleId } }))
        .data,
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (editing) {
      form.setFieldsValue({
        type: editing.type,
        vehicleId: editing.vehicleId,
        driverId: editing.driverId,
        period: [dayjs(editing.validFrom), dayjs(editing.validTo)],
        odometerStart: editing.odometerStart ? Number(editing.odometerStart) : undefined,
        engineHoursStart: editing.engineHoursStart
          ? Number(editing.engineHoursStart)
          : undefined,
        notes: editing.notes ?? undefined,
        // Только поля, которые реально принимает WaybillTaskDto: у задания из
        // карточки листа есть ещё и id — сервер (whitelist + forbidNonWhitelisted)
        // отклонил бы весь запрос за лишнее свойство, попади оно в payload.
        tasks: editing.tasks.map((task) => ({
          sequence: task.sequence,
          fromPoint: task.fromPoint ?? undefined,
          toPoint: task.toPoint ?? undefined,
          flightNumber: task.flightNumber ?? undefined,
          aircraftReg: task.aircraftReg ?? undefined,
          standNumber: task.standNumber ?? undefined,
          distanceKm: task.distanceKm ? Number(task.distanceKm) : undefined,
          engineHours: task.engineHours ? Number(task.engineHours) : undefined,
        })),
      });
      setVehicleId(editing.vehicleId);
      setDriverId(editing.driverId);
      return;
    }
    form.setFieldsValue({
      type: WaybillType.SHIFT,
      period: [dayjs().hour(8).minute(0), dayjs().hour(20).minute(0)],
      tasks: [{ sequence: 1 }],
    });
    setVehicleId(null);
    setDriverId(null);
  }, [open, editing, form]);

  const save = useApiMutation(
    async (values: Record<string, unknown>) => {
      const [from, to] = values.period as [dayjs.Dayjs, dayjs.Dayjs];
      const tasks = ((values.tasks as Array<Record<string, unknown>>) ?? []).map(
        (task, index) => ({
          ...task,
          sequence: index + 1,
        }),
      );

      const payload = {
        type: values.type,
        vehicleId: values.vehicleId,
        driverId: values.driverId,
        validFrom: from.toISOString(),
        validTo: to.toISOString(),
        odometerStart: values.odometerStart,
        engineHoursStart: values.engineHoursStart,
        notes: values.notes,
        tasks,
      };

      const { data } = editing
        ? await api.patch(`/waybills/${editing.id}`, payload)
        : await api.post('/waybills', payload);
      return data;
    },
    {
      successMessage: editing ? t('Изменения сохранены') : t('Путевой лист создан'),
      invalidate: [['waybills'], ['waybill'], ['office-summary']],
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
    const tasks =
      (form.getFieldValue('tasks') as Array<Record<string, number>> | undefined) ?? [];
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
      title={editing ? t('Изменение путевого листа') : t('Создание путевого листа')}
      okText={editing ? t('Сохранить') : t('Создать')}
      cancelText={t('Отмена')}
      width={900}
      confirmLoading={save.isPending}
      // Кнопка неактивна, а не «нажми и получи отказ»: без действующего
      // допуска лист не создастся, и предлагать попытку бессмысленно.
      // При редактировании черновика это не действует: сервер не перепроверяет
      // допуск на этом шаге (см. комментарий к update() в waybills.service.ts)
      // — иначе нельзя было бы поправить даже примечание, пока водитель не
      // прошёл сегодняшний осмотр, хотя до выдачи это ещё не имеет значения.
      okButtonProps={{ disabled: !editing && blockedByMedical }}
      onCancel={onClose}
      onOk={() => {
        void form.validateFields().then((values) => {
          save.mutate(values, { onSuccess: onClose });
        });
      }}
    >
      <Form form={form} layout="vertical" onValuesChange={() => undefined}>
        {blockedByMedical && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message={clearance.data?.label}
            description={
              refusedByDoctor
                ? t('Путевой лист на этого водителя не создаётся. Требуется замена.')
                : t('Сначала осмотр в здравпункте, затем оформление путевого листа.')
            }
          />
        )}

        <Row gutter={16}>
          <Col span={6}>
            <Form.Item name="type" label={t('Тип')} rules={[{ required: true }]}>
              <Select
                options={[
                  { value: WaybillType.SHIFT, label: t('На смену') },
                  { value: WaybillType.PERIOD, label: t('На период') },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={9}>
            <Form.Item name="vehicleId" label={t('Техника')} rules={[{ required: true }]}>
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
            <Form.Item
              name="driverId"
              label={t('Водитель')}
              rules={[{ required: true }]}
              // Красная рамка и подпись прямо у поля: запрет должен быть
              // виден там, где сделан выбор, а не только в сообщении об ошибке.
              validateStatus={blockedByMedical ? 'error' : undefined}
              help={blockedByMedical ? clearance.data?.label : undefined}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={drivers.isLoading}
                onChange={(value: number) => setDriverId(value)}
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
            <Descriptions.Item label={t('Одометр')}>
              {fmt(vehicle.currentOdometer)} км
            </Descriptions.Item>
            <Descriptions.Item label={t('Моточасы')}>
              {fmt(vehicle.currentEngineHours)}
            </Descriptions.Item>
            <Descriptions.Item label={t('В баке')}>
              {fmt(vehicle.currentFuelLevel, 1)} л
            </Descriptions.Item>
            <Descriptions.Item label={t('Допуск на перрон')}>
              {vehicle.requiresAirsidePermit ? 'нужен' : 'не нужен'}
            </Descriptions.Item>
          </Descriptions>
        )}

        <Row gutter={16}>
          <Col span={10}>
            <Form.Item name="period" label={t('Период')} rules={[{ required: true }]}>
              <DatePicker.RangePicker
                showTime
                format="DD.MM.YYYY HH:mm"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
          <Col span={7}>
            <Form.Item name="odometerStart" label={t('Одометр на выезд')}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={7}>
            <Form.Item name="engineHoursStart" label={t('Моточасы на выезд')}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          {t('Задания')}
        </Divider>

        <Form.List name="tasks">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Row
                  key={field.key}
                  gutter={8}
                  align="middle"
                  style={{ marginBottom: 4 }}
                >
                  {isRegionDistrictLayout ? (
                    <>
                      <Col span={5}>
                        <Form.Item {...field} name={[field.name, 'fromPoint']} noStyle>
                          <Select
                            placeholder={t('Регион')}
                            showSearch
                            optionFilterProp="label"
                            onChange={() =>
                              // Смена региона обнуляет выбранный район — иначе
                              // остался бы район от прежнего региона.
                              form.setFieldValue(
                                ['tasks', field.name, 'aircraftReg'],
                                undefined,
                              )
                            }
                            options={dictionaries.data?.regions.map((r) => ({
                              value: r.name,
                              label: r.name,
                            }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          noStyle
                          shouldUpdate={(prev, next) =>
                            prev.tasks?.[field.name]?.fromPoint !==
                            next.tasks?.[field.name]?.fromPoint
                          }
                        >
                          {({ getFieldValue }) => {
                            const regionName = getFieldValue([
                              'tasks',
                              field.name,
                              'fromPoint',
                            ]);
                            const region = dictionaries.data?.regions.find(
                              (r) => r.name === regionName,
                            );
                            return (
                              <Form.Item
                                {...field}
                                name={[field.name, 'aircraftReg']}
                                noStyle
                              >
                                <Select
                                  placeholder={t('Район')}
                                  disabled={!region}
                                  showSearch
                                  optionFilterProp="label"
                                  options={region?.districts.map((d) => ({
                                    value: d.name,
                                    label: d.name,
                                  }))}
                                />
                              </Form.Item>
                            );
                          }}
                        </Form.Item>
                      </Col>
                      <Col span={7}>
                        <Form.Item {...field} name={[field.name, 'toPoint']} noStyle>
                          <Input placeholder={t('Адрес Б')} />
                        </Form.Item>
                      </Col>
                    </>
                  ) : isAddressLayout ? (
                    <>
                      <Col span={hasLocationList ? 5 : 8}>
                        <Form.Item {...field} name={[field.name, 'fromPoint']} noStyle>
                          <Input placeholder={t('Адрес А')} />
                        </Form.Item>
                      </Col>
                      {hasLocationList && (
                        <Col span={6}>
                          <Form.Item
                            {...field}
                            name={[field.name, 'aircraftReg']}
                            noStyle
                          >
                            <Select
                              placeholder={t('Локация')}
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              options={dictionaries.data?.taskLocations.map((loc) => ({
                                value: loc.name,
                                label: loc.name,
                              }))}
                            />
                          </Form.Item>
                        </Col>
                      )}
                      <Col span={hasLocationList ? 5 : 8}>
                        <Form.Item {...field} name={[field.name, 'toPoint']} noStyle>
                          <Input placeholder={t('Адрес Б')} />
                        </Form.Item>
                      </Col>
                    </>
                  ) : (
                    <>
                      <Col span={4}>
                        <Form.Item {...field} name={[field.name, 'flightNumber']} noStyle>
                          <Input placeholder={t('Рейс')} />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item {...field} name={[field.name, 'aircraftReg']} noStyle>
                          <Input placeholder={t('Борт')} />
                        </Form.Item>
                      </Col>
                      <Col span={3}>
                        <Form.Item {...field} name={[field.name, 'standNumber']} noStyle>
                          <Input placeholder={t('Стоянка')} />
                        </Form.Item>
                      </Col>
                      <Col span={5}>
                        <Form.Item {...field} name={[field.name, 'toPoint']} noStyle>
                          <Input placeholder={t('Куда')} />
                        </Form.Item>
                      </Col>
                    </>
                  )}
                  <Col span={3}>
                    <Form.Item {...field} name={[field.name, 'distanceKm']} noStyle>
                      <InputNumber
                        placeholder={t('км')}
                        min={0}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={3}>
                    <Form.Item {...field} name={[field.name, 'engineHours']} noStyle>
                      <InputNumber
                        placeholder={t('мч')}
                        min={0}
                        style={{ width: '100%' }}
                      />
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
                {t('Добавить задание')}
              </Button>
            </>
          )}
        </Form.List>

        {/*
          Предпросмотр нормы обновляется по кнопке, а не на каждое нажатие
          клавиши: пересчёт по каждому символу в поле «км» мешает вводу.
        */}
        <Divider orientation="left" plain>
          {t('Расчёт нормы')}
        </Divider>

        <Space direction="vertical" style={{ width: '100%' }}>
          <Button
            onClick={() => form.setFieldsValue({ tasks: form.getFieldValue('tasks') })}
          >
            {t('Пересчитать по введённым заданиям')}
          </Button>

          {!vehicleId && (
            <Typography.Text type="secondary">Выберите технику</Typography.Text>
          )}

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
                .map(
                  (r) => `${r.baseRate} ${t(NORM_TYPE_LABEL[r.normType] ?? r.normType)}`,
                )
                .join(' · ')}
              {norms.data.adjustments.length > 0 &&
                ` · надбавки: ${norms.data.adjustments
                  .map((a) =>
                    a.percent !== null ? `${a.percent}%` : `${a.absolutePerUnit} л`,
                  )
                  .join(', ')}`}
            </Typography.Text>
          )}

          {preview && (
            <Alert
              type="info"
              showIcon
              message={`Нормативный расход: ${preview.totalLitres} л`}
              description={preview.lines
                .map(
                  (line) =>
                    `${line.rate} × ${line.quantity} ${line.unit} = ${line.litres} л`,
                )
                .join(' · ')}
            />
          )}
        </Space>

        <Form.Item name="notes" label={t('Примечание')} style={{ marginTop: 16 }}>
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
