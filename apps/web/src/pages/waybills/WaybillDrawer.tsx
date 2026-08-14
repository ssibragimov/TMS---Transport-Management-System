import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { PERMISSIONS, WaybillStatus } from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import {
  WAYBILL_STATUS_COLOR,
  WAYBILL_STATUS_LABEL,
  deviationColor,
  fmt,
} from '@/lib/labels';

interface Props {
  waybillId: number | null;
  onClose: () => void;
}

interface WaybillDetail {
  id: number;
  number: string;
  status: string;
  type: string;
  validFrom: string;
  validTo: string;
  odometerStart: string | null;
  odometerEnd: string | null;
  engineHoursStart: string | null;
  engineHoursEnd: string | null;
  distanceKm: string | null;
  engineHours: string | null;
  fuelOpening: string;
  fuelIssued: string;
  fuelConsumed: string | null;
  fuelClosing: string | null;
  fuelNorm: string | null;
  fuelDeviation: string | null;
  fuelDeviationPct: string | null;
  normBreakdown: { lines: Array<{ key: string; rate: number; quantity: number; unit: string; litres: number }> } | null;
  notes: string | null;
  cancelReason: string | null;
  vehicle: { garageNumber: string; plateNumber: string | null; requiresAirsidePermit: boolean } | null;
  driver: { lastName: string; firstName: string; personnelNumber: string } | null;
  tasks: Array<{
    id: number;
    sequence: number;
    flightNumber: string | null;
    aircraftReg: string | null;
    standNumber: string | null;
    toPoint: string | null;
    distanceKm: string | null;
    engineHours: string | null;
  }>;
  fuelIssues: Array<{
    id: number;
    documentNumber: string;
    issuedAt: string;
    volume: string;
    tank: { code: string } | null;
  }>;
}

type ActionKind = 'issue' | 'submit' | 'close' | 'cancel' | null;

