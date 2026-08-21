import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  CONDITION_LABEL,
  PERMISSIONS,
  VehicleCondition,
  WaybillStatus,
  needsConditionAct,
} from '@gsm/shared';

import { EntityAuditLog } from '@/components/EntityAuditLog';
import { EntityId } from '@/components/EntityId';
import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { MedicalClearanceCard } from './MedicalClearanceCard';
import { TechnicalClearanceCard } from './TechnicalClearanceCard';
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
  conditionOnIssue: string | null;
  conditionIssueNotes: string | null;
  conditionOnReturn: string | null;
  conditionReturnNotes: string | null;
  vehicleId: number;
  vehicle: { garageNumber: string; plateNumber: string | null; requiresAirsidePermit: boolean } | null;
  driverId: number;
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

/**
 * Варианты состояния техники — один список для выдачи и для закрытия.
 *
 * Список строится на уровне модуля, вне компонента, поэтому t() здесь
 * недоступен: перевод применяется в месте отрисовки. Хранится русский
 * текст из общего пакета — он же ключ перевода.
 */
const CONDITION_OPTIONS = Object.values(VehicleCondition).map((value) => ({
  value,
  labelKey: CONDITION_LABEL[value],
}));

export function WaybillDrawer({ waybillId, onClose }: Props) {
  const { t } = useTranslation();

  const { can } = useAuth();
  const [action, setAction] = useState<ActionKind>(null);
  // Состояние допуска приходит из карточки: от него зависит, спрашивать ли
  // причину обхода и показывать ли предупреждение о недопуске.
  const [clearance, setClearance] = useState<{
    state: string;
    allowed: boolean;
    overridable: boolean;
  } | null>(null);
  // Заключение механика — второй допуск, от которого зависит выпуск.
  const [technical, setTechnical] = useState<{
    state: string;
    allowed: boolean;
    overridable: boolean;
  } | null>(null);
  const [form] = Form.useForm();
  // Следим за выбором, чтобы предупредить об акте до нажатия кнопки.
  const returnCondition = Form.useWatch('conditionOnReturn', form) as VehicleCondition | undefined;

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
    { successMessage: t("Операция выполнена"), invalidate },
  );

  const w = waybill.data;
  const status = w?.status;

  const openAction = (kind: Exclude<ActionKind, null>): void => {
    form.resetFields();
    if (kind === 'submit' || kind === 'close') {
      form.setFieldsValue({
        odometerEnd: w?.odometerEnd ? Number(w.odometerEnd) : undefined,
        engineHoursEnd: w?.engineHoursEnd ? Number(w.engineHoursEnd) : undefined,
        // По умолчанию — как выдали: изменение состояния должно быть
        // осознанным действием, а не следствием незаполненного поля.
        conditionOnReturn: (w?.conditionOnIssue as VehicleCondition) ?? VehicleCondition.SERVICEABLE,
      });
    }
    if (kind === 'issue') {
      setClearance(null);
      setTechnical(null);
      form.setFieldsValue({ conditionOnIssue: VehicleCondition.SERVICEABLE });
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
              {t(WAYBILL_STATUS_LABEL[w.status] ?? w.status)}
            </Tag>
          </Space>
        ) : (
          'Путевой лист'
        )
      }
      extra={
        w && (
          <Space>
            {/* Идентификатор перед кнопками: действия должны оставаться
                у самого края, куда тянется рука. */}
            <EntityId id={w.id} />
            {status === WaybillStatus.DRAFT && can(PERMISSIONS.WAYBILL_ISSUE) && (
              <Button type="primary" onClick={() => openAction('issue')}>
                {t("Выдать водителю")}
              </Button>
            )}
            {(status === WaybillStatus.ISSUED || status === WaybillStatus.IN_PROGRESS) &&
              can(PERMISSIONS.WAYBILL_UPDATE) && (
                <Button type="primary" onClick={() => openAction('submit')}>
                  {t("Принять от водителя")}
                </Button>
              )}
            {status === WaybillStatus.SUBMITTED && can(PERMISSIONS.WAYBILL_CLOSE) && (
              <Button type="primary" onClick={() => openAction('close')}>
                {t("Закрыть с расчётом")}
              </Button>
            )}
            {status !== WaybillStatus.CLOSED &&
              status !== WaybillStatus.CANCELLED &&
              can(PERMISSIONS.WAYBILL_CANCEL) && (
                <Button danger onClick={() => openAction('cancel')}>
                  {t("Аннулировать")}
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
              <Statistic title={t("Норма, л")} value={fmt(w.fuelNorm, 2)} />
              <Statistic title={t("Факт, л")} value={fmt(w.fuelConsumed, 2)} />
              <Statistic
                title={t("Отклонение")}
                value={deviationPct === null ? '—' : `${deviationPct > 0 ? '+' : ''}${deviationPct} %`}
                valueStyle={{ color: deviationColor(deviationPct) }}
              />
            </Space>
          )}

          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label={t("Техника")}>
              {w.vehicle?.garageNumber ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t("Водитель")}>
              {w.driver ? `${w.driver.lastName} ${w.driver.firstName}` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t("Начало")}>
              {dayjs(w.validFrom).format('DD.MM.YYYY HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label={t("Окончание")}>
              {dayjs(w.validTo).format('DD.MM.YYYY HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label={t("Одометр")}>
              {fmt(w.odometerStart)} → {fmt(w.odometerEnd)}
            </Descriptions.Item>
            <Descriptions.Item label={t("Моточасы")}>
              {fmt(w.engineHoursStart)} → {fmt(w.engineHoursEnd)}
            </Descriptions.Item>
            <Descriptions.Item label={t("Пробег за смену")}>{fmt(w.distanceKm, 1)} км</Descriptions.Item>
            <Descriptions.Item label={t("Наработка")}>{fmt(w.engineHours, 1)} мч</Descriptions.Item>
            <Descriptions.Item label={t("Топливо на начало")}>{fmt(w.fuelOpening, 2)} л</Descriptions.Item>
            <Descriptions.Item label={t("Выдано за смену")}>{fmt(w.fuelIssued, 2)} л</Descriptions.Item>
            <Descriptions.Item label={t("Остаток на конец")}>{fmt(w.fuelClosing, 2)} л</Descriptions.Item>
            <Descriptions.Item label={t("Примечание")}>{w.notes ?? '—'}</Descriptions.Item>
          </Descriptions>

          <h4 style={{ marginTop: 24 }}>Задания</h4>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={w.tasks}
            columns={[
              { title: '№', dataIndex: 'sequence', width: 50 },
              { title: t("Рейс"), dataIndex: 'flightNumber', width: 90 },
              { title: t("Борт"), dataIndex: 'aircraftReg', width: 100 },
              { title: t("Стоянка"), dataIndex: 'standNumber', width: 90 },
              { title: t("Куда"), dataIndex: 'toPoint' },
              {
                title: t("км"),
                dataIndex: 'distanceKm',
                align: 'right',
                width: 80,
                render: (v: string | null) => fmt(v, 1),
              },
              {
                title: t("мч"),
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
              { title: t("Документ"), dataIndex: 'documentNumber' },
              {
                title: t("Дата"),
                dataIndex: 'issuedAt',
                render: (d: string) => dayjs(d).format('DD.MM.YYYY HH:mm'),
              },
              { title: t("Ёмкость"), render: (_: unknown, row: { tank: { code: string } | null }) => row.tank?.code ?? '—' },
              {
                title: t("Объём, л"),
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
                {t("Сохранена на момент закрытия. Изменение норм задним числом её не затронет.")}
              </Typography.Paragraph>
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                dataSource={w.normBreakdown.lines}
                columns={[
                  { title: t("Составляющая"), dataIndex: 'key' },
                  { title: t("Ставка"), dataIndex: 'rate', align: 'right' },
                  {
                    title: t("Объём"),
                    align: 'right',
                    render: (_: unknown, row: { quantity: number; unit: string }) =>
                      `${row.quantity} ${row.unit}`,
                  },
                  { title: t("Литров"), dataIndex: 'litres', align: 'right' },
                ]}
              />
            </>
          )}

          {/* Журнал внизу, а не вкладкой: карточка путевого листа читается
              сверху вниз одним потоком, и разрывать её вкладками ради
              служебного раздела значит спрятать сам документ. */}
          <h4 style={{ marginTop: 24 }}>{t('Журнал действий')}</h4>
          <EntityAuditLog entity="Waybill" entityId={w.id} limit={30} />
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
        okText={t("Подтвердить")}
        cancelText={t("Отмена")}
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
              {/* Медицинский допуск не вводится, а показывается: его источник —
                  заключение врача из здравпункта. Галочки «медосмотр пройден»
                  здесь больше нет, потому что подтверждать собственную
                  проверку заинтересованной стороне нельзя. */}
              <MedicalClearanceCard driverId={w?.driverId} onState={setClearance} />
              {/* Заключение механика — так же показывается, а не вводится:
                  исправность техники подтверждает механик, а не диспетчер. */}
              <TechnicalClearanceCard vehicleId={w?.vehicleId} onState={setTechnical} />

              <Typography.Paragraph type="secondary">
                {t('Система проверит удостоверение, допуск на перрон, медицинское заключение и заключение механика.')}
              </Typography.Paragraph>

              {technical && !technical.allowed && technical.overridable && (
                <Form.Item
                  name="technicalOverrideReason"
                  label={t('Причина выпуска без заключения механика')}
                  tooltip={t(
                    'Доступно только с правом waybill.override_technical. Причина сохраняется в путевом листе и в журнале действий.',
                  )}
                  rules={[{ required: true, message: t('Укажите причину') }]}
                >
                  <Input.TextArea rows={2} placeholder={t('Например: механик на выезде, осмотр внесён с бумаги')} />
                </Form.Item>
              )}

              {technical?.state === 'FAILED' && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message={t('Выпуск невозможен')}
                  description={t(
                    'Механик не выпустил технику на линию. Это решение не обходится никакими правами — нужна замена машины.',
                  )}
                />
              )}

              {/* Состояние на выдаче — точка отсчёта. Без него при возврате
                  не с чем сравнивать, и любая поломка выглядит как «было
                  и до меня». */}
              <Form.Item
                name="conditionOnIssue"
                label={t('Состояние техники при выдаче')}
                rules={[{ required: true, message: t('Обязательное поле') }]}
              >
                <Select
                  options={CONDITION_OPTIONS.map((option) => ({
                    value: option.value,
                    label: t(option.labelKey),
                  }))}
                />
              </Form.Item>
              <Form.Item name="conditionIssueNotes" label={t('Замечания при выдаче')}>
                <Input.TextArea rows={2} maxLength={600} />
              </Form.Item>

              {/* Обход медосмотра — отдельное поле и отдельное право.
                  Общая галочка «вопреки замечаниям» его не снимает. */}
              {clearance && !clearance.allowed && clearance.overridable && (
                <Form.Item
                  name="medicalOverrideReason"
                  label={t('Причина выдачи без медосмотра')}
                  tooltip={t(
                    'Доступно только с правом waybill.override_medical. Причина сохраняется в путевом листе и в журнале действий.',
                  )}
                  rules={[{ required: true, message: t('Укажите причину') }]}
                >
                  <Input.TextArea rows={2} placeholder={t('Например: здравпункт закрыт, осмотр внесён с бумаги')} />
                </Form.Item>
              )}

              {clearance && clearance.state === 'FAILED' && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message={t('Выдача невозможна')}
                  description={t(
                    'Врач не допустил водителя к работе. Это решение не обходится никакими правами — нужна замена водителя.',
                  )}
                />
              )}

              <Form.Item name="overrideEligibility" valuePropName="checked">
                <Checkbox>
                  {t('Выдать вопреки замечаниям по документам (действие попадёт в журнал аудита)')}
                </Checkbox>
              </Form.Item>
            </>
          )}

          {action === 'submit' && (
            <>
              <Form.Item name="odometerEnd" label={t("Одометр на возврат, км")}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="engineHoursEnd" label={t("Моточасы на возврат")}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}

          {action === 'close' && (
            <>
              <Form.Item name="odometerEnd" label={t("Одометр на возврат, км")}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="engineHoursEnd" label={t("Моточасы на возврат")}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="fuelClosing"
                label={t("Замеренный остаток в баке, л")}
                tooltip={t("Если не указать, фактический расход будет принят равным нормативному — и перерасход не проявится")}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                name="conditionOnReturn"
                label={t('Состояние техники при возврате')}
                tooltip={
                  w?.conditionOnIssue
                    ? `${t('При выдаче было')}: ${t(CONDITION_LABEL[w.conditionOnIssue as VehicleCondition] ?? w.conditionOnIssue)}`
                    : undefined
                }
                rules={[{ required: true, message: t('Обязательное поле') }]}
              >
                <Select
                  options={CONDITION_OPTIONS.map((option) => ({
                    value: option.value,
                    label: t(option.labelKey),
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="conditionReturnNotes"
                label={t('Описание повреждений')}
                tooltip={t('Текст попадёт в акт — пишите так, как объясните это через месяц')}
              >
                <Input.TextArea rows={3} maxLength={600} />
              </Form.Item>

              {/* Предупреждение до нажатия, а не сюрприз после: акт —
                  документ, на который ссылаются при удержании. */}
              {returnCondition &&
                needsConditionAct(
                  (w?.conditionOnIssue as VehicleCondition | null) ?? null,
                  returnCondition,
                ) && (
                  <Alert
                    type="warning"
                    showIcon
                    message={t('Будет составлен акт о состоянии техники')}
                    description={
                      w?.driver
                        ? `${t('В акте будет указан водитель, принявший технику')}: ${w.driver.lastName} ${w.driver.firstName}`
                        : undefined
                    }
                  />
                )}
            </>
          )}

          {action === 'cancel' && (
            <Form.Item name="reason" label={t("Причина")} rules={[{ required: true }]}>
              <Input.TextArea rows={3} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Drawer>
  );
}
