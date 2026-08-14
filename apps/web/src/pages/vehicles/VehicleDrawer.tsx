import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { PERMISSIONS, VehicleDocumentType } from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import {
  CATEGORY_LABEL,
  DOCUMENT_TYPE_LABEL,
  METER_LABEL,
  OWNERSHIP_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  fmt,
} from '@/lib/labels';

import { VehiclePhotos } from './VehiclePhotos';

interface Props {
  vehicleId: number | null;
  onClose: () => void;
}

interface VehicleDetail {
  id: number;
  garageNumber: string;
  plateNumber: string | null;
  vin: string | null;
  inventoryNumber: string | null;
  category: string;
  status: string;
  ownership: string;
  meterType: string;
  tankCapacity: string | null;
  currentOdometer: string | null;
  currentEngineHours: string | null;
  currentFuelLevel: string;
  manufactureYear: number | null;
  requiresAirsidePermit: boolean;
  notes: string | null;
  model: { manufacturer: string; model: string } | null;
  department: { name: string } | null;
  fuelType: { name: string } | null;
  norms: Array<{
    id: number;
    normType: string;
    baseRate: string;
    validFrom: string;
    validTo: string | null;
  }>;
}

interface DocumentRow {
  id: number;
  type: string;
  number: string | null;
  issuer: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  amount: string | null;
}

interface MeterRow {
  id: string;
  recordedAt: string;
  odometer: string | null;
  engineHours: string | null;
  source: string;
  comment: string | null;
}

