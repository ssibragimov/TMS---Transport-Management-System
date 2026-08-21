import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
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

import { EntityAuditLog } from '@/components/EntityAuditLog';
import { EntityId } from '@/components/EntityId';
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
  const { t } = useTranslation();

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
    { successMessage: t("Документ добавлен"), invalidate: [['vehicle-documents'], ['expiring']] },
  );

  const removeDocument = useApiMutation(
    async (documentId: number) => {
      const { data } = await api.delete(`/vehicles/${vehicleId}/documents/${documentId}`);
      return data;
    },
    { successMessage: t("Документ удалён"), invalidate: [['vehicle-documents'], ['expiring']] },
  );

  const adjustMeter = useApiMutation(
    async (values: Record<string, unknown>) => {
      const { data } = await api.post(`/vehicles/${vehicleId}/meters`, values);
      return data;
    },
    {
      successMessage: t("Показания скорректированы"),
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
            <Tag color={STATUS_COLOR[v.status]}>{t(STATUS_LABEL[v.status] ?? v.status)}</Tag>
          </Space>
        ) : (
          'Карточка техники'
        )
      }
      extra={<EntityId id={v?.id} />}
      loading={vehicle.isLoading}
    >
      {v && (
        <Tabs
          items={[
            {
              key: 'info',
              label: t("Общие сведения"),
              children: (
                <>
                  <Descriptions bordered size="small" column={2}>
                    <Descriptions.Item label={t("Госномер")}>{v.plateNumber ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label={t("Инвентарный")}>{v.inventoryNumber ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label={t("Модель")}>
                      {v.model ? `${v.model.manufacturer} ${v.model.model}` : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("Категория")}>
                      {t(CATEGORY_LABEL[v.category] ?? v.category)}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("Подразделение")}>{v.department?.name ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label={t("Владение")}>
                      {t(OWNERSHIP_LABEL[v.ownership] ?? v.ownership)}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("Счётчик")}>
                      {t(METER_LABEL[v.meterType] ?? v.meterType)}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("Топливо")}>{v.fuelType?.name ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label={t("Одометр, км")}>{fmt(v.currentOdometer)}</Descriptions.Item>
                    <Descriptions.Item label={t("Моточасы")}>{fmt(v.currentEngineHours)}</Descriptions.Item>
                    <Descriptions.Item label={t("В баке, л")}>{fmt(v.currentFuelLevel, 1)}</Descriptions.Item>
                    <Descriptions.Item label={t("Ёмкость бака, л")}>{fmt(v.tankCapacity)}</Descriptions.Item>
                    <Descriptions.Item label={t("Год выпуска")}>{v.manufactureYear ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label={t("Допуск на перрон")}>
                      {v.requiresAirsidePermit ? 'Требуется' : 'Не требуется'}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("Примечание")} span={2}>
                      {v.notes ?? '—'}
                    </Descriptions.Item>
                  </Descriptions>

                  <h4 style={{ marginTop: 24 }}>Действующие нормы расхода</h4>
                  {v.norms.length === 0 ? (
                    <Empty description={t("Норм не задано — расход считаться не будет")} />
                  ) : (
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={v.norms}
                      columns={[
                        { title: t("База"), dataIndex: 'normType' },
                        { title: t("Ставка"), dataIndex: 'baseRate' },
                        {
                          title: t("Действует с"),
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
                      {t("Добавить документ")}
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
                        title: t("Тип"),
                        dataIndex: 'type',
                        render: (code: string) => t(DOCUMENT_TYPE_LABEL[code] ?? code),
                      },
                      { title: t("Номер"), dataIndex: 'number' },
                      {
                        title: t("Действует до"),
                        dataIndex: 'expiresAt',
                        render: (d: string | null) => {
                          if (!d) return '—';
                          const daysLeft = dayjs(d).diff(dayjs(), 'day');
                          const color = daysLeft < 0 ? 'red' : daysLeft <= 30 ? 'orange' : undefined;
                          return <Tag color={color}>{dayjs(d).format('DD.MM.YYYY')}</Tag>;
                        },
                      },
                      { title: t("Кем выдан"), dataIndex: 'issuer' },
                      ...(can(PERMISSIONS.VEHICLE_DOCUMENT_MANAGE)
                        ? [
                            {
                              title: '',
                              width: 50,
                              render: (_: unknown, row: DocumentRow) => (
                                <Popconfirm
                                  title={t("Удалить документ?")}
                                  okText={t("Удалить")}
                                  cancelText={t("Отмена")}
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
              label: t("Фотографии"),
              children: <VehiclePhotos vehicleId={v.id} />,
            },
            {
              key: 'meters',
              label: t("Счётчики"),
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
                      {t("Скорректировать показания")}
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
                        title: t("Дата"),
                        dataIndex: 'recordedAt',
                        render: (d: string) => dayjs(d).format('DD.MM.YYYY HH:mm'),
                      },
                      {
                        title: t("Одометр"),
                        dataIndex: 'odometer',
                        align: 'right',
                        render: (x: string | null) => fmt(x),
                      },
                      {
                        title: t("Моточасы"),
                        dataIndex: 'engineHours',
                        align: 'right',
                        render: (x: string | null) => fmt(x),
                      },
                      { title: t("Источник"), dataIndex: 'source', width: 110 },
                      { title: t("Комментарий"), dataIndex: 'comment' },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'audit',
              label: t("Журнал действий"),
              children: <EntityAuditLog entity="Vehicle" entityId={v.id} />,
            },
          ]}
        />
      )}

      <Modal
        open={docModal}
        title={t("Документ техники")}
        okText={t("Добавить")}
        cancelText={t("Отмена")}
        confirmLoading={addDocument.isPending}
        onCancel={() => setDocModal(false)}
        onOk={() => {
          void docForm.validateFields().then((values) => {
            addDocument.mutate(values, { onSuccess: () => setDocModal(false) });
          });
        }}
      >
        <Form form={docForm} layout="vertical">
          <Form.Item name="type" label={t("Тип документа")} rules={[{ required: true }]}>
            <Select
              options={Object.values(VehicleDocumentType).map((code) => ({
                value: code,
                label: t(DOCUMENT_TYPE_LABEL[code] ?? code),
              }))}
            />
          </Form.Item>
          <Form.Item name="number" label={t("Номер")}>
            <Input />
          </Form.Item>
          <Form.Item name="issuer" label={t("Кем выдан")}>
            <Input />
          </Form.Item>
          <Space>
            <Form.Item name="issuedAt" label={t("Дата выдачи")}>
              <DatePicker format="DD.MM.YYYY" />
            </Form.Item>
            <Form.Item
              name="expiresAt"
              label={t("Действует до")}
              tooltip={t("По этой дате документ попадает в дашборд истекающих сроков")}
            >
              <DatePicker format="DD.MM.YYYY" />
            </Form.Item>
          </Space>
          <Form.Item name="amount" label={t("Сумма (для страховок)")}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={meterModal}
        title={t("Корректировка показаний")}
        okText={t("Сохранить")}
        cancelText={t("Отмена")}
        confirmLoading={adjustMeter.isPending}
        onCancel={() => setMeterModal(false)}
        onOk={() => {
          void meterForm.validateFields().then((values) => {
            adjustMeter.mutate(values, { onSuccess: () => setMeterModal(false) });
          });
        }}
      >
        <Form form={meterForm} layout="vertical">
          <Form.Item name="odometer" label={t("Одометр, км")}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="engineHours" label={t("Моточасы")}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="comment"
            label={t("Основание")}
            rules={[{ required: true, message: t("Основание обязательно — оно останется в истории") }]}
          >
            <Input.TextArea rows={2} placeholder={t("Замена одометра, акт № ... от ...")} />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}
