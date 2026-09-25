import {
  CheckCircleOutlined,
  EditOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
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
import { useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { CardTitle } from '@/components/EntityId';
import { createdAtColumn, newestFirst } from '@/components/createdAtColumn';
import { StickyTable } from '@/components/StickyTable';

interface OrganizationRow {
  id: number;
  code: string;
  nameRu: string;
  nameUz: string;
  nameEn: string;
  isActive: boolean;
  createdAt: string;
  _count: { offices: number };
}

/**
 * Организации — клиенты платформы. Создаёт и правит их только суперадминистратор;
 * офисы создаются внутри организации на соседней вкладке.
 */
export function OrganizationsPanel() {
  const { t } = useTranslation();
  const { refreshProfile } = useAuth();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizationRow | null>(null);
  const [form] = Form.useForm();

  const organizations = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => (await api.get<OrganizationRow[]>('/organizations')).data,
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (editing) form.setFieldsValue(editing);
  }, [open, editing, form]);

  const save = useApiMutation(
    async (values: Record<string, unknown>) => {
      if (editing) {
        // Код не меняется; лишние поля запрос отвергает целиком.
        const { code: _code, ...patch } = values;
        return (await api.patch(`/organizations/${editing.id}`, patch)).data;
      }
      return (await api.post('/organizations', values)).data;
    },
    {
      successMessage: editing ? t('Организация обновлена') : t('Организация создана'),
      invalidate: [['organizations'], ['organizations-lookup']],
    },
  );

  const toggleActive = useApiMutation(
    async (row: OrganizationRow) =>
      (await api.patch(`/organizations/${row.id}`, { isActive: !row.isActive })).data,
    {
      successMessage: t('Состояние организации изменено'),
      invalidate: [['organizations']],
    },
  );

  return (
    <>
      <Typography.Paragraph type="secondary">
        {t(
          'Организация — отдельный клиент платформы, например «Аэропорты Узбекистана» или TOSHSHAHARNUR. Данные разных организаций не смешиваются. Отключённая организация закрывает вход во все свои офисы, история при этом сохраняется.',
        )}
      </Typography.Paragraph>

      <Button
        type="primary"
        icon={<PlusOutlined />}
        style={{ marginBottom: 12 }}
        onClick={() => {
          setEditing(null);
          setOpen(true);
        }}
      >
        {t('Создать организацию')}
      </Button>

      <StickyTable<OrganizationRow>
        rowKey="id"
        rowNumbers
        size="small"
        loading={organizations.isLoading}
        dataSource={newestFirst(organizations.data ?? [])}
        pagination={false}
        columns={[
          { title: t('Код'), dataIndex: 'code', width: 110 },
          { title: t('Наименование'), dataIndex: 'nameRu' },
          {
            title: t('Офисов'),
            width: 100,
            align: 'right',
            render: (_: unknown, row: OrganizationRow) => row._count.offices,
          },
          {
            title: t('Состояние'),
            dataIndex: 'isActive',
            width: 130,
            render: (isActive: boolean) =>
              isActive ? (
                <Tag color="green">{t('В работе')}</Tag>
              ) : (
                <Tag color="default">{t('Отключена')}</Tag>
              ),
          },
          createdAtColumn<OrganizationRow>(t),
          {
            title: '',
            width: 100,
            render: (_: unknown, row: OrganizationRow) => (
              <Space size={0}>
                <Tooltip title={t('Изменить')}>
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditing(row);
                      setOpen(true);
                    }}
                  />
                </Tooltip>
                <Popconfirm
                  title={
                    row.isActive
                      ? t('Отключить организацию?')
                      : t('Включить организацию?')
                  }
                  description={
                    row.isActive
                      ? t(
                          'Все её офисы исчезнут из переключателя, сотрудники не смогут войти. Данные сохранятся.',
                        )
                      : t('Офисы организации вернутся в переключатель.')
                  }
                  okText={row.isActive ? t('Отключить') : t('Включить')}
                  cancelText={t('Отмена')}
                  onConfirm={() =>
                    toggleActive.mutate(row, { onSuccess: () => void refreshProfile() })
                  }
                >
                  <Tooltip title={row.isActive ? t('Отключить') : t('Включить')}>
                    <Button
                      type="text"
                      danger={row.isActive}
                      icon={row.isActive ? <StopOutlined /> : <CheckCircleOutlined />}
                    />
                  </Tooltip>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={open}
        title={
          <CardTitle
            title={
              editing ? `${t('Организация')} ${editing.code}` : t('Новая организация')
            }
            id={editing?.id}
          />
        }
        okText={t('Сохранить')}
        cancelText={t('Отмена')}
        confirmLoading={save.isPending}
        onCancel={() => setOpen(false)}
        onOk={() => {
          void form.validateFields().then((values) => {
            save.mutate(values, { onSuccess: () => setOpen(false) });
          });
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="code"
            label={t('Код')}
            tooltip={t(
              '2–16 заглавных латинских букв или цифр. После создания не меняется.',
            )}
            rules={[
              { required: true, message: t('Обязательное поле') },
              {
                pattern: /^[A-Z0-9]{2,16}$/,
                message: t('2–16 заглавных латинских букв или цифр'),
              },
            ]}
          >
            <Input disabled={Boolean(editing)} placeholder="TSHN" />
          </Form.Item>
          <Form.Item
            name="nameRu"
            label={t('Название (рус)')}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="nameUz"
            label={t('Название (узб)')}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="nameEn"
            label={t('Название (англ)')}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