export function VehicleDrawer({ vehicleId, onClose }: Props) {
  const { can } = useAuth();
  const [docModal, setDocModal] = useState(false);
  const [meterModal, setMeterModal] = useState(false);
  const [docForm] = Form.useForm();
  const [meterForm] = Form.useForm();

  const open = vehicleId !== null;

  const vehicle = useQuery({
    queryKey: ['vehicle', vehicleId],
    enabled: open,
    queryFn: async () => {
      const { data } = await api.get<VehicleDetail>(`/vehicles/${vehicleId}`);
      return data;
    },
  });

  const documents = useQuery({
    queryKey: ['vehicle-documents', vehicleId],
    enabled: open,
    queryFn: async () => {
      const { data } = await api.get<DocumentRow[]>(`/vehicles/${vehicleId}/documents`);
      return data;
    },
  });

  const meters = useQuery({
    queryKey: ['vehicle-meters', vehicleId],
    enabled: open,
    queryFn: async () => {
      const { data } = await api.get<MeterRow[]>(`/vehicles/${vehicleId}/meters`);
      return data;
    },
  });

  const addDocument = useApiMutation(
    async (values: Record<string, unknown>) => {
      const { data } = await api.post(`/vehicles/${vehicleId}/documents`, {
        ...values,
        issuedAt: values.issuedAt ? (values.issuedAt as dayjs.Dayjs).format('YYYY-MM-DD') : undefined,
        expiresAt: values.expiresAt ? (values.expiresAt as dayjs.Dayjs).format('YYYY-MM-DD') : undefined,
      });
      return data;
    },
    { successMessage: 'Документ добавлен', invalidate: [['vehicle-documents'], ['expiring']] },
  );

  const removeDocument = useApiMutation(
    async (documentId: number) => {
      const { data } = await api.delete(`/vehicles/${vehicleId}/documents/${documentId}`);
      return data;
    },
    { successMessage: 'Документ удалён', invalidate: [['vehicle-documents'], ['expiring']] },
  );

  const adjustMeter = useApiMutation(
    async (values: Record<string, unknown>) => {
      const { data } = await api.post(`/vehicles/${vehicleId}/meters`, values);
      return data;
    },
    {
      successMessage: 'Показания скорректированы',
      invalidate: [['vehicle'], ['vehicle-meters'], ['vehicles']],
    },
  );

  const v = vehicle.data;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={860}
      title={
        v ? (
          <Space>
            <span>{v.garageNumber}</span>
            <Tag color={STATUS_COLOR[v.status]}>{STATUS_LABEL[v.status] ?? v.status}</Tag>
          </Space>
        ) : (
          'Карточка техники'
        )
      }
      loading={vehicle.isLoading}
    >
      {v && (
        <Tabs
          items={[
            {
              key: 'info',
              label: 'Общие сведения',
              children: (
                <>
                  <Descriptions bordered size="small" column={2}>
                    <Descriptions.Item label="Госномер">{v.plateNumber ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label="Инвентарный">{v.inventoryNumber ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label="Модель">
                      {v.model ? `${v.model.manufacturer} ${v.model.model}` : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Категория">
                      {CATEGORY_LABEL[v.category] ?? v.category}
                    </Descriptions.Item>
                    <Descriptions.Item label="Подразделение">{v.department?.name ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label="Владение">
                      {OWNERSHIP_LABEL[v.ownership] ?? v.ownership}
                    </Descriptions.Item>
                    <Descriptions.Item label="Счётчик">
                      {METER_LABEL[v.meterType] ?? v.meterType}
                    </Descriptions.Item>
                    <Descriptions.Item label="Топливо">{v.fuelType?.name ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label="Одометр, км">{fmt(v.currentOdometer)}</Descriptions.Item>
                    <Descriptions.Item label="Моточасы">{fmt(v.currentEngineHours)}</Descriptions.Item>
                    <Descriptions.Item label="В баке, л">{fmt(v.currentFuelLevel, 1)}</Descriptions.Item>
                    <Descriptions.Item label="Ёмкость бака, л">{fmt(v.tankCapacity)}</Descriptions.Item>
                    <Descriptions.Item label="Год выпуска">{v.manufactureYear ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label="Допуск на перрон">
                      {v.requiresAirsidePermit ? 'Требуется' : 'Не требуется'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Примечание" span={2}>
                      {v.notes ?? '—'}
                    </Descriptions.Item>
                  </Descriptions>

                  <h4 style={{ marginTop: 24 }}>Действующие нормы расхода</h4>
                  {v.norms.length === 0 ? (
                    <Empty description="Норм не задано — расход считаться не будет" />
                  ) : (
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={v.norms}
                      columns={[
                        { title: 'База', dataIndex: 'normType' },
                        { title: 'Ставка', dataIndex: 'baseRate' },
                        {
                          title: 'Действует с',
                          dataIndex: 'validFrom',
                          render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
                        },
                      ]}
                    />
                  )}
                </>
              ),
            },
            {
              key: 'documents',
              label: `Документы (${documents.data?.length ?? 0})`,
              children: (
                <>
                  {can(PERMISSIONS.VEHICLE_DOCUMENT_MANAGE) && (
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      style={{ marginBottom: 12 }}
                      onClick={() => {
                        docForm.resetFields();
                        setDocModal(true);
                      }}
                    >
                      Добавить документ
                    </Button>
                  )}
                  <Table<DocumentRow>
                    size="small"
                    rowKey="id"
                    loading={documents.isLoading}
                    dataSource={documents.data ?? []}
                    pagination={false}
                    columns={[
                      {
                        title: 'Тип',
                        dataIndex: 'type',
                        render: (t: string) => DOCUMENT_TYPE_LABEL[t] ?? t,
                      },
                      { title: 'Номер', dataIndex: 'number' },
                      {
                        title: 'Действует до',
                        dataIndex: 'expiresAt',
                        render: (d: string | null) => {
                          if (!d) return '—';
                          const daysLeft = dayjs(d).diff(dayjs(), 'day');
                          const color = daysLeft < 0 ? 'red' : daysLeft <= 30 ? 'orange' : undefined;
                          return <Tag color={color}>{dayjs(d).format('DD.MM.YYYY')}</Tag>;
                        },
                      },
                      { title: 'Кем выдан', dataIndex: 'issuer' },
                      ...(can(PERMISSIONS.VEHICLE_DOCUMENT_MANAGE)
                        ? [
                            {
                              title: '',
                              width: 50,
                              render: (_: unknown, row: DocumentRow) => (
                                <Popconfirm
                                  title="Удалить документ?"
                                  okText="Удалить"
                                  cancelText="Отмена"
                                  onConfirm={() => removeDocument.mutate(row.id)}
                                >
                                  <Button type="text" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'photos',
              label: 'Фотографии',
              children: <VehiclePhotos vehicleId={v.id} />,
            },
            {
              key: 'meters',
              label: 'Счётчики',
              children: (
                <>
                  {can(PERMISSIONS.VEHICLE_METER_ADJUST) && (
                    <Button
                      style={{ marginBottom: 12 }}
                      onClick={() => {
                        meterForm.resetFields();
                        setMeterModal(true);
                      }}
                    >
                      Скорректировать показания
                    </Button>
                  )}
                  <Table<MeterRow>
                    size="small"
                    rowKey="id"
                    loading={meters.isLoading}
                    dataSource={meters.data ?? []}
                    pagination={{ pageSize: 15 }}
                    columns={[
                      {
                        title: 'Дата',
                        dataIndex: 'recordedAt',
                        render: (d: string) => dayjs(d).format('DD.MM.YYYY HH:mm'),
                      },
                      {
                        title: 'Одометр',
                        dataIndex: 'odometer',
                        align: 'right',
                        render: (x: string | null) => fmt(x),
                      },
                      {
                        title: 'Моточасы',
                        dataIndex: 'engineHours',
                        align: 'right',
                        render: (x: string | null) => fmt(x),
                      },
                      { title: 'Источник', dataIndex: 'source', width: 110 },
                      { title: 'Комментарий', dataIndex: 'comment' },
                    ]}
                  />
                </>
              ),
            },
          ]}
        />
      )}

      <Modal
        open={docModal}
        title="Документ техники"
        okText="Добавить"
        cancelText="Отмена"
        confirmLoading={addDocument.isPending}
        onCancel={() => setDocModal(false)}
        onOk={() => {
          void docForm.validateFields().then((values) => {
            addDocument.mutate(values, { onSuccess: () => setDocModal(false) });
          });
        }}
      >
        <Form form={docForm} layout="vertical">
          <Form.Item name="type" label="Тип документа" rules={[{ required: true }]}>
            <Select
              options={Object.values(VehicleDocumentType).map((t) => ({
                value: t,
                label: DOCUMENT_TYPE_LABEL[t] ?? t,
              }))}
            />
          </Form.Item>
          <Form.Item name="number" label="Номер">
            <Input />
          </Form.Item>
          <Form.Item name="issuer" label="Кем выдан">
            <Input />
          </Form.Item>
          <Space>
            <Form.Item name="issuedAt" label="Дата выдачи">
              <DatePicker format="DD.MM.YYYY" />
            </Form.Item>
            <Form.Item
              name="expiresAt"
              label="Действует до"
              tooltip="По этой дате документ попадает в дашборд истекающих сроков"
            >
              <DatePicker format="DD.MM.YYYY" />
            </Form.Item>
          </Space>
          <Form.Item name="amount" label="Сумма (для страховок)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={meterModal}
        title="Корректировка показаний"
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={adjustMeter.isPending}
        onCancel={() => setMeterModal(false)}
        onOk={() => {
          void meterForm.validateFields().then((values) => {
            adjustMeter.mutate(values, { onSuccess: () => setMeterModal(false) });
          });
        }}
      >
        <Form form={meterForm} layout="vertical">
          <Form.Item name="odometer" label="Одометр, км">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="engineHours" label="Моточасы">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="comment"
            label="Основание"
            rules={[{ required: true, message: 'Основание обязательно — оно останется в истории' }]}
          >
            <Input.TextArea rows={2} placeholder="Замена одометра, акт № ... от ..." />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}
