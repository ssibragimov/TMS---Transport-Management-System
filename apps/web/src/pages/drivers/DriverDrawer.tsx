import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
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
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { CheckResult, LicenseCategory, PERMISSIONS, PermitZone } from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { PERMIT_ZONE_LABEL } from '@/lib/labels';

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
}

interface EligibilityIssue {
  code: string;
  message: string;
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
  const { can } = useAuth();
  const [modal, setModal] = useState<'license' | 'permit' | 'medical' | null>(null);
  const [form] = Form.useForm();

  const open = driverId !== null;
  const manage = can(PERMISSIONS.DRIVER_CLEARANCE_MANAGE);

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
    { successMessage: 'Удостоверение добавлено', invalidate },
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
    { successMessage: 'Допуск добавлен', invalidate },
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
    { successMessage: 'Медосмотр зафиксирован', invalidate },
  );

  const removeLicense = useApiMutation(
    async (id: number) => (await api.delete(`/drivers/${driverId}/licenses/${id}`)).data,
    { successMessage: 'Удалено', invalidate },
  );
  const removePermit = useApiMutation(
    async (id: number) => (await api.delete(`/drivers/${driverId}/permits/${id}`)).data,
    { successMessage: 'Удалено', invalidate },
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

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={820}
      loading={driver.isLoading}
      title={d ? `${d.lastName} ${d.firstName} ${d.middleName ?? ''}`.trim() : 'Карточка водителя'}
    >
      {d && (
        <>
          {issues.length > 0 ? (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
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
              style={{ marginBottom: 16 }}
              message="Допуск к работе действителен"
            />
          )}

          <Tabs
            items={[
              {
                key: 'info',
                label: 'Общие сведения',
                children: (
                  <Descriptions bordered size="small" column={2}>
                    <Descriptions.Item label="Табельный номер">{d.personnelNumber}</Descriptions.Item>
                    <Descriptions.Item label="Подразделение">{d.department?.name ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label="Телефон">{d.phone ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label="Дата рождения">
                      {d.birthDate ? dayjs(d.birthDate).format('DD.MM.YYYY') : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Принят">
                      {d.hireDate ? dayjs(d.hireDate).format('DD.MM.YYYY') : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Статус">
                      <Tag color={d.isActive ? 'green' : 'default'}>
                        {d.isActive ? 'Работает' : 'Уволен'}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Примечание" span={2}>
                      {d.notes ?? '—'}
                    </Descriptions.Item>
                  </Descriptions>
                ),
              },
              {
                key: 'licenses',
                label: 'Удостоверения',
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
                        Добавить
                      </Button>
                    )}
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={d.licenses}
                      columns={[
                        { title: 'Номер', dataIndex: 'number' },
                        {
                          title: 'Категории',
                          dataIndex: 'categories',
                          render: (list: string[]) => list.join(', '),
                        },
                        {
                          title: 'Действует до',
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
                                    title="Удалить удостоверение?"
                                    okText="Удалить"
                                    cancelText="Отмена"
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
                label: 'Допуски',
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
                        Добавить
                      </Button>
                    )}
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={d.permits}
                      columns={[
                        {
                          title: 'Зона',
                          dataIndex: 'zone',
                          render: (zone: string) => PERMIT_ZONE_LABEL[zone] ?? zone,
                        },
                        { title: 'Номер', dataIndex: 'number' },
                        {
                          title: 'Действует до',
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
                                    title="Удалить допуск?"
                                    okText="Удалить"
                                    cancelText="Отмена"
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
                label: 'Медосмотры',
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
                        Зафиксировать осмотр
                      </Button>
                    )}
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={{ pageSize: 10 }}
                      dataSource={d.medicalChecks}
                      columns={[
                        {
                          title: 'Дата',
                          dataIndex: 'checkedAt',
                          render: (date: string) => dayjs(date).format('DD.MM.YYYY HH:mm'),
                        },
                        {
                          title: 'Вид',
                          dataIndex: 'isPreTrip',
                          render: (pre: boolean) => (pre ? 'Предрейсовый' : 'Периодический'),
                        },
                        {
                          title: 'Результат',
                          dataIndex: 'result',
                          render: (result: string) => (
                            <Tag color={result === 'PASSED' ? 'green' : 'red'}>
                              {result === 'PASSED' ? 'Годен' : 'Не годен'}
                            </Tag>
                          ),
                        },
                        {
                          title: 'Действует до',
                          dataIndex: 'validUntil',
                          render: (date: string | null) => <ExpiryTag date={date} />,
                        },
                        { title: 'Врач', dataIndex: 'doctorName' },
                      ]}
                    />
                  </>
                ),
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
        okText="Сохранить"
        cancelText="Отмена"
        onCancel={() => setModal(null)}
        onOk={submit}
        confirmLoading={addLicense.isPending || addPermit.isPending || addMedical.isPending}
      >
        <Form form={form} layout="vertical">
          {modal === 'license' && (
            <>
              <Form.Item name="number" label="Номер" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="categories" label="Категории" rules={[{ required: true }]}>
                <Select
                  mode="multiple"
                  options={Object.values(LicenseCategory).map((c) => ({ value: c, label: c }))}
                />
              </Form.Item>
              <Space>
                <Form.Item name="issuedAt" label="Выдано" rules={[{ required: true }]}>
                  <DatePicker format="DD.MM.YYYY" />
                </Form.Item>
                <Form.Item name="expiresAt" label="Действует до" rules={[{ required: true }]}>
                  <DatePicker format="DD.MM.YYYY" />
                </Form.Item>
              </Space>
            </>
          )}

          {modal === 'permit' && (
            <>
              <Form.Item
                name="zone"
                label="Зона"
                rules={[{ required: true }]}
                tooltip="Для работы на перроне нужен допуск APRON или выше"
              >
                <Select
                  options={Object.values(PermitZone).map((z) => ({
                    value: z,
                    label: PERMIT_ZONE_LABEL[z] ?? z,
                  }))}
                />
              </Form.Item>
              <Form.Item name="number" label="Номер" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Space>
                <Form.Item name="issuedAt" label="Выдан" rules={[{ required: true }]}>
                  <DatePicker format="DD.MM.YYYY" />
                </Form.Item>
                <Form.Item name="expiresAt" label="Действует до" rules={[{ required: true }]}>
                  <DatePicker format="DD.MM.YYYY" />
                </Form.Item>
              </Space>
            </>
          )}

          {modal === 'medical' && (
            <>
              <Form.Item name="checkedAt" label="Дата и время" rules={[{ required: true }]}>
                <DatePicker showTime format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="result" label="Результат" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: CheckResult.PASSED, label: 'Годен' },
                    { value: CheckResult.FAILED, label: 'Не годен' },
                    { value: CheckResult.CONDITIONAL, label: 'Годен с ограничениями' },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="validUntil"
                label="Действует до"
                tooltip="Только для периодического осмотра — предрейсовый действует одну смену"
              >
                <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="doctorName" label="Врач">
                <Input />
              </Form.Item>
              <Space>
                <Form.Item name="bloodPressure" label="Давление">
                  <Input placeholder="120/80" style={{ width: 120 }} />
                </Form.Item>
                <Form.Item name="temperature" label="Температура">
                  <InputNumber min={30} max={45} step={0.1} />
                </Form.Item>
                <Form.Item name="alcoholPpm" label="Алкотестер, ‰">
                  <InputNumber min={0} max={10} step={0.001} />
                </Form.Item>
              </Space>
            </>
          )}
        </Form>
      </Modal>
    </Drawer>
  );
}
