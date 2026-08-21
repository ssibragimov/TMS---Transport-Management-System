import { CheckCircleOutlined, CloseCircleOutlined, ToolOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS, TECHNICAL_CHECKLIST, type ClearanceState } from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { CATEGORY_LABEL } from '@/lib/labels';

/**
 * Техконтроль — рабочее место механика.
 *
 * Устроено так же, как здравпункт, и по той же причине: механик осматривает
 * десятки машин перед сменой, и если это медленнее бумажного журнала, им
 * не станут пользоваться. Перечень узлов по умолчанию отмечен исправным —
 * механик снимает галочки только там, где нашёл замечание.
 */

interface QueueRow {
  vehicleId: number;
  garageNumber: string;
  plateNumber: string | null;
  category: string;
  department: string | null;
  currentOdometer: string | null;
  state: ClearanceState;
  allowed: boolean;
  label: string;
  validUntil: string | null;
  lastCheck: {
    id: number;
    checkedAt: string;
    result: string;
    notes: string | null;
    checkedByUser: { fullName: string } | null;
  } | null;
}

const STATE_BADGE: Record<ClearanceState, 'success' | 'warning' | 'error' | 'default'> = {
  PASSED: 'success',
  CONDITIONAL: 'warning',
  MISSING: 'default',
  EXPIRED: 'warning',
  FAILED: 'error',
};

