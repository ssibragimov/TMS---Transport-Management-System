import { DeleteOutlined, EditOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { PERMISSIONS } from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation, usePaged } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { StickyTable } from '@/components/StickyTable';
import { UserAvatar } from '@/components/UserAvatar';
import { TableCard } from '@/components/TableCard';

import { RolesPanel } from './users/RolesPanel';
import { UserFormModal, type UserDetail } from './users/UserFormModal';

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Активен',
  INVITED: 'Приглашён',
  SUSPENDED: 'Заблокирован',
};
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'green',
  INVITED: 'gold',
  SUSPENDED: 'red',
};

export function UsersPage() {
  const { t } = useTranslation();

  const { can, user: me } = useAuth();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [allOffices, setAllOffices] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserDetail | null>(null);
  const [resetFor, setResetFor] = useState<UserDetail | null>(null);
  const [resetForm] = Form.useForm();

  const query = usePaged<UserDetail & { lastLoginAt: string | null }>(
    ['users'],
    '/users',
    {
      page,
      pageSize,
      search: search || undefined,
      status,
      allOffices: allOffices || undefined,
    },
  );

  const resetPassword = useApiMutation(
    async (values: { password: string }) =>
      (await api.post(`/users/${resetFor!.id}/reset-password`, values)).data,
    { successMessage: t("Пароль сброшен, все сессии пользователя завершены") },
  );

  const remove = useApiMutation(
    async (id: number) => (await api.delete(`/users/${id}`)).data,
    { successMessage: t("Учётная запись заблокирована"), invalidate: [['users']] },
  );

  if (!can(PERMISSIONS.USER_READ)) {
    return <Typography.Text type="danger">Нет прав на просмотр пользователей</Typography.Text>;
  }

  const canManage = can(PERMISSIONS.USER_MANAGE);
  // Переключатель «все офисы» осмыслен только тому, у кого их несколько.
  const multiOffice = (me?.availableOffices.length ?? 0) > 1;

  return (
    <TableCard title={t("Управление пользователями")}>
      <Tabs
        items={[
          {
            key: 'users',
            label: t("Пользователи"),
            children: (
              <>
                <Space wrap style={{ marginBottom: 12 }}>
                  <Input.Search
                    allowClear
                    placeholder={t("Служебный номер, ФИО или почта")}
                    style={{ width: 260 }}
                    onSearch={(value) => {
                      setSearch(value);
                      setPage(1);
                    }}
                  />
                  <Select
                    allowClear
                    placeholder={t("Статус")}
                    style={{ width: 170 }}
                    value={status}
                    onChange={(value) => {
                      setStatus(value);
                      setPage(1);
                    }}
                    options={Object.entries(STATUS_LABEL).map(([value, rawLabel]) => ({
                      value,
                      label: t(rawLabel),
                    }))}
                  />
                  {multiOffice && (
                    <Checkbox
                      checked={allOffices}
                      onChange={(event) => {
                        setAllOffices(event.target.checked);
                        setPage(1);
                      }}
                    >
                      {t("Все доступные офисы")}
                    </Checkbox>
                  )}
                  {canManage && (
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setEditing(null);
                        setFormOpen(true);
                      }}
                    >
                      {t("Создать пользователя")}
                    </Button>
                  )}
                </Space>

                <StickyTable<UserDetail & { lastLoginAt: string | null }>
                  rowKey="id"
                  loading={query.isLoading}
                  dataSource={query.data?.items ?? []}
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
                    {
                      title: t("ФИО"),
                      dataIndex: 'fullName',
                      render: (name: string, row) => (
                        <Space>
                          <UserAvatar
                            userId={row.id}
                            fullName={name}
                            photoKey={row.photoKey}
                            size={28}
                          />
                          <span>{name}</span>
                          {row.bypassRls && (
                            <Tooltip title={t("Видит данные всех аэропортов")}>
                              <Tag color="purple">все офисы</Tag>
                            </Tooltip>
                          )}
                        </Space>
                      ),
                    },
                    { title: t("Почта"), dataIndex: 'email', width: 240 },
                    {
                      // Служебный номер стоит раньше личного: внутри
                      // предприятия набирают именно его.
                      title: t("Основной"),
                      dataIndex: 'internalNumber',
                      width: 110,
                      render: (value: string | null) =>
                        value ? (
                          <Typography.Text strong>{value}</Typography.Text>
                        ) : (
                          <Tooltip title={t("Внутренний номер не задан")}>
                            <Typography.Text type="secondary">—</Typography.Text>
                          </Tooltip>
                        ),
                    },
                    {
                      title: t("Телефон"),
                      dataIndex: 'phone',
                      width: 170,
                      render: (value: string | null) =>
                        value ?? <Typography.Text type="secondary">—</Typography.Text>,
                    },
                    {
                      title: t("Офисы"),
                      width: 200,
                      render: (_: unknown, row) => (
                        <Space size={[0, 4]} wrap>
                          {row.offices.map((entry) => (
                            <Tag key={entry.office.id}>{entry.office.code}</Tag>
                          ))}
                        </Space>
                      ),
                    },
                    {
                      title: t("Роли"),
                      render: (_: unknown, row) => {
                        const names = [
                          ...new Set(row.roles.map((assignment) => assignment.role.name)),
                        ];
                        return names.length > 0 ? names.join(', ') : '—';
                      },
                    },
                    {
                      title: t("Статус"),
                      dataIndex: 'status',
                      width: 130,
                      render: (value: string) => (
                        <Tag color={STATUS_COLOR[value]}>{t(STATUS_LABEL[value] ?? value)}</Tag>
                      ),
                    },
                    {
                      title: t("Последний вход"),
                      dataIndex: 'lastLoginAt',
                      width: 150,
                      render: (value: string | null) =>
                        value ? dayjs(value).format('DD.MM.YYYY HH:mm') : 'ни разу',
                    },
                    ...(canManage
                      ? [
                          {
                            title: '',
                            width: 120,
                            render: (_: unknown, row: UserDetail) => (
                              <Space size={0}>
                                <Tooltip title={t("Изменить")}>
                                  <Button
                                    type="text"
                                    icon={<EditOutlined />}
                                    onClick={() => {
                                      setEditing(row);
                                      setFormOpen(true);
                                    }}
                                  />
                                </Tooltip>
                                <Tooltip title={t("Сбросить пароль")}>
                                  <Button
                                    type="text"
                                    icon={<KeyOutlined />}
                                    onClick={() => {
                                      resetForm.resetFields();
                                      setResetFor(row);
                                    }}
                                  />
                                </Tooltip>
                                {row.id !== me?.id && !row.bypassRls && (
                                  <Popconfirm
                                    title={t("Заблокировать учётную запись?")}
                                    description={t("Все сессии пользователя будут завершены.")}
                                    okText={t("Заблокировать")}
                                    cancelText={t("Отмена")}
                                    onConfirm={() => remove.mutate(row.id)}
                                  >
                                    <Tooltip title={t("Заблокировать")}>
                                      <Button type="text" danger icon={<DeleteOutlined />} />
                                    </Tooltip>
                                  </Popconfirm>
                                )}
                              </Space>
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
            key: 'roles',
            label: t("Роли и права"),
            children: <RolesPanel />,
          },
        ]}
      />

      <UserFormModal open={formOpen} initial={editing} onClose={() => setFormOpen(false)} />

      <Modal
        open={resetFor !== null}
        title={`Сброс пароля: ${resetFor?.fullName ?? ''}`}
        okText={t("Сбросить")}
        cancelText={t("Отмена")}
        confirmLoading={resetPassword.isPending}
        onCancel={() => setResetFor(null)}
        onOk={() => {
          void resetForm.validateFields().then((values) => {
            resetPassword.mutate(values, { onSuccess: () => setResetFor(null) });
          });
        }}
      >
        <Typography.Paragraph type="secondary">
          {t("Все активные сессии пользователя будут завершены — он войдёт заново с новым паролем.")}
        </Typography.Paragraph>
        <Form form={resetForm} layout="vertical">
          <Form.Item
            name="password"
            label={t("Новый пароль")}
            rules={[
              { required: true, message: t("Обязательное поле") },
              { min: 8, message: t("Не короче 8 символов") },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </TableCard>
  );
}
