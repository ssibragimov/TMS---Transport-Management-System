import {
  CameraOutlined,
  DeleteOutlined,
  FileExcelOutlined,
  PlusOutlined,
  PrinterOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
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
  Tooltip,
} from 'antd';
import dayjs from 'dayjs';
import { useRef, useState } from 'react';
import { CheckResult, LicenseCategory, PERMISSIONS, PermitZone } from '@gsm/shared';

import { EntityAuditLog } from '@/components/EntityAuditLog';
import { EntityId } from '@/components/EntityId';
import { PhotoCropModal } from '@/components/PhotoCropModal';
import { api } from '@/api/client';
import { useApiMutation, useAuthedImage, useDownload } from '@/api/hooks';
import { driverPhoto } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { colorOf, initials } from '@/lib/avatar';
import { fmt, PERMIT_ZONE_LABEL, WAYBILL_STATUS_COLOR, WAYBILL_STATUS_LABEL } from '@/lib/labels';
import { ViolationFormModal } from '@/pages/violations/ViolationFormModal';
import {
  ViolationPhotoPreview,
  useViolationPhotoPreview,
} from '@/pages/violations/ViolationPhotoPreview';

interface Props {
  driverId: number | null;
  onClose: () => void;
}

interface DriverDetail {
  id: number;
  personnelNumber: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  phone: string | null;
  birthDate: string | null;
  hireDate: string | null;
  dismissDate: string | null;
  isActive: boolean;
  notes: string | null;
  department: { name: string } | null;
  position: { name: string } | null;
  licenses: Array<{
    id: number;
    number: string;
    categories: string[];
    issuedAt: string;
    expiresAt: string;
  }>;
  permits: Array<{
    id: number;
    zone: string;
    number: string;
    issuedAt: string;
    expiresAt: string;
  }>;
  medicalChecks: Array<{
    id: number;
    checkedAt: string;
    validUntil: string | null;
    result: string;
    isPreTrip: boolean;
    doctorName: string | null;
  }>;
  photoKey: string | null;
  currentWaybill: {
    id: number;
    number: string;
    status: string;
    validFrom: string;
    validTo: string;
    vehicle: { id: number; garageNumber: string; plateNumber: string | null } | null;
  } | null;
}

interface EligibilityIssue {
  code: string;
  message: string;
}

interface DriverViolationRow {
  id: number;
  occurredAt: string;
  fineAmount: string | null;
  description: string | null;
  photoKey: string | null;
  createdAt: string;
  vehicle: { id: number; garageNumber: string; plateNumber: string | null } | null;
  type: { id: number; name: string };
  issuedByUser: { id: number; fullName: string } | null;
}

/** Дата со сроком: просроченная — красная, истекающая в месяц — оранжевая. */
function ExpiryTag({ date }: { date: string | null }) {
  if (!date) return <>—</>;
  const daysLeft = dayjs(date).diff(dayjs(), 'day');
  const color = daysLeft < 0 ? 'red' : daysLeft <= 30 ? 'orange' : 'green';
  const suffix = daysLeft < 0 ? ' (просрочен)' : ` (${daysLeft} дн.)`;
  return <Tag color={color}>{dayjs(date).format('DD.MM.YYYY') + suffix}</Tag>;
}