export function WaybillDrawer({ waybillId, onClose }: Props) {
  const { can } = useAuth();
  const [action, setAction] = useState<ActionKind>(null);
  const [form] = Form.useForm();

  const open = waybillId !== null;

  const waybill = useQuery({
    queryKey: ['waybill', waybillId],
    enabled: open,
    queryFn: async () => (await api.get<WaybillDetail>(`/waybills/${waybillId}`)).data,
  });

  const invalidate = [['waybill'], ['waybills'], ['office-summary'], ['vehicles'], ['fuel-tanks']];

  const run = useApiMutation(
    async ({ kind, values }: { kind: Exclude<ActionKind, null>; values: Record<string, unknown> }) =>
      (await api.post(`/waybills/${waybillId}/${kind}`, values)).data,
    { successMessage: 'Операция выполнена', invalidate },
  );

  const w = waybill.data;
  const status = w?.status;

  const openAction = (kind: Exclude<ActionKind, null>): void => {
    form.resetFields();
    if (kind === 'submit' || kind === 'close') {
      form.setFieldsValue({
        odometerEnd: w?.odometerEnd ? Number(w.odometerEnd) : undefined,
        engineHoursEnd: w?.engineHoursEnd ? Number(w.engineHoursEnd) : undefined,
      });
    }
    if (kind === 'issue') {
      form.setFieldsValue({ preTripMedicalOk: true, preTripTechnicalOk: true });
    }
    setAction(kind);
  };

  const deviationPct = w?.fuelDeviationPct === null || w?.fuelDeviationPct === undefined
    ? null
    : Number(w.fuelDeviationPct);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={880}
      loading={waybill.isLoading}
      title={
        w ? (
          <Space>
            <span>{w.number}</span>
            <Tag color={WAYBILL_STATUS_COLOR[w.status]}>
              {WAYBILL_STATUS_LABEL[w.status] ?? w.status}
            </Tag>
          </Space>
        ) : (
          'Путевой лист'
        )
      }
      extra={
        w && (
          <Space>
            {status === WaybillStatus.DRAFT && can(PERMISSIONS.WAYBILL_ISSUE) && (
              <Button type="primary" onClick={() => openAction('issue')}>
                Выдать водителю
              </Button>
            )}
            {(status === WaybillStatus.ISSUED || status === WaybillStatus.IN_PROGRESS) &&
              can(PERMISSIONS.WAYBILL_UPDATE) && (
                <Button type="primary" onClick={() => openAction('submit')}>
                  Принять от водителя
                </Button>
              )}
            {status === WaybillStatus.SUBMITTED && can(PERMISSIONS.WAYBILL_CLOSE) && (
              <Button type="primary" onClick={() => openAction('close')}>
                Закрыть с расчётом
              </Button>
            )}
            {status !== WaybillStatus.CLOSED &&
              status !== WaybillStatus.CANCELLED &&
              can(PERMISSIONS.WAYBILL_CANCEL) && (
                <Button danger onClick={() => openAction('cancel')}>
                  Аннулировать
                </Button>
              )}
          </Space>
        )
      }
    >
      {w && (
        <>
          {w.status === WaybillStatus.CANCELLED && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message="Путевой лист аннулирован"
              description={w.cancelReason}
            />
          )}

          {w.status === WaybillStatus.CLOSED && (
            <Space size="large" style={{ marginBottom: 16 }}>
              <Statistic title="Норма, л" value={fmt(w.fuelNorm, 2)} />
              <Statistic title="Факт, л" value={fmt(w.fuelConsumed, 2)} />
              <Statistic
                title="Отклонение"
                value={deviationPct === null ? '—' : `${deviationPct > 0 ? '+' : ''}${deviationPct} %`}
                valueStyle={{ color: deviationColor(deviationPct) }}
              />
            </Space>
          )}

          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="Техника">
              {w.vehicle?.garageNumber ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Водитель">
              {w.driver ? `${w.driver.lastName} ${w.driver.firstName}` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Начало">
              {dayjs(w.validFrom).format('DD.MM.YYYY HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label="Окончание">
              {dayjs(w.validTo).format('DD.MM.YYYY HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label="Одометр">
              {fmt(w.odometerStart)} → {fmt(w.odometerEnd)}
            </Descriptions.Item>
            <Descriptions.Item label="Моточасы">
              {fmt(w.engineHoursStart)} → {fmt(w.engineHoursEnd)}
            </Descriptions.Item>
            <Descriptions.Item label="Пробег за смену">{fmt(w.distanceKm, 1)} км</Descriptions.Item>
            <Descriptions.Item label="Наработка">{fmt(w.engineHours, 1)} мч</Descriptions.Item>
            <Descriptions.Item label="Топливо на начало">{fmt(w.fuelOpening, 2)} л</Descriptions.Item>
            <Descriptions.Item label="Выдано за смену">{fmt(w.fuelIssued, 2)} л</Descriptions.Item>
            <Descriptions.Item label="Остаток на конец">{fmt(w.fuelClosing, 2)} л</Descriptions.Item>
            <Descriptions.Item label="Примечание">{w.notes ?? '—'}</Descriptions.Item>
          </Descriptions>

          <h4 style={{ marginTop: 24 }}>Задания</h4>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={w.tasks}
            columns={[
              { title: '№', dataIndex: 'sequence', width: 50 },
              { title: 'Рейс', dataIndex: 'flightNumber', width: 90 },
              { title: 'Борт', dataIndex: 'aircraftReg', width: 100 },
              { title: 'Стоянка', dataIndex: 'standNumber', width: 90 },
              { title: 'Куда', dataIndex: 'toPoint' },
              {
                title: 'км',
                dataIndex: 'distanceKm',
                align: 'right',
                width: 80,
                render: (v: string | null) => fmt(v, 1),
              },
              {
                title: 'мч',
                dataIndex: 'engineHours',
                align: 'right',
                width: 80,
                render: (v: string | null) => fmt(v, 1),
              },
            ]}
          />

          <h4 style={{ marginTop: 24 }}>Заправки по листу</h4>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={w.fuelIssues}
            locale={{ emptyText: 'Заправок не было' }}
            columns={[
              { title: 'Документ', dataIndex: 'documentNumber' },
              {
                title: 'Дата',
                dataIndex: 'issuedAt',
                render: (d: string) => dayjs(d).format('DD.MM.YYYY HH:mm'),
              },
              { title: 'Ёмкость', render: (_: unknown, row: { tank: { code: string } | null }) => row.tank?.code ?? '—' },
              {
                title: 'Объём, л',
                dataIndex: 'volume',
                align: 'right',
                render: (v: string) => fmt(v, 2),
              },
            ]}
          />

          {w.normBreakdown?.lines && (
            <>
              <h4 style={{ marginTop: 24 }}>Расшифровка расчёта нормы</h4>
              <Typography.Paragraph type="secondary">
                Сохранена на момент закрытия. Изменение норм задним числом её не затронет.
              </Typography.Paragraph>
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                dataSource={w.normBreakdown.lines}
                columns={[
                  { title: 'Составляющая', dataIndex: 'key' },
                  { title: 'Ставка', dataIndex: 'rate', align: 'right' },
                  {
                    title: 'Объём',
                    align: 'right',
                    render: (_: unknown, row: { quantity: number; unit: string }) =>
                      `${row.quantity} ${row.unit}`,
                  },
                  { title: 'Литров', dataIndex: 'litres', align: 'right' },
                ]}
              />
            </>
          )}
        </>
      )}

      <Modal
        open={action !== null}
        title={
          action === 'issue'
            ? 'Выдача путевого листа'
            : action === 'submit'
              ? 'Приём от водителя'
              : action === 'close'
                ? 'Закрытие с расчётом'
                : 'Аннулирование'
        }
        okText="Подтвердить"
        cancelText="Отмена"
        confirmLoading={run.isPending}
        onCancel={() => setAction(null)}
        onOk={() => {
          void form.validateFields().then((values) => {
            run.mutate(
              { kind: action as Exclude<ActionKind, null>, values },
              { onSuccess: () => setAction(null) },
            );
          });
        }}
      >
        <Form form={form} layout="vertical">
          {action === 'issue' && (
            <>
              <Typography.Paragraph type="secondary">
                Система проверит права, допуск на перрон и медосмотр водителя. При замечаниях
                выдача будет заблокирована.
              </Typography.Paragraph>
              <Form.Item name="preTripMedicalOk" valuePropName="checked">
                <Checkbox>Предрейсовый медосмотр пройден</Checkbox>
              </Form.Item>
              <Form.Item name="preTripTechnicalOk" valuePropName="checked">
                <Checkbox>Предрейсовый технический осмотр пройден</Checkbox>
              </Form.Item>
              <Form.Item name="overrideEligibility" valuePropName="checked">
                <Checkbox>
                  Выдать вопреки замечаниям (действие попадёт в журнал аудита)
                </Checkbox>
              </Form.Item>
            </>
          )}

          {action === 'submit' && (
            <>
              <Form.Item name="odometerEnd" label="Одометр на возврат, км">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="engineHoursEnd" label="Моточасы на возврат">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}

          {action === 'close' && (
            <>
              <Form.Item name="odometerEnd" label="Одометр на возврат, км">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="engineHoursEnd" label="Моточасы на возврат">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="fuelClosing"
                label="Замеренный остаток в баке, л"
                tooltip="Если не указать, фактический расход будет принят равным нормативному — и перерасход не проявится"
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}

          {action === 'cancel' && (
            <Form.Item name="reason" label="Причина" rules={[{ required: true }]}>
              <Input.TextArea rows={3} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Drawer>
  );
}
