import { CheckCircleOutlined, CloseCircleOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
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
import { PERMISSIONS, type ClearanceState } from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';

/**
 * Здравпункт — рабочее место медработника.
 *
 * Врач осматривает десятки водителей за час перед сменой, поэтому экран
 * устроен под темп очереди: поиск по табельному номеру, один клик до формы,
 * четыре поля и две кнопки. Если это будет медленнее бумажного журнала,
 * им не станут пользоваться, и предрейсовый контроль снова превратится
 * в галочку у диспетчера.
 */

interface QueueRow {
  driverId: number;
  personnelNumber: string;
  fullName: string;
  department: string | null;
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

export function MedicalPage() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'admitted'>('all');
  const [exam, setExam] = useState<QueueRow | null>(null);
  const [form] = Form.useForm();

  const canExamine = can(PERMISSIONS.DRIVER_MEDICAL_MANAGE);

  const queue = useQuery({
    queryKey: ['medical-queue', search],
    queryFn: async () =>
      (await api.get<QueueRow[]>('/medical/queue', { params: { search: search || undefined } }))
        .data,
  });

  const save = useApiMutation(
    async (values: Record<string, unknown>) => {
      const { data } = await api.post(`/drivers/${exam?.driverId}/medical-checks`, {
        ...values,
        checkedAt: new Date().toISOString(),
        isPreTrip: true,
      });
      return data;
    },
    {
      successMessage: t('Заключение записано'),
      invalidate: [['medical-queue'], ['driver-medical-clearance'], ['driver'], ['drivers']],
    },
  );

  if (!can(PERMISSIONS.DRIVER_READ)) {
    return <Typography.Text type="danger">{t('Нет прав на просмотр здравпункта')}</Typography.Text>;
  }

  const rows = queue.data ?? [];
  const visible =
    filter === 'pending'
      ? rows.filter((r) => !r.allowed)
      : filter === 'admitted'
        ? rows.filter((r) => r.allowed)
        : rows;

  const admitted = rows.filter((r) => r.allowed).length;
  const refused = rows.filter((r) => r.state === 'FAILED').length;

  const openExam = (row: QueueRow): void => {
    form.resetFields();
    // Значения по умолчанию — норма: врач меняет только отклонения,
    // а не заполняет всё заново на каждом человеке.
    form.setFieldsValue({ result: 'PASSED', temperature: 36.6, alcoholPpm: 0 });
    setExam(row);
  };

  return (
    <>
      <Card
        title={
          <Space wrap size="small">
            <MedicineBoxOutlined />
            <span>{t('Здравпункт — предрейсовый осмотр')}</span>
            <Badge status="success" text={`${t('допущено')}: ${admitted}`} />
            {refused > 0 && <Badge status="error" text={`${t('не допущено')}: ${refused}`} />}
            <Badge status="default" text={`${t('всего')}: ${rows.length}`} />
          </Space>
        }
        extra={
          <Space wrap>
            <Input.Search
              allowClear
              placeholder={t('Табельный номер или фамилия')}
              style={{ width: 260 }}
              onSearch={setSearch}
            />
            <Segmented
              value={filter}
              onChange={(v) => setFilter(v as 'all' | 'pending' | 'admitted')}
              options={[
                { label: t('Все'), value: 'all' },
                { label: t('Ждут осмотра'), value: 'pending' },
                { label: t('Допущены'), value: 'admitted' },
              ]}
            />
          </Space>
        }
      >
        <Table<QueueRow>
          rowKey="driverId"
          size="small"
          loading={queue.isLoading}
          dataSource={visible}
          pagination={false}
          scroll={{ y: 560 }}
          locale={{ emptyText: <Empty description={t('Водителей не найдено')} /> }}
          columns={[
            { title: t('Табельный'), dataIndex: 'personnelNumber', width: 120 },
            { title: t('ФИО'), dataIndex: 'fullName' },
            { title: t('Подразделение'), dataIndex: 'department', width: 200 },
            {
              title: t('Допуск'),
              width: 230,
              render: (_: unknown, row: QueueRow) => (
                <Badge status={STATE_BADGE[row.state]} text={t(row.label)} />
              ),
            },
            {
              title: t('Действует до'),
              width: 130,
              render: (_: unknown, row: QueueRow) =>
                row.allowed && row.validUntil ? (
                  dayjs(row.validUntil).format('HH:mm')
                ) : (
                  <Typography.Text type="secondary">—</Typography.Text>
                ),
            },
            {
              title: t('Осмотрел'),
              width: 190,
              render: (_: unknown, row: QueueRow) =>
                row.lastCheck ? (
                  <Tooltip title={dayjs(row.lastCheck.checkedAt).format('DD.MM.YYYY HH:mm')}>
                    {row.lastCheck.checkedByUser?.fullName ?? t('запись с бумаги')}
                  </Tooltip>
                ) : (
                  <Typography.Text type="secondary">{t('не осматривался')}</Typography.Text>
                ),
            },
            {
              title: '',
              width: 130,
              render: (_: unknown, row: QueueRow) =>
                canExamine && (
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
        title={exam ? `${t('Осмотр')} · ${exam.fullName}` : t('Осмотр')}
        okText={t('Записать заключение')}
        cancelText={t('Отмена')}
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
                <CheckCircleOutlined /> {t('Допущен')}
              </Radio.Button>
              <Radio.Button value="CONDITIONAL">{t('С ограничениями')}</Radio.Button>
              <Radio.Button value="FAILED">
                <CloseCircleOutlined /> {t('Не допущен')}
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Space size="middle" wrap>
            <Form.Item name="bloodPressure" label={t('Давление')}>
              <Input placeholder="120/80" style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="temperature" label={t('Температура, °C')}>
              <InputNumber min={30} max={45} step={0.1} style={{ width: 130 }} />
            </Form.Item>
            <Form.Item name="alcoholPpm" label={t('Алкотестер, ‰')}>
              <InputNumber min={0} max={10} step={0.01} style={{ width: 130 }} />
            </Form.Item>
          </Space>

          <Form.Item
            name="notes"
            label={t('Примечание')}
            tooltip={t('При допуске с ограничениями диспетчер увидит этот текст перед выдачей путевого листа')}
          >
            <Input.TextArea rows={2} maxLength={400} />
          </Form.Item>

          <Form.Item
            name="validUntil"
            label={t('Действует до')}
            tooltip={t('Если не указать — двенадцать часов от момента осмотра, длина смены с запасом')}
          >
            <Input type="datetime-local" />
          </Form.Item>

          <Typography.Text type="secondary">
            {t('Заключение подписывается вашей учётной записью и попадает в журнал действий. Изменить его нельзя — при ошибке проведите осмотр повторно.')}
          </Typography.Text>
        </Form>
      </Modal>

      {!canExamine && (
        <Tag color="warning" style={{ marginTop: 12 }}>
          {t('Просмотр без права проводить осмотр')}
        </Tag>
      )}
    </>
  );
}
