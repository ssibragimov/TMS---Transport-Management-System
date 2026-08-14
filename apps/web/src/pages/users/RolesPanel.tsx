import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  Collapse,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { PERMISSIONS } from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { StickyTable } from '@/components/StickyTable';

interface RoleRow {
  id: number;
  code: string;
  name: string;
  isSystem: boolean;
  permissions: Array<{ permission: { code: string } }>;
  _count: { users: number };
}

interface PermissionGroup {
  groupCode: string;
  label: string;
  permissions: Array<{ code: string; hint?: string }>;
}

export function RolesPanel() {
  const { t } = useTranslation();

  const { can } = useAuth();
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const manage = can(PERMISSIONS.ROLE_MANAGE);

  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: async () => (await api.get<RoleRow[]>('/users/roles')).data,
  });

  const groups = useQuery({
    queryKey: ['permission-groups'],
    staleTime: 30 * 60_000,
    queryFn: async () => (await api.get<PermissionGroup[]>('/users/permissions')).data,
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (editing) {
      form.setFieldsValue({
        code: editing.code,
        name: editing.name,
        permissions: editing.permissions.map((p) => p.permission.code),
      });
    } else {
      form.setFieldsValue({ permissions: [] });
    }
  }, [open, editing, form]);

  const save = useApiMutation(
    async (values: Record<string, unknown>) => {
      if (editing) {
        const { data } = await api.patch(`/roles/${editing.id}`, {
          name: values.name,
          permissions: values.permissions,
        });
        return data;
      }
      const { data } = await api.post('/roles', values);
      return data;
    },
    {
      successMessage: editing ? 'Роль обновлена' : 'Роль создана',
      invalidate: [['roles'], ['users']],
    },
  );

  const remove = useApiMutation(
    async (id: number) => (await api.delete(`/roles/${id}`)).data,
    { successMessage: t("Роль удалена"), invalidate: [['roles']] },
  );

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        {manage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            {t("Создать роль")}
          </Button>
        )}
        <Typography.Text type="secondary">
          {t("Изменение набора прав действует на всех, кому роль назначена.")}
        </Typography.Text>
      </Space>

      <StickyTable<RoleRow>
        rowKey="id"
        size="small"
        loading={roles.isLoading}
        dataSource={roles.data ?? []}
        pagination={false}
        columns={[
          { title: t("Название"), dataIndex: 'name' },
          {
            title: t("Код"),
            dataIndex: 'code',
            width: 180,
            render: (code: string) => <Typography.Text code>{code}</Typography.Text>,
          },
          {
            title: t("Тип"),
            dataIndex: 'isSystem',
            width: 120,
            render: (isSystem: boolean) =>
              isSystem ? <Tag color="blue">системная</Tag> : <Tag>своя</Tag>,
          },
          {
            title: t("Прав"),
            width: 90,
            align: 'right',
            render: (_: unknown, row: RoleRow) => row.permissions.length,
          },
          {
            title: t("Назначена"),
            width: 110,
            align: 'right',
            render: (_: unknown, row: RoleRow) => row._count.users,
          },
          ...(manage
            ? [
                {
                  title: '',
                  width: 90,
                  render: (_: unknown, row: RoleRow) => (
                    <Space size={0}>
                      <Tooltip title={t("Изменить права")}>
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => {
                            setEditing(row);
                            setOpen(true);
                          }}
                        />
                      </Tooltip>
                      {!row.isSystem && (
                        <Popconfirm
                          title={t("Удалить роль?")}
                          okText={t("Удалить")}
                          cancelText={t("Отмена")}
                          onConfirm={() => remove.mutate(row.id)}
                        >
                          <Button type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      )}
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />

      <Modal
        open={open}
        width={780}
        title={editing ? `Роль: ${editing.name}` : 'Новая роль'}
        okText={t("Сохранить")}
        cancelText={t("Отмена")}
        confirmLoading={save.isPending}
        onCancel={() => setOpen(false)}
        onOk={() => {
          void form.validateFields().then((values) => {
            save.mutate(values, { onSuccess: () => setOpen(false) });
          });
        }}
      >
        <Form form={form} layout="vertical">
          <Space align="start">
            <Form.Item
              name="code"
              label={t("Код")}
              tooltip={t("Машинный идентификатор, менять после создания нельзя")}
              rules={[
                { required: true, message: t("Обязательное поле") },
                {
                  pattern: /^[A-Z][A-Z0-9_]*$/,
                  message: t("Заглавные латинские буквы, цифры и подчёркивание"),
                },
              ]}
            >
              <Input disabled={Boolean(editing)} placeholder="SHIFT_SUPERVISOR" style={{ width: 240 }} />
            </Form.Item>
            <Form.Item
              name="name"
              label={t("Название")}
              rules={[{ required: true, message: t("Обязательное поле") }]}
            >
              <Input placeholder={t("Старший смены")} style={{ width: 320 }} />
            </Form.Item>
          </Space>

          <Form.Item
            name="permissions"
            label={t("Права")}
            rules={[{ required: true, message: t("Выберите хотя бы одно право") }]}
          >
            <Checkbox.Group style={{ width: '100%' }}>
              <Collapse
                size="small"
                style={{ width: '100%' }}
                items={(groups.data ?? []).map((group) => ({
                  key: group.groupCode,
                  label: group.label,
                  children: (
                    <Space direction="vertical">
                      {group.permissions.map((permission) => (
                        <Checkbox key={permission.code} value={permission.code}>
                          <Typography.Text code>{permission.code}</Typography.Text>
                          {permission.hint && (
                            <Typography.Text type="secondary"> — {permission.hint}</Typography.Text>
                          )}
                        </Checkbox>
                      ))}
                    </Space>
                  ),
                }))}
              />
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
