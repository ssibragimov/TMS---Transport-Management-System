import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
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
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { PERMISSIONS } from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';

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
    { successMessage: 'Роль удалена', invalidate: [['roles']] },
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
            Создать роль
          </Button>
        )}
        <Typography.Text type="secondary">
          Изменение набора прав действует на всех, кому роль назначена.
        </Typography.Text>
      </Space>

      <Table<RoleRow>
        rowKey="id"
        size="small"
        loading={roles.isLoading}
        dataSource={roles.data ?? []}
        pagination={false}
        columns={[
          { title: 'Название', dataIndex: 'name' },
          {
            title: 'Код',
            dataIndex: 'code',
            width: 180,
            render: (code: string) => <Typography.Text code>{code}</Typography.Text>,
          },
          {
            title: 'Тип',
            dataIndex: 'isSystem',
            width: 120,
            render: (isSystem: boolean) =>
              isSystem ? <Tag color="blue">системная</Tag> : <Tag>своя</Tag>,
          },
          {
            title: 'Прав',
            width: 90,
            align: 'right',
            render: (_: unknown, row: RoleRow) => row.permissions.length,
          },
          {
            title: 'Назначена',
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
                      <Tooltip title="Изменить права">
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
                          title="Удалить роль?"
                          okText="Удалить"
                          cancelText="Отмена"
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
        okText="Сохранить"
        cancelText="Отмена"
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
              label="Код"
              tooltip="Машинный идентификатор, менять после создания нельзя"
              rules={[
                { required: true, message: 'Обязательное поле' },
                {
                  pattern: /^[A-Z][A-Z0-9_]*$/,
                  message: 'Заглавные латинские буквы, цифры и подчёркивание',
                },
              ]}
            >
              <Input disabled={Boolean(editing)} placeholder="SHIFT_SUPERVISOR" style={{ width: 240 }} />
            </Form.Item>
            <Form.Item
              name="name"
              label="Название"
              rules={[{ required: true, message: 'Обязательное поле' }]}
            >
              <Input placeholder="Старший смены" style={{ width: 320 }} />
            </Form.Item>
          </Space>

          <Form.Item
            name="permissions"
            label="Права"
            rules={[{ required: true, message: 'Выберите хотя бы одно право' }]}
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
