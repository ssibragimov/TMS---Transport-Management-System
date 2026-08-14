import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import type { RcFile } from 'antd/es/upload';
import { useEffect, useState } from 'react';
import { OfficeKind, PERMISSIONS } from '@gsm/shared';

import { api, errorMessage } from '@/api/client';
import { useApiMutation, useAuthedImage } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { StickyTable } from '@/components/StickyTable';

interface OfficeRow {
  id: number;
  code: string;
  kind: string;
  parentId: number | null;
  nameRu: string;
  nameUz: string;
  nameEn: string;
  iataCode: string | null;
  icaoCode: string | null;
  city: string | null;
  timezone: string;
  logoKey: string | null;
  isActive: boolean;
}

const KIND_LABEL: Record<string, string> = {
  HEADQUARTERS: 'Головной офис',
  AIRPORT: 'Аэропорт',
  BRANCH: 'Филиал',
};

const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

const MAX_LOGO_BYTES = 10 * 1024 * 1024;

/** Логотип офиса в таблице: он же кнопка загрузки и замены. */
function OfficeLogoCell({ office, manage }: { office: OfficeRow; manage: boolean }) {
  const { t } = useTranslation();

  const { message } = App.useApp();
  const queryClient = useQueryClient();
  // Ключ входит в URL, поэтому после замены картинка перезапрашивается сама,
  // а не берётся из кэша браузера как старая.
  const src = useAuthedImage(office.logoKey ? `/offices/${office.id}/logo` : null);

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['offices-admin'] });
    await queryClient.invalidateQueries({ queryKey: ['offices'] });
  };

  const upload = async (file: RcFile): Promise<void> => {
    if (file.size > MAX_LOGO_BYTES) {
      void message.error('Файл больше 10 МБ');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    try {
      await api.post(`/offices/${office.id}/logo`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      void message.success('Логотип обновлён');
      await refresh();
    } catch (error) {
      void message.error(errorMessage(error));
    }
  };

  const remove = async (): Promise<void> => {
    try {
      await api.delete(`/offices/${office.id}/logo`);
      void message.success('Логотип удалён');
      await refresh();
    } catch (error) {
      void message.error(errorMessage(error));
    }
  };

  // Высота задана, ширина — по пропорциям файла: логотип показывается таким,
  // каким загружен, а не вписанным в квадрат с пустыми полями.
  const preview = src ? (
    <img
      src={src}
      alt=""
      style={{ height: 28, width: 'auto', maxWidth: 96, objectFit: 'contain', display: 'block' }}
    />
  ) : (
    <div
      style={{
        height: 28,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        borderRadius: 4,
        background: '#f0f0f0',
        color: '#8c8c8c',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {office.code.slice(0, 3)}
    </div>
  );

  if (!manage) return preview;

  return (
    <Space size={4}>
      {preview}
      <Upload
        accept="image/jpeg,image/png,image/webp"
        showUploadList={false}
        beforeUpload={(file) => {
          void upload(file);
          return false;
        }}
      >
        <Tooltip title={office.logoKey ? 'Заменить логотип' : 'Загрузить логотип'}>
          <Button type="text" size="small" icon={<UploadOutlined />} />
        </Tooltip>
      </Upload>
      {office.logoKey && (
        <Popconfirm title={t("Удалить логотип?")} okText={t("Удалить")} cancelText={t("Отмена")} onConfirm={remove}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      )}
    </Space>
  );
}

/**
 * Офисы — это масштабирование платформы на новые аэропорты.
 *
 * Список приходит уже отфильтрованным политикой RLS: администратор
 * аэропорта увидит здесь только свой офис, суперадминистратор — все.
 */
export function OfficesPanel() {
  const { t } = useTranslation();

  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OfficeRow | null>(null);
  const [form] = Form.useForm();

  const manage = can(PERMISSIONS.OFFICE_MANAGE);

  // Отключённые запрашиваются намеренно: иначе офис, однажды отключённый,
  // пропал бы и отсюда, и включить его обратно было бы нечем.
  const offices = useQuery({
    queryKey: ['offices-admin'],
    queryFn: async () =>
      (await api.get<OfficeRow[]>('/offices', { params: { includeInactive: true } })).data,
  });

  const toggleActive = useApiMutation(
    async (office: OfficeRow) =>
      (await api.patch(`/offices/${office.id}`, { isActive: !office.isActive })).data,
    {
      successMessage: t("Состояние офиса изменено"),
      invalidate: [['offices-admin'], ['offices']],
    },
  );

  // Полная карточка нужна ради зимней надбавки: в списке её нет.
  const detail = useQuery({
    queryKey: ['office-detail', editing?.id],
    enabled: open && editing !== null,
    queryFn: async () => (await api.get(`/offices/${editing!.id}`)).data as Record<string, unknown>,
  });

  useEffect(() => {
    if (!open) return;
    if (!editing) {
      form.resetFields();
      form.setFieldsValue({
        kind: OfficeKind.AIRPORT,
        timezone: 'Asia/Tashkent',
        winterSurchargePct: 8,
        winterFromMonth: 11,
        winterToMonth: 3,
      });
      return;
    }
    if (detail.data) {
      form.setFieldsValue({
        ...editing,
        winterSurchargePct: Number(detail.data.winterSurchargePct ?? 0),
        winterFromMonth: detail.data.winterFromMonth,
        winterToMonth: detail.data.winterToMonth,
        address: detail.data.address,
        phone: detail.data.phone,
        isActive: detail.data.isActive,
      });
    }
  }, [open, editing, detail.data, form]);

  const save = useApiMutation(
    async (values: Record<string, unknown>) => {
      if (editing) {
        return (await api.patch(`/offices/${editing.id}`, values)).data;
      }
      return (await api.post('/offices', values)).data;
    },
    {
      successMessage: editing ? 'Офис обновлён' : 'Аэропорт подключён',
      invalidate: [['offices-admin'], ['offices']],
    },
  );

  return (
    <>
      <Typography.Paragraph type="secondary">
        Код офиса участвует в номерах документов (<Typography.Text code>PL-TAS-2026-000123</Typography.Text>)
        и после создания не меняется. Зимняя надбавка задаётся здесь и применяется ко всей
        технике офиса — у каждого региона она своя. Логотип показывается в шапке бокового
        меню: при переключении офиса видно, где вы работаете, без чтения названия.
      </Typography.Paragraph>

      <Typography.Paragraph type="secondary">
        {t("Офис не удаляется — он отключается. Отключённый исчезает из переключателя и из рабочих списков, но техника, путевые листы и вся история остаются на месте, и включить его обратно можно в любой момент. Здесь, в администрировании, отключённые офисы видны всегда — иначе вернуть их было бы нечем.")}
      </Typography.Paragraph>

      {manage && (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          style={{ marginBottom: 12 }}
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          {t("Подключить аэропорт")}
        </Button>
      )}

      <StickyTable<OfficeRow>
        rowKey="id"
        rowNumbers
        size="small"
        loading={offices.isLoading}
        dataSource={offices.data ?? []}
        pagination={false}
        columns={[
          {
            title: t("Логотип"),
            key: 'logo',
            width: 130,
            render: (_: unknown, row: OfficeRow) => (
              <OfficeLogoCell office={row} manage={manage} />
            ),
          },
          { title: t("Код"), dataIndex: 'code', width: 90 },
          { title: t("Наименование"), dataIndex: 'nameRu' },
          {
            title: t("Тип"),
            dataIndex: 'kind',
            width: 150,
            render: (value: string) => (
              <Tag color={value === 'HEADQUARTERS' ? 'purple' : 'blue'}>
                {t(KIND_LABEL[value] ?? value)}
              </Tag>
            ),
          },
          { title: 'IATA', dataIndex: 'iataCode', width: 80 },
          { title: 'ICAO', dataIndex: 'icaoCode', width: 80 },
          { title: t("Город"), dataIndex: 'city', width: 140 },
          { title: t("Часовой пояс"), dataIndex: 'timezone', width: 160 },
          {
            title: t("Состояние"),
            dataIndex: 'isActive',
            width: 130,
            render: (isActive: boolean) =>
              isActive ? (
                <Tag color="green">В работе</Tag>
              ) : (
                <Tag color="default">Отключён</Tag>
              ),
          },
          ...(manage
            ? [
                {
                  title: '',
                  width: 100,
                  render: (_: unknown, row: OfficeRow) => (
                    <Space size={0}>
                      <Tooltip title={t("Изменить")}>
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
                        title={row.isActive ? 'Отключить офис?' : 'Включить офис?'}
                        description={
                          row.isActive
                            ? 'Офис исчезнет из переключателя и списков. Данные и история сохранятся, включить можно в любой момент. Сотрудники этого офиса войти не смогут.'
                            : 'Офис вернётся в переключатель и станет доступен сотрудникам.'
                        }
                        okText={row.isActive ? 'Отключить' : 'Включить'}
                        cancelText={t("Отмена")}
                        onConfirm={() => toggleActive.mutate(row)}
                      >
                        <Tooltip title={row.isActive ? 'Отключить' : 'Включить'}>
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
              ]
            : []),
        ]}
      />

      <Modal
        open={open}
        width={760}
        title={editing ? `Офис ${editing.code}` : 'Подключение аэропорта'}
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
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item
                name="code"
                label={t("Код")}
                tooltip={t("2–8 заглавных латинских букв. После создания не меняется.")}
                rules={[
                  { required: true, message: t("Обязательное поле") },
                  { pattern: /^[A-Z]{2,8}$/, message: t("2–8 заглавных латинских букв") },
                ]}
              >
                <Input disabled={Boolean(editing)} placeholder="JIZ" />
              </Form.Item>
            </Col>
            <Col span={9}>
              <Form.Item name="kind" label={t("Тип")} rules={[{ required: true }]}>
                <Select
                  disabled={Boolean(editing)}
                  options={Object.values(OfficeKind).map((value) => ({
                    value,
                    label: t(KIND_LABEL[value] ?? value),
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={9}>
              <Form.Item name="parentId" label={t("Головной офис")}>
                <Select
                  allowClear
                  disabled={Boolean(editing)}
                  options={(offices.data ?? [])
                    .filter((office) => office.kind === 'HEADQUARTERS')
                    .map((office) => ({ value: office.id, label: office.nameRu }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="nameRu" label={t("Название (рус)")} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="nameUz" label={t("Название (узб)")} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="nameEn" label={t("Название (англ)")} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={5}>
              <Form.Item name="iataCode" label="IATA">
                <Input maxLength={3} placeholder="JIZ" />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="icaoCode" label="ICAO">
                <Input maxLength={4} placeholder="UTSJ" />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item name="city" label={t("Город")}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item name="timezone" label={t("Часовой пояс")}>
                <Select
                  options={[
                    { value: 'Asia/Tashkent', label: 'Asia/Tashkent' },
                    { value: 'Asia/Samarkand', label: 'Asia/Samarkand' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Typography.Text strong>Зимняя надбавка к норме расхода</Typography.Text>
          <Row gutter={16} style={{ marginTop: 8 }}>
            <Col span={8}>
              <Form.Item
                name="winterSurchargePct"
                label={t("Надбавка, %")}
                tooltip={t("Применяется ко всей технике офиса в указанный период")}
              >
                <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="winterFromMonth" label={t("С месяца")}>
                <Select
                  options={MONTHS.map((label, index) => ({ value: index + 1, label }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="winterToMonth" label={t("По месяц")}>
                <Select
                  options={MONTHS.map((label, index) => ({ value: index + 1, label }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Space>
            <Form.Item name="phone" label={t("Телефон")}>
              <Input style={{ width: 220 }} />
            </Form.Item>
            {editing && (
              <Form.Item name="isActive" label={t("Активен")} valuePropName="checked">
                <Switch />
              </Form.Item>
            )}
          </Space>
          <Form.Item name="address" label={t("Адрес")}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
