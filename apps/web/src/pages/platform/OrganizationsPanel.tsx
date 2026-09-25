import {
  CheckCircleOutlined,
  EditOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Col,
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
import { WaybillTaskLayout } from '@gsm/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { CardTitle } from '@/components/EntityId';
import { createdAtColumn, newestFirst } from '@/components/createdAtColumn';
import { StickyTable } from '@/components/StickyTable';
import { OfficeLogoCell, TASK_LAYOUT_LABEL } from '@/pages/admin/OfficesPanel';

interface OrganizationRow {
  id: number;
  code: string;
  nameRu: string;
  nameUz: string;
  nameEn: string;
  taskLayout: string;
  taskAddressALocations: boolean;
  logoKey: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { offices: number };
}

/** Список локаций осмыслен только при раскладке «Адрес А/Б». */
function normalize(values: Record<string, unknown>): Record<string, unknown> {
  return {
    ...values,
    taskAddressALocations:
      values.taskLayout === WaybillTaskLayout.ADDRESS
        ? Boolean(values.taskAddressALocations)
        : false,
  };
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
    else
      form.setFieldsValue({
        taskLayout: WaybillTaskLayout.FLIGHT,
        taskAddressALocations: false,
      });
  }, [open, editing, form]);

  const save = useApiMutation(
    async (values: Record<string, unknown>) => {
      if (editing) {
        // Код не меняется; лишние поля запрос отвергает целиком.
        const { code: _code, ...patch } = values;
        return (await api.patch(`/organizations/${editing.id}`, normalize(patch))).data;
      }
      return (await api.post('/organizations', normalize(values))).data;
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
          {
            title: t('Логотип'),
            key: 'logo',
            width: 130,
            render: (_: unknown, row: OrganizationRow) => (
              <OfficeLogoCell office={row} manage resource="organizations" />
            ),
          },
          { title: t('Код'), dataIndex: 'code', width: 110 },
          { title: t('Наименование'), dataIndex: 'nameRu' },
          {
            title: t('Раскладка задания'),
            dataIndex: 'taskLayout',
            width: 260,
            render: (value: string) => t(TASK_LAYOUT_LABEL[value] ?? value),
          },
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
        width={640}
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

          <Typography.Text strong>{t('Поля заданий путевого листа')}</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
            {t(
              'Общие для всех офисов организации. Отдельному офису можно задать свою раскладку.',
            )}
          </Typography.Paragraph>
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item
                name="taskLayout"
                label={t('Раскладка')}
                rules={[{ required: true }]}
              >
                <Select
                  options={Object.values(WaybillTaskLayout).map((value) => ({
                    value,
                    label: t(TASK_LAYOUT_LABEL[value] ?? value),
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item
                noStyle
                shouldUpdate={(prev, next) => prev.taskLayout !== next.taskLayout}
              >
                {({ getFieldValue }) =>
                  getFieldValue('taskLayout') === WaybillTaskLayout.ADDRESS ? (
                    <Form.Item
                      name="taskAddressALocations"
                      label={t('«Адрес А» — список локаций')}
                      valuePropName="checked"
                      tooltip={t(
                        'Вместо свободного текста — выбор из справочника «Локации заданий»',
                      )}
                    >
                      <Switch />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}
