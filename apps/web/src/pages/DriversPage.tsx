import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation, useDictionaries, usePaged } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { StickyTable } from '@/components/StickyTable';
import { TableCard } from '@/components/TableCard';

import { DriverDrawer } from './drivers/DriverDrawer';

interface DriverRow {
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
  departmentId: number | null;
  department: { name: string } | null;
  licenses: Array<{ expiresAt: string }>;
  permits: Array<{ expiresAt: string }>;
}

/** Ближайший истекающий документ — колонка, ради которой список и открывают. */
function nearestExpiry(row: DriverRow): string | null {
  const dates = [...row.licenses, ...row.permits].map((d) => d.expiresAt).sort();
  return dates[0] ?? null;
}

export function DriversPage() {
  const { can } = useAuth();
  const { t } = useTranslation();
  const dictionaries = useDictionaries();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DriverRow | null>(null);
  const [form] = Form.useForm();

  const query = usePaged<DriverRow>(['drivers'], '/drivers', {
    page,
    pageSize,
    search: search || undefined,
  });

  useEffect(() => {
    if (!formOpen) return;
    form.resetFields();
    if (editing) {
      form.setFieldsValue({
        ...editing,
        birthDate: editing.birthDate ? dayjs(editing.birthDate) : undefined,
        hireDate: editing.hireDate ? dayjs(editing.hireDate) : undefined,
        dismissDate: editing.dismissDate ? dayjs(editing.dismissDate) : undefined,
      });
    }
  }, [formOpen, editing, form]);

  const save = useApiMutation(
    async (values: Record<string, unknown>) => {
      const payload = {
        ...values,
        birthDate: values.birthDate ? (values.birthDate as dayjs.Dayjs).format('YYYY-MM-DD') : undefined,
        hireDate: values.hireDate ? (values.hireDate as dayjs.Dayjs).format('YYYY-MM-DD') : undefined,
        dismissDate: values.dismissDate
          ? (values.dismissDate as dayjs.Dayjs).format('YYYY-MM-DD')
          : undefined,
      };
      if (editing) {
        const { data } = await api.patch(`/drivers/${editing.id}`, payload);
        return data;
      }
      const { data } = await api.post('/drivers', payload);
      return data;
    },
    {
      successMessage: editing ? t('Карточка обновлена') : t('Водитель принят'),
      invalidate: [['drivers'], ['office-summary']],
    },
  );

  const remove = useApiMutation(
    async (id: number) => (await api.delete(`/drivers/${id}`)).data,
    { successMessage: t('Водитель удалён'), invalidate: [['drivers'], ['office-summary']] },
  );

  if (!can(PERMISSIONS.DRIVER_READ)) {
    return <Typography.Text type="danger">{t('Нет прав на просмотр водителей')}</Typography.Text>;
  }

  return (
    <TableCard
      title={t('Водители')}
      extra={
        <Space wrap>
          <Input.Search
            allowClear
            placeholder={t('Фамилия или табельный номер')}
            style={{ width: 260 }}
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
          {can(PERMISSIONS.DRIVER_CREATE) && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              {t('Принять водителя')}
            </Button>
          )}
        </Space>
      }
    >
      <StickyTable<DriverRow>
        rowKey="id"
        rowNumbers
        loading={query.isLoading}
        dataSource={query.data?.items ?? []}
        onRow={(row) => ({ onClick: () => setDetailId(row.id), style: { cursor: 'pointer' } })}
        pagination={{
          current: page,
          pageSize,
          total: query.data?.meta.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${t('Всего:')} ${total}`,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          },
        }}
        columns={[
          { title: t('Табельный'), dataIndex: 'personnelNumber', width: 120 },
          {
            title: t('ФИО'),
            render: (_: unknown, row: DriverRow) =>
              `${row.lastName} ${row.firstName} ${row.middleName ?? ''}`.trim(),
          },
          {
            title: t('Подразделение'),
            dataIndex: 'department',
            render: (department: DriverRow['department']) => department?.name ?? '—',
          },
          { title: t('Телефон'), dataIndex: 'phone', width: 160 },
          {
            title: t('Ближайший срок'),
            width: 170,
            render: (_: unknown, row: DriverRow) => {
              const date = nearestExpiry(row);
              if (!date) return <Tag color="red">{t('нет документов')}</Tag>;
              const daysLeft = dayjs(date).diff(dayjs(), 'day');
              const color = daysLeft < 0 ? 'red' : daysLeft <= 30 ? 'orange' : 'green';
              return (
                <Tag color={color}>
                  {dayjs(date).format('DD.MM.YYYY')}
                  {daysLeft < 0 ? ` ${t('(просрочен)')}` : ''}
                </Tag>
              );
            },
          },
          {
            title: t('Статус'),
            dataIndex: 'isActive',
            width: 110,
            render: (active: boolean) => (
              <Tag color={active ? 'green' : 'default'}>{active ? t('Работает') : t('Уволен')}</Tag>
            ),
          },
          {
            title: '',
            width: 90,
            render: (_: unknown, row: DriverRow) => (
              <Space size={0} onClick={(event) => event.stopPropagation()}>
                {can(PERMISSIONS.DRIVER_UPDATE) && (
                  <Tooltip title={t('Изменить')}>
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditing(row);
                        setFormOpen(true);
                      }}
                    />
                  </Tooltip>
                )}
                {can(PERMISSIONS.DRIVER_DELETE) && (
                  <Popconfirm
                    title={t('Удалить водителя?')}
                    okText={t('Удалить')}
                    cancelText={t('Отмена')}
                    onConfirm={() => remove.mutate(row.id)}
                  >
                    <Tooltip title={t('Удалить')}>
                      <Button type="text" danger icon={<DeleteOutlined />} />
                    </Tooltip>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <DriverDrawer driverId={detailId} onClose={() => setDetailId(null)} />

      <Modal
        open={formOpen}
        title={editing ? 'Карточка водителя' : 'Приём водителя'}
        okText={t('Сохранить')}
        cancelText={t('Отмена')}
        width={680}
        confirmLoading={save.isPending}
        onCancel={() => setFormOpen(false)}
        onOk={() => {
          void form.validateFields().then((values) => {
            save.mutate(values, { onSuccess: () => setFormOpen(false) });
          });
        }}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="personnelNumber"
                label={t('Табельный номер')}
                rules={[{ required: true, message: t('Обязательное поле') }]}
              >
                <Input disabled={Boolean(editing)} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="lastName" label={t('Фамилия')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="firstName" label={t('Имя')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="middleName" label={t('Отчество')}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="phone" label={t('Телефон')}>
                <Input placeholder="+998 90 123-45-67" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="departmentId" label={t('Подразделение')}>
                <Select
                  allowClear
                  options={dictionaries.data?.departments.map((d) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="birthDate" label={t('Дата рождения')}>
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="hireDate" label={t('Дата приёма')}>
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            {editing && (
              <Col span={8}>
                <Form.Item
                  name="dismissDate"
                  label={t('Дата увольнения')}
                  tooltip={t('После заполнения водитель исчезнет из списка выдачи путевых листов')}
                >
                  <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                </Form.Item>
              </Col>
            )}
          </Row>
          {editing && (
            <Form.Item name="isActive" label={t('Работает')} valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
          <Form.Item name="notes" label={t('Примечание')}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </TableCard>
  );
}