export function DriverDrawer({ driverId, onClose }: Props) {
  const { t } = useTranslation();

  const { can } = useAuth();
  const [modal, setModal] = useState<'license' | 'permit' | 'medical' | null>(null);
  const [form] = Form.useForm();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const openPhotoPicker = (): void => photoInputRef.current?.click();
  const [violationFormOpen, setViolationFormOpen] = useState(false);
  const violationPhotoPreview = useViolationPhotoPreview();
  const download = useDownload();

  const open = driverId !== null;
  const manage = can(PERMISSIONS.DRIVER_CLEARANCE_MANAGE);
  const canManageViolations = can(PERMISSIONS.VIOLATION_MANAGE);

  const driver = useQuery({
    queryKey: ['driver', driverId],
    enabled: open,
    queryFn: async () => {
      const { data } = await api.get<DriverDetail>(`/drivers/${driverId}`);
      return data;
    },
  });

  // Тот же расчёт, что блокирует выдачу путевого листа. Показываем его
  // в карточке, чтобы причина отказа была видна заранее, а не в момент выдачи.
  const eligibility = useQuery({
    queryKey: ['driver-eligibility', driverId],
    enabled: open,
    queryFn: async () => {
      const { data } = await api.get<EligibilityIssue[]>(`/drivers/${driverId}/eligibility`);
      return data;
    },
  });

  // Не встроено в /drivers/:id, как медосмотры: список нарушений
  // потенциально растёт годами и обслуживается отдельным правом
  // (violation.read/manage), поэтому у него собственный запрос
  // с пагинацией, как у журнала действий ниже.
  const violations = useQuery({
    queryKey: ['driver-violations', driverId],
    enabled: open && can(PERMISSIONS.VIOLATION_READ),
    queryFn: async () => {
      const { data } = await api.get<{ items: DriverViolationRow[] }>('/violations', {
        params: { driverId, pageSize: 50 },
      });
      return data.items;
    },
  });

  const invalidate = [['driver'], ['driver-eligibility'], ['drivers'], ['expiring']];

  const addLicense = useApiMutation(
    async (values: Record<string, unknown>) => {
      const { data } = await api.post(`/drivers/${driverId}/licenses`, {
        ...values,
        issuedAt: (values.issuedAt as dayjs.Dayjs).format('YYYY-MM-DD'),
        expiresAt: (values.expiresAt as dayjs.Dayjs).format('YYYY-MM-DD'),
      });
      return data;
    },
    { successMessage: t("Удостоверение добавлено"), invalidate },
  );

  const addPermit = useApiMutation(
    async (values: Record<string, unknown>) => {
      const { data } = await api.post(`/drivers/${driverId}/permits`, {
        ...values,
        issuedAt: (values.issuedAt as dayjs.Dayjs).format('YYYY-MM-DD'),
        expiresAt: (values.expiresAt as dayjs.Dayjs).format('YYYY-MM-DD'),
      });
      return data;
    },
    { successMessage: t("Допуск добавлен"), invalidate },
  );

  const addMedical = useApiMutation(
    async (values: Record<string, unknown>) => {
      const { data } = await api.post(`/drivers/${driverId}/medical-checks`, {
        ...values,
        checkedAt: (values.checkedAt as dayjs.Dayjs).toISOString(),
        validUntil: values.validUntil
          ? (values.validUntil as dayjs.Dayjs).format('YYYY-MM-DD')
          : undefined,
      });
      return data;
    },
    { successMessage: t("Медосмотр зафиксирован"), invalidate },
  );

  const removeLicense = useApiMutation(
    async (id: number) => (await api.delete(`/drivers/${driverId}/licenses/${id}`)).data,
    { successMessage: t("Удалено"), invalidate },
  );
  const removePermit = useApiMutation(
    async (id: number) => (await api.delete(`/drivers/${driverId}/permits/${id}`)).data,
    { successMessage: t("Удалено"), invalidate },
  );

  const uploadPhoto = useApiMutation(
    async (file: File) => {
      const { data } = await driverPhoto.upload(driverId!, file);
      return data;
    },
    { successMessage: t("Фото загружено"), invalidate: [['driver']] },
  );

  const removePhoto = useApiMutation(
    async () => (await driverPhoto.remove(driverId!)).data,
    { successMessage: t("Фото удалено"), invalidate: [['driver']] },
  );

  const submit = (): void => {
    void form.validateFields().then((values) => {
      const done = { onSuccess: () => setModal(null) };
      if (modal === 'license') addLicense.mutate(values, done);
      if (modal === 'permit') addPermit.mutate(values, done);
      if (modal === 'medical') addMedical.mutate(values, done);
    });
  };

  const d = driver.data;
  const issues = eligibility.data ?? [];
  const fullName = d ? `${d.lastName} ${d.firstName} ${d.middleName ?? ''}`.trim() : undefined;

  // Обычный <img src="/api/..."> не приложит токен авторизации, и сервер
  // ответит 401 — снимок запрашивается этим авторизованным хуком.
  const photoSrc = useAuthedImage(d?.photoKey ? `/drivers/${d.id}/photo` : null);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={820}
      loading={driver.isLoading}
      title={d ? fullName : 'Карточка водителя'}
      extra={<EntityId id={d?.id} />}
    >
      {d && (
        <>
          {/*
            Фото рядом с допуском намеренно крупное и на самом видном месте:
            это и есть тот момент, ради которого карточку открывают чаще
            всего, — узнать человека и сразу увидеть, допущен ли он.
            Блок всегда строго квадратный (width=height, не stretch по высоте
            алерта): у алерта с несколькими замечаниями высота растёт с
            текстом, а фото при этом обязано остаться квадратом, а не
            вытягиваться в прямоугольник.
          */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
            {issues.length > 0 ? (
              <Alert
                type="error"
                showIcon
                style={{ flex: 1, minWidth: 0 }}
                message="Водитель не допущен к работе"
                description={
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {issues.map((issue) => (
                      <li key={issue.code}>{issue.message}</li>
                    ))}
                  </ul>
                }
              />
            ) : (
              <Alert
                type="success"
                showIcon
                style={{ flex: 1, minWidth: 0 }}
                message="Допуск к работе действителен"
              />
            )}

            <div
              role={manage ? 'button' : undefined}
              tabIndex={manage ? 0 : undefined}
              onClick={manage ? openPhotoPicker : undefined}
              title={manage ? t('Загрузить или заменить фото') : undefined}
              style={{
                width: 110,
                height: 110,
                flex: 'none',
                borderRadius: 10,
                overflow: 'hidden',
                cursor: manage ? 'pointer' : 'default',
                border: '1px solid #f0f0f0',
              }}
            >
              {d.photoKey ? (
                photoSrc && (
                  <img
                    src={photoSrc}
                    alt={t('Фото водителя')}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'grid',
                    placeItems: 'center',
                    background: colorOf(fullName),
                    color: '#fff',
                    fontSize: 28,
                    fontWeight: 600,
                  }}
                >
                  {initials(fullName)}
                </div>
              )}
            </div>
          </div>

          <Tabs
            items={[
              {
                key: 'info',
                label: t("Общие сведения"),
                children: (
                  <Descriptions bordered size="small" column={2}>
                    {/*
                      Первым пунктом и на всю ширину — обратная сторона того
                      же вопроса, что и в карточке техники: какая машина сейчас
                      закреплена за этим водителем.
                    */}
                    <Descriptions.Item label={t("Сейчас на технике")} span={2}>
                      {d.currentWaybill ? (
                        <Space>
                          <Tag color={WAYBILL_STATUS_COLOR[d.currentWaybill.status]}>
                            {t(WAYBILL_STATUS_LABEL[d.currentWaybill.status] ?? d.currentWaybill.status)}
                          </Tag>
                          <span>
                            {d.currentWaybill.vehicle
                              ? `${d.currentWaybill.vehicle.garageNumber}${d.currentWaybill.vehicle.plateNumber ? ` (${d.currentWaybill.vehicle.plateNumber})` : ''}`
                              : '—'}
                          </span>
                          <span style={{ color: '#999' }}>
                            · {t("Путевой лист")} № {d.currentWaybill.number},{' '}
                            {dayjs(d.currentWaybill.validFrom).format('DD.MM.YYYY HH:mm')}
                            {' → '}
                            {dayjs(d.currentWaybill.validTo).format('DD.MM.YYYY HH:mm')}
                          </span>
                        </Space>
                      ) : (
                        <Tag>{t("Не за рулём")}</Tag>
                      )}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("Табельный номер")}>{d.personnelNumber}</Descriptions.Item>
                    <Descriptions.Item label={t("Подразделение")}>{d.department?.name ?? '—'}</Descriptions.Item>
                    {/*
                      span=2 намеренно, а не в паре с соседним полем: список
                      должностей свой у каждого подразделения (см. AdminPage),
                      и добавление любого нового двухколоночного поля здесь
                      не должно требовать пересчёта чётности перед Фото ниже.
                    */}
                    <Descriptions.Item label={t("Должность")} span={2}>
                      {d.position?.name ?? '—'}
                    </Descriptions.Item>
                    {/*
                      Сам снимок уже виден крупно вверху карточки, рядом
                      с допуском (см. фото-блок над вкладками) — здесь только
                      управление, без дублирующего превью.

                      Фото — на всю строку (span=2), поэтому стоит сразу после
                      пары полей, кратной column={2}: иначе строка переполняется
                      и antd ругается в консоли на несовпадение span.
                    */}
                    <Descriptions.Item label={t("Фото")} span={2}>
                      {d.photoKey ? (
                        <Space>
                          <Button size="small" onClick={openPhotoPicker}>
                            {t('Заменить')}
                          </Button>
                          <Button
                            type="link"
                            danger
                            size="small"
                            onClick={() => removePhoto.mutate(d.id)}
                          >
                            {t('Удалить')}
                          </Button>
                        </Space>
                      ) : (
                        <Button type="primary" size="small" onClick={openPhotoPicker}>
                          {t('Загрузить')}
                        </Button>
                      )}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("Телефон")}>{d.phone ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label={t("Дата рождения")}>
                      {d.birthDate ? dayjs(d.birthDate).format('DD.MM.YYYY') : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("Принят")}>
                      {d.hireDate ? dayjs(d.hireDate).format('DD.MM.YYYY') : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("Статус")}>
                      <Tag color={d.isActive ? 'green' : 'default'}>
                        {d.isActive ? 'Работает' : 'Уволен'}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label={t("Примечание")} span={2}>
                      {d.notes ?? '—'}
                    </Descriptions.Item>
                  </Descriptions>
                ),
              },
              {
                key: 'licenses',
                label: t("Удостоверения"),
                children: (
                  <>
                    {manage && (
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        style={{ marginBottom: 12 }}
                        onClick={() => {
                          form.resetFields();
                          setModal('license');
                        }}
                      >
                        {t("Добавить")}
                      </Button>
                    )}
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={d.licenses}
                      columns={[
                        { title: t("Номер"), dataIndex: 'number' },
                        {
                          title: t("Категории"),
                          dataIndex: 'categories',
                          render: (list: string[]) => list.join(', '),
                        },
                        {
                          title: t("Действует до"),
                          dataIndex: 'expiresAt',
                          render: (date: string) => <ExpiryTag date={date} />,
                        },
                        ...(manage
                          ? [
                              {
                                title: '',
                                width: 50,
                                render: (_: unknown, row: { id: number }) => (
                                  <Popconfirm
                                    title={t("Удалить удостоверение?")}
                                    okText={t("Удалить")}
                                    cancelText={t("Отмена")}
                                    onConfirm={() => removeLicense.mutate(row.id)}
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
                key: 'permits',
                label: t("Допуски"),
                children: (
                  <>
                    {manage && (
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        style={{ marginBottom: 12 }}
                        onClick={() => {
                          form.resetFields();
                          setModal('permit');
                        }}
                      >
                        {t("Добавить")}
                      </Button>
                    )}
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={d.permits}
                      columns={[
                        {
                          title: t("Зона"),
                          dataIndex: 'zone',
                          render: (zone: string) => t(PERMIT_ZONE_LABEL[zone] ?? zone),
                        },
                        { title: t("Номер"), dataIndex: 'number' },
                        {
                          title: t("Действует до"),
                          dataIndex: 'expiresAt',
                          render: (date: string) => <ExpiryTag date={date} />,
                        },
                        ...(manage
                          ? [
                              {
                                title: '',
                                width: 50,
                                render: (_: unknown, row: { id: number }) => (
                                  <Popconfirm
                                    title={t("Удалить допуск?")}
                                    okText={t("Удалить")}
                                    cancelText={t("Отмена")}
                                    onConfirm={() => removePermit.mutate(row.id)}
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
                key: 'medical',
                label: t("Медосмотры"),
                children: (
                  <>
                    {manage && (
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        style={{ marginBottom: 12 }}
                        onClick={() => {
                          form.resetFields();
                          setModal('medical');
                        }}
                      >
                        {t("Зафиксировать осмотр")}
                      </Button>
                    )}
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={{ pageSize: 10 }}
                      dataSource={d.medicalChecks}
                      columns={[
                        {
                          title: t("Дата"),
                          dataIndex: 'checkedAt',
                          render: (date: string) => dayjs(date).format('DD.MM.YYYY HH:mm'),
                        },
                        {
                          title: t("Вид"),
                          dataIndex: 'isPreTrip',
                          render: (pre: boolean) => (pre ? 'Предрейсовый' : 'Периодический'),
                        },
                        {
                          title: t("Результат"),
                          dataIndex: 'result',
                          render: (result: string) => (
                            <Tag color={result === 'PASSED' ? 'green' : 'red'}>
                              {result === 'PASSED' ? 'Годен' : 'Не годен'}
                            </Tag>
                          ),
                        },
                        {
                          title: t("Действует до"),
                          dataIndex: 'validUntil',
                          render: (date: string | null) => <ExpiryTag date={date} />,
                        },
                        { title: t("Врач"), dataIndex: 'doctorName' },
                      ]}
                    />
                  </>
                ),
              },
              ...(can(PERMISSIONS.VIOLATION_READ)
                ? [
                    {
                      key: 'violations',
                      label: t('Нарушения'),
                      children: (
                        <>
                          {canManageViolations && (
                            <Button
                              type="primary"
                              icon={<PlusOutlined />}
                              style={{ marginBottom: 12 }}
                              onClick={() => setViolationFormOpen(true)}
                            >
                              {t('Оформить нарушение')}
                            </Button>
                          )}
                          <Table<DriverViolationRow>
                            size="small"
                            rowKey="id"
                            loading={violations.isLoading}
                            pagination={{ pageSize: 10 }}
                            dataSource={violations.data ?? []}
                            columns={[
                              {
                                title: t('Дата'),
                                dataIndex: 'occurredAt',
                                render: (date: string) => dayjs(date).format('DD.MM.YYYY HH:mm'),
                              },
                              {
                                title: t('Вид нарушения'),
                                render: (_, row) => row.type.name,
                              },
                              {
                                title: t('Техника'),
                                render: (_, row) =>
                                  row.vehicle
                                    ? `${row.vehicle.garageNumber}${row.vehicle.plateNumber ? ` · ${row.vehicle.plateNumber}` : ''}`
                                    : '—',
                              },
                              {
                                title: t('Штраф'),
                                dataIndex: 'fineAmount',
                                align: 'right',
                                render: (value: string | null) => (value ? fmt(value) : '—'),
                              },
                              {
                                title: '',
                                width: 110,
                                render: (_, row) => (
                                  <Space size={0}>
                                    {row.photoKey && (
                                      <Tooltip
                                        title={`${t('Показать фото')} · ${t('Загружено')} ${dayjs(row.createdAt).format('DD.MM.YYYY HH:mm')}`}
                                      >
                                        <Button
                                          type="text"
                                          icon={<CameraOutlined />}
                                          onClick={() => violationPhotoPreview.open(row.id)}
                                        />
                                      </Tooltip>
                                    )}
                                    <Tooltip title={t('Печать')}>
                                      <Button
                                        type="text"
                                        icon={<PrinterOutlined />}
                                        onClick={() =>
                                          window.open(`/violations/${row.id}/print`, '_blank', 'noopener')
                                        }
                                      />
                                    </Tooltip>
                                    <Tooltip title="Excel">
                                      <Button
                                        type="text"
                                        icon={<FileExcelOutlined />}
                                        onClick={() =>
                                          download(
                                            `/violations/${row.id}/export.csv`,
                                            {},
                                            `narushenie-${row.id}.csv`,
                                          )
                                        }
                                      />
                                    </Tooltip>
                                  </Space>
                                ),
                              },
                            ]}
                          />
                        </>
                      ),
                    },
                  ]
                : []),
              {
                key: 'audit',
                label: t("Журнал действий"),
                children: <EntityAuditLog entity="Driver" entityId={d.id} />,
              },
            ]}
          />
        </>
      )}

      <Modal
        open={modal !== null}
        title={
          modal === 'license'
            ? 'Водительское удостоверение'
            : modal === 'permit'
              ? 'Допуск в зону аэродрома'
              : 'Медицинский осмотр'
        }
        okText={t("Сохранить")}
        cancelText={t("Отмена")}
        onCancel={() => setModal(null)}
        onOk={submit}
        confirmLoading={addLicense.isPending || addPermit.isPending || addMedical.isPending}
      >
        <Form form={form} layout="vertical">
          {modal === 'license' && (
            <>
              <Form.Item name="number" label={t("Номер")} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="categories" label={t("Категории")} rules={[{ required: true }]}>
                <Select
                  mode="multiple"
                  options={Object.values(LicenseCategory).map((c) => ({ value: c, label: c }))}
                />
              </Form.Item>
              <Space>
                <Form.Item name="issuedAt" label={t("Выдано")} rules={[{ required: true }]}>
                  <DatePicker format="DD.MM.YYYY" />
                </Form.Item>
                <Form.Item name="expiresAt" label={t("Действует до")} rules={[{ required: true }]}>
                  <DatePicker format="DD.MM.YYYY" />
                </Form.Item>
              </Space>
            </>
          )}

          {modal === 'permit' && (
            <>
              <Form.Item
                name="zone"
                label={t("Зона")}
                rules={[{ required: true }]}
                tooltip={t("Для работы на перроне нужен допуск APRON или выше")}
              >
                <Select
                  options={Object.values(PermitZone).map((z) => ({
                    value: z,
                    label: t(PERMIT_ZONE_LABEL[z] ?? z),
                  }))}
                />
              </Form.Item>
              <Form.Item name="number" label={t("Номер")} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Space>
                <Form.Item name="issuedAt" label={t("Выдан")} rules={[{ required: true }]}>
                  <DatePicker format="DD.MM.YYYY" />
                </Form.Item>
                <Form.Item name="expiresAt" label={t("Действует до")} rules={[{ required: true }]}>
                  <DatePicker format="DD.MM.YYYY" />
                </Form.Item>
              </Space>
            </>
          )}

          {modal === 'medical' && (
            <>
              <Form.Item name="checkedAt" label={t("Дата и время")} rules={[{ required: true }]}>
                <DatePicker showTime format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="result" label={t("Результат")} rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: CheckResult.PASSED, label: t("Годен") },
                    { value: CheckResult.FAILED, label: t("Не годен") },
                    { value: CheckResult.CONDITIONAL, label: t("Годен с ограничениями") },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="validUntil"
                label={t("Действует до")}
                tooltip={t("Только для периодического осмотра — предрейсовый действует одну смену")}
              >
                <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="doctorName" label={t("Врач")}>
                <Input />
              </Form.Item>
              <Space>
                <Form.Item name="bloodPressure" label={t("Давление")}>
                  <Input placeholder="120/80" style={{ width: 120 }} />
                </Form.Item>
                <Form.Item name="temperature" label={t("Температура")}>
                  <InputNumber min={30} max={45} step={0.1} />
                </Form.Item>
                <Form.Item name="alcoholPpm" label={t("Алкотестер, ‰")}>
                  <InputNumber min={0} max={10} step={0.001} />
                </Form.Item>
              </Space>
            </>
          )}
        </Form>
      </Modal>

      {/*
        Файл выбирается скрытым input'ом, а не отдельным модальным окном:
        сразу после выбора открывается кроппер — промежуточный диалог
        только добавил бы лишний клик.
      */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          if (file) setSelectedFile(file);
        }}
      />
      <PhotoCropModal
        open={selectedFile !== null}
        file={selectedFile}
        title={t('Загрузка фото водителя')}
        confirmLoading={uploadPhoto.isPending}
        onCancel={() => setSelectedFile(null)}
        onConfirm={(croppedFile) => {
          uploadPhoto.mutate(croppedFile, { onSuccess: () => setSelectedFile(null) });
        }}
      />

      {d && (
        <ViolationFormModal
          open={violationFormOpen}
          driverId={d.id}
          onClose={() => setViolationFormOpen(false)}
          invalidate={[['driver-violations', d.id]]}
        />
      )}

      {violationPhotoPreview.target !== null && (
        <ViolationPhotoPreview
          violationId={violationPhotoPreview.target}
          open
          onClose={violationPhotoPreview.close}
        />
      )}
    </Drawer>
  );
}