export function TechnicalPage() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'released'>('all');
  const [exam, setExam] = useState<QueueRow | null>(null);
  const [form] = Form.useForm();

  const canInspect = can(PERMISSIONS.VEHICLE_TECHNICAL_INSPECT);

  const queue = useQuery({
    queryKey: ['technical-queue', search],
    queryFn: async () =>
      (await api.get<QueueRow[]>('/technical/queue', { params: { search: search || undefined } }))
        .data,
  });

  const save = useApiMutation(
    async (values: Record<string, unknown>) => {
      // Перечень узлов собирается в объект: в базе он лежит одним полем,
      // и добавление нового пункта не потребует миграции.
      const checklist = Object.fromEntries(
        TECHNICAL_CHECKLIST.map((item) => [item.key, values[item.key] !== false]),
      );

      const { data } = await api.post(`/vehicles/${exam?.vehicleId}/technical-inspections`, {
        result: values.result,
        odometer: values.odometer,
        notes: values.notes,
        checklist,
      });
      return data;
    },
    {
      successMessage: t('Заключение записано'),
      invalidate: [['technical-queue'], ['vehicle-technical-clearance'], ['vehicles'], ['vehicle']],
    },
  );

  if (!can(PERMISSIONS.VEHICLE_READ)) {
    return <Typography.Text type="danger">{t('Нет прав на просмотр техконтроля')}</Typography.Text>;
  }

  const rows = queue.data ?? [];
  const visible =
    filter === 'pending'
      ? rows.filter((r) => !r.allowed)
      : filter === 'released'
        ? rows.filter((r) => r.allowed)
        : rows;

  const released = rows.filter((r) => r.allowed).length;
  const refused = rows.filter((r) => r.state === 'FAILED').length;

  const openExam = (row: QueueRow): void => {
    form.resetFields();
    form.setFieldsValue({
      result: 'PASSED',
      odometer: row.currentOdometer ? Number(row.currentOdometer) : undefined,
      // Узлы исправны по умолчанию: механик отмечает отклонения,
      // а не подтверждает каждый пункт заново на каждой машине.
      ...Object.fromEntries(TECHNICAL_CHECKLIST.map((item) => [item.key, true])),
    });
    setExam(row);
  };

  return (
    <>
      <Card
        title={
          <Space wrap size="small">
            <ToolOutlined />
            <span>{t('Техконтроль — предрейсовый осмотр техники')}</span>
            <Badge status="success" text={`${t('выпущено')}: ${released}`} />
            {refused > 0 && <Badge status="error" text={`${t('не выпущено')}: ${refused}`} />}
            <Badge status="default" text={`${t('всего')}: ${rows.length}`} />
          </Space>
        }
        extra={
          <Space wrap>
            <Input.Search
              allowClear
              placeholder={t('Гаражный или госномер')}
              style={{ width: 240 }}
              onSearch={setSearch}
            />
            <Segmented
              value={filter}
              onChange={(v) => setFilter(v as 'all' | 'pending' | 'released')}
              options={[
                { label: t('Вся'), value: 'all' },
                { label: t('Ждут осмотра'), value: 'pending' },
                { label: t('Выпущены'), value: 'released' },
              ]}
            />
          </Space>
        }
      >
        <Table<QueueRow>
          rowKey="vehicleId"
          size="small"
          loading={queue.isLoading}
          dataSource={visible}
          pagination={false}
          scroll={{ y: 560 }}
          locale={{ emptyText: <Empty description={t('Техники не найдено')} /> }}
          columns={[
            { title: t('Гаражный'), dataIndex: 'garageNumber', width: 110 },
            {
              title: t('Категория'),
              dataIndex: 'category',
              width: 190,
              render: (value: string) => t(CATEGORY_LABEL[value] ?? value),
            },
            { title: t('Подразделение'), dataIndex: 'department', width: 180 },
            {
              title: t('Допуск'),
              width: 240,
              render: (_: unknown, row: QueueRow) => (
                <Badge status={STATE_BADGE[row.state]} text={t(row.label)} />
              ),
            },
            {
              title: t('Действует до'),
              width: 120,
              render: (_: unknown, row: QueueRow) =>
                row.allowed && row.validUntil ? (
                  dayjs(row.validUntil).format('HH:mm')
                ) : (
                  <Typography.Text type="secondary">—</Typography.Text>
                ),
            },
            {
              title: t('Осмотрел'),
              width: 180,
              render: (_: unknown, row: QueueRow) =>
                row.lastCheck ? (
                  <Tooltip title={dayjs(row.lastCheck.checkedAt).format('DD.MM.YYYY HH:mm')}>
                    {row.lastCheck.checkedByUser?.fullName ?? t('запись с бумаги')}
                  </Tooltip>
                ) : (
                  <Typography.Text type="secondary">{t('не осматривалась')}</Typography.Text>
                ),
            },
            {
              title: '',
              width: 120,
              render: (_: unknown, row: QueueRow) =>
                canInspect && (
                  <Button type="link" size="small" onClick={() => openExam(row)}>
                    {t('Осмотреть')}
                  </Button>
                ),
            },
          ]}
        />
      </Card>

      <Modal
        open={exam !== null}
        title={exam ? `${t('Осмотр')} · ${exam.garageNumber}` : t('Осмотр')}
        okText={t('Записать заключение')}
        cancelText={t('Отмена')}
        width={560}
        confirmLoading={save.isPending}
        onCancel={() => setExam(null)}
        onOk={() => {
          void form.validateFields().then((values) => {
            save.mutate(values, { onSuccess: () => setExam(null) });
          });
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="result"
            label={t('Заключение')}
            rules={[{ required: true, message: t('Обязательное поле') }]}
          >
            <Radio.Group buttonStyle="solid">
              <Radio.Button value="PASSED">
                <CheckCircleOutlined /> {t('Выпустить')}
              </Radio.Button>
              <Radio.Button value="CONDITIONAL">{t('С ограничениями')}</Radio.Button>
              <Radio.Button value="FAILED">
                <CloseCircleOutlined /> {t('Не выпускать')}
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Typography.Text type="secondary">{t('Проверенные узлы')}</Typography.Text>
          <div style={{ marginTop: 8, marginBottom: 16 }}>
            {TECHNICAL_CHECKLIST.map((item) => (
              <Form.Item
                key={item.key}
                name={item.key}
                valuePropName="checked"
                style={{ marginBottom: 4 }}
              >
                <Checkbox>{t(item.label)}</Checkbox>
              </Form.Item>
            ))}
          </div>

          <Form.Item
            name="odometer"
            label={t('Одометр на момент осмотра, км')}
            tooltip={t('Сверяется с показанием на выезд — расхождение видно сразу')}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="notes"
            label={t('Замечания')}
            tooltip={t('При выпуске с ограничениями диспетчер увидит этот текст перед выдачей листа')}
          >
            <Input.TextArea rows={2} maxLength={600} />
          </Form.Item>

          <Typography.Text type="secondary">
            {t('Заключение подписывается вашей учётной записью и попадает в журнал действий. Изменить его нельзя — при ошибке проведите осмотр повторно.')}
          </Typography.Text>
        </Form>
      </Modal>

      {!canInspect && (
        <Tag color="warning" style={{ marginTop: 12 }}>
          {t('Просмотр без права проводить осмотр')}
        </Tag>
      )}
    </>
  );
}
