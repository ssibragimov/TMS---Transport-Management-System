import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Col,
  Divider,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Typography,
} from 'antd';
import { useEffect } from 'react';

import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';

export interface UserDetail {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  locale: string;
  status: string;
  bypassRls: boolean;
  defaultOfficeId: number | null;
  offices: Array<{ office: { id: number; code: string; nameRu: string } }>;
  roles: Array<{ officeId: number | null; role: { id: number; code: string; name: string } }>;
}

interface RoleOption {
  id: number;
  code: string;
  name: string;
  isSystem: boolean;
}

interface Props {
  open: boolean;
  /** null — создание нового пользователя */
  initial: UserDetail | null;
  onClose: () => void;
}

export function UserFormModal({ open, initial, onClose }: Props) {
  const [form] = Form.useForm();
  const { user } = useAuth();
  const isEdit = Boolean(initial?.id);

  const roles = useQuery({
    queryKey: ['roles'],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<RoleOption[]>('/users/roles')).data,
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();

    if (initial) {
      // Роли раскладываются по офисам: в форме одна строка на офис.
      const byOffice = new Map<number, string[]>();
      for (const assignment of initial.roles) {
        if (assignment.officeId === null) continue;
        const list = byOffice.get(assignment.officeId) ?? [];
        list.push(assignment.role.code);
        byOffice.set(assignment.officeId, list);
      }

      form.setFieldsValue({
        fullName: initial.fullName,
        phone: initial.phone ?? undefined,
        locale: initial.locale,
        status: initial.status,
        defaultOfficeId: initial.defaultOfficeId ?? undefined,
        offices: initial.offices.map((entry) => ({
          officeId: entry.office.id,
          roleCodes: byOffice.get(entry.office.id) ?? [],
        })),
      });
    } else {
      form.setFieldsValue({
        locale: 'ru',
        status: 'ACTIVE',
        offices: [{ officeId: user?.activeOffice.id, roleCodes: [] }],
      });
    }
  }, [open, initial, form, user]);

  const save = useApiMutation(
    async (values: Record<string, unknown>) => {
      if (isEdit) {
        const { data } = await api.patch(`/users/${initial!.id}`, {
          fullName: values.fullName,
          phone: values.phone,
          locale: values.locale,
          status: values.status,
          offices: values.offices,
          defaultOfficeId: values.defaultOfficeId,
        });
        return data;
      }
      const { data } = await api.post('/users', values);
      return data;
    },
    {
      successMessage: isEdit ? 'Пользователь обновлён' : 'Пользователь создан',
      invalidate: [['users']],
    },
  );

  const officeOptions = (user?.availableOffices ?? []).map((office) => ({
    value: office.id,
    label: `${office.code} — ${office.name}`,
  }));

  const roleOptions = (roles.data ?? []).map((role) => ({
    value: role.code,
    label: role.name,
  }));

  return (
    <Modal
      open={open}
      width={780}
      title={isEdit ? `Пользователь: ${initial?.fullName}` : 'Новый пользователь'}
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={save.isPending}
      onCancel={onClose}
      onOk={() => {
        void form.validateFields().then((values) => {
          save.mutate(values, { onSuccess: onClose });
        });
      }}
    >
      {initial?.bypassRls && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Техническая учётная запись"
          description="У этого пользователя включён обход изоляции офисов. Он видит данные всех аэропортов. Признак не редактируется через интерфейс."
        />
      )}

      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="fullName"
              label="ФИО"
              rules={[{ required: true, message: 'Обязательное поле' }]}
            >
              <Input placeholder="Иванов Иван Иванович" />
            </Form.Item>
          </Col>
          <Col span={12}>
            {isEdit ? (
              <Form.Item label="Электронная почта">
                <Input value={initial?.email} disabled />
              </Form.Item>
            ) : (
              <Form.Item
                name="email"
                label="Электронная почта"
                rules={[
                  { required: true, message: 'Обязательное поле' },
                  { type: 'email', message: 'Некорректный адрес' },
                ]}
              >
                <Input autoComplete="off" />
              </Form.Item>
            )}
          </Col>
        </Row>

        <Row gutter={16}>
          {!isEdit && (
            <Col span={8}>
              <Form.Item
                name="password"
                label="Пароль"
                rules={[
                  { required: true, message: 'Обязательное поле' },
                  { min: 8, message: 'Не короче 8 символов' },
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </Col>
          )}
          <Col span={8}>
            <Form.Item name="phone" label="Телефон">
              <Input placeholder="+998 90 123-45-67" />
            </Form.Item>
          </Col>
          <Col span={4}>
            <Form.Item name="locale" label="Язык">
              <Select
                options={[
                  { value: 'ru', label: 'Русский' },
                  { value: 'uz', label: 'O‘zbekcha' },
                  { value: 'uz-Cyrl', label: 'Ўзбекча' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={4}>
            <Form.Item name="status" label="Статус">
              <Select
                options={[
                  { value: 'ACTIVE', label: 'Активен' },
                  { value: 'INVITED', label: 'Приглашён' },
                  { value: 'SUSPENDED', label: 'Заблокирован' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          Доступ к офисам и роли
        </Divider>
        <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
          Роль действует в конкретном офисе. Один человек может быть диспетчером
          в Ташкенте и наблюдателем в Самарканде — это две отдельные строки.
        </Typography.Paragraph>

        <Form.List
          name="offices"
          rules={[
            {
              validator: async (_, value: unknown[]) => {
                if (!value || value.length === 0) {
                  throw new Error('Назначьте хотя бы один офис');
                }
              },
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <>
              {fields.map((field) => (
                <Row key={field.key} gutter={8} style={{ marginBottom: 8 }}>
                  <Col span={9}>
                    <Form.Item
                      name={[field.name, 'officeId']}
                      rules={[{ required: true, message: 'Выберите офис' }]}
                      noStyle
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="Офис"
                        options={officeOptions}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={13}>
                    <Form.Item
                      name={[field.name, 'roleCodes']}
                      rules={[{ required: true, message: 'Выберите роли' }]}
                      noStyle
                    >
                      <Select
                        mode="multiple"
                        allowClear
                        placeholder="Роли в этом офисе"
                        loading={roles.isLoading}
                        options={roleOptions}
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
                style={{ width: '100%' }}
                onClick={() => add({ roleCodes: [] })}
              >
                Добавить офис
              </Button>
              <Form.ErrorList errors={errors} />
            </>
          )}
        </Form.List>

        {/*
          Список офисов по умолчанию строится из уже назначенных: выбрать
          стартовым офис, к которому нет доступа, невозможно — сервер это
          отвергнет, и лучше не давать такой возможности в форме.
        */}
        <Form.Item noStyle shouldUpdate={(prev, next) => prev.offices !== next.offices}>
          {({ getFieldValue }) => {
            const assigned = ((getFieldValue('offices') ?? []) as Array<{ officeId?: number }>)
              .map((entry) => entry?.officeId)
              .filter((id): id is number => typeof id === 'number');

            return (
              <Form.Item
                name="defaultOfficeId"
                label="Офис по умолчанию"
                tooltip="В него пользователь попадает сразу после входа"
                style={{ marginTop: 16 }}
              >
                <Select
                  allowClear
                  placeholder="Первый из назначенных"
                  options={officeOptions.filter((option) => assigned.includes(option.value))}
                />
              </Form.Item>
            );
          }}
        </Form.Item>
      </Form>
    </Modal>
  );
}
