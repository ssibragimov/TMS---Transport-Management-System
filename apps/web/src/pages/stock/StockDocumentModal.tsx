import { DeleteOutlined, PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Checkbox,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  STOCK_DOCUMENT_LABEL,
  STOCK_PURPOSE_LABEL,
  StockDocumentKind,
  StockIssuePurpose,
} from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation, useDictionaries } from '@/api/hooks';
import { fmt } from '@/lib/labels';

import type { StockItem, StockWarehouse } from './types';

/**
 * Форма складского документа — одна на пять операций.
 *
 * Приход, выдача, возврат, списание и перемещение отличаются шапкой и знаком
 * движения, но строки у них одинаковые: позиция, количество, цена. Пять
 * отдельных форм означали бы пять мест, где чинить одну и ту же ошибку
 * в подборе номенклатуры.
 */

interface Props {
  kind: StockDocumentKind | null;
  warehouses: StockWarehouse[];
  items: StockItem[];
  onClose: () => void;
}

interface BalanceRow {
  quantity: string;
  part: { id: number };
}

/** Операции, уменьшающие остаток: для них показываем и проверяем наличие. */
const OUTGOING: StockDocumentKind[] = [
  StockDocumentKind.ISSUE,
  StockDocumentKind.WRITE_OFF,
  StockDocumentKind.TRANSFER,
];

const ENDPOINT: Record<StockDocumentKind, string> = {
  RECEIPT: '/stock/receipts',
  ISSUE: '/stock/issues',
  RETURN: '/stock/returns',
  WRITE_OFF: '/stock/write-offs',
  TRANSFER: '/stock/transfers',
};

export function StockDocumentModal({ kind, warehouses, items, onClose }: Props) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const dictionaries = useDictionaries();
  const [recipientKind, setRecipientKind] = useState<'driver' | 'user'>('driver');

  const isOutgoing = kind !== null && OUTGOING.includes(kind);
  const warehouseId = Form.useWatch<number | undefined>('warehouseId', form);
  const lines = Form.useWatch<Array<{ partId?: number; quantity?: number; returnsOld?: boolean }>>(
    'lines',
    form,
  );

  // Остатки выбранного склада: без них кладовщик выбирает позицию вслепую
  // и узнаёт о нехватке только после нажатия «Провести».
  const balances = useQuery({
    queryKey: ['stock-balances-lookup', warehouseId],
    enabled: Boolean(warehouseId),
    queryFn: async () =>
      (
        await api.get<{ items: BalanceRow[] }>('/stock/balances', {
          params: { warehouseId, pageSize: 200, inStockOnly: true },
        })
      ).data,
  });

  const onHand = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of balances.data?.items ?? []) map.set(row.part.id, Number(row.quantity));
    return map;
  }, [balances.data]);

  const vehicles = useQuery({
    queryKey: ['vehicles-lookup'],
    queryFn: async () =>
      (await api.get('/vehicles', { params: { pageSize: 200, status: 'ACTIVE' } })).data as {
        items: Array<{ id: number; garageNumber: string; plateNumber: string | null }>;
      },
  });

  const drivers = useQuery({
    queryKey: ['drivers-lookup'],
    enabled: kind === StockDocumentKind.ISSUE || kind === StockDocumentKind.RETURN,
    queryFn: async () =>
      (await api.get('/drivers', { params: { pageSize: 300, isActive: true } })).data as {
        items: Array<{ id: number; lastName: string; firstName: string; personnelNumber: string }>;
      },
  });

  const users = useQuery({
    queryKey: ['users-lookup'],
    enabled: kind === StockDocumentKind.ISSUE || kind === StockDocumentKind.RETURN,
    queryFn: async () =>
      (await api.get('/users', { params: { pageSize: 200 } })).data as {
        items: Array<{ id: number; fullName: string }>;
      },
  });

  /*
   * Сброс формы при открытии — эффектом, а не по завершении анимации:
   * поля читаются наблюдателями Form.useWatch сразу после монтирования,
   * и значения от прошлого документа успели бы попасть в подсказки остатков.
   */
  useEffect(() => {
    if (!kind) return;
    form.resetFields();
    form.setFieldsValue({
      documentDate: dayjs(),
      purpose: StockIssuePurpose.REPLACEMENT,
      lines: [{}],
    });
    setRecipientKind('driver');
  }, [kind, form]);

  // Склад по умолчанию проставляется отдельно: справочник складов может
  // прийти позже открытия формы, и общий сброс затёр бы уже введённое.
  useEffect(() => {
    if (!kind || warehouses.length === 0) return;
    if (form.getFieldValue('warehouseId')) return;
    form.setFieldValue(
      'warehouseId',
      warehouses.find((w) => w.kind === 'MAIN')?.id ?? warehouses[0].id,
    );
  }, [kind, warehouses, form]);

  const save = useApiMutation(
    async (values: Record<string, unknown>) =>
      (await api.post(ENDPOINT[kind as StockDocumentKind], values)).data,
    {
      successMessage: t('Документ проведён'),
      invalidate: [
        ['stock-summary'],
        ['stock-warehouses'],
        ['stock-balances'],
        ['stock-balances-lookup'],
        ['stock-movements'],
        ['stock-documents'],
        ['stock-items'],
      ],
    },
  );

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  /*
   * Позиции с обменом «старое на новое», по которым отработанное не сдаётся.
   * Сервер в этом случае требует причину — предупреждаем до отправки, чтобы
   * кладовщик не заполнял форму дважды.
   */
  const exchangeWithoutOld = (lines ?? []).filter(
    (line) => line?.partId && itemById.get(line.partId)?.exchangeRequired && !line.returnsOld,
  );

  const submit = (): void => {
    void form.validateFields().then((values: Record<string, unknown>) => {
      const payload: Record<string, unknown> = {
        ...values,
        documentDate: (values.documentDate as dayjs.Dayjs).toISOString(),
      };

      // Получатель: в форме переключатель, в запросе — два разных поля.
      if (recipientKind === 'driver') delete payload.recipientUserId;
      else delete payload.recipientDriverId;

      save.mutate(payload, { onSuccess: onClose });
    });
  };

  if (!kind) return null;

  const title = t(STOCK_DOCUMENT_LABEL[kind]);
  const warehouseLabel =
    kind === StockDocumentKind.TRANSFER ? t('Склад-отправитель') : t('Склад');

  return (
    <Modal
      open
      width={880}
      title={`${title} ${t('ТМЦ')}`}
      okText={t('Провести')}
      cancelText={t('Отмена')}
      confirmLoading={save.isPending}
      onCancel={onClose}
      onOk={submit}
    >
      <Form form={form} layout="vertical" size="small">
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="warehouseId" label={warehouseLabel} rules={[{ required: true }]}>
              <Select
                options={warehouses.map((w) => ({
                  value: w.id,
                  label: `${w.code} — ${w.name}`,
                }))}
              />
            </Form.Item>
          </Col>

          {kind === StockDocumentKind.TRANSFER && (
            <Col span={8}>
              <Form.Item
                name="targetWarehouseId"
                label={t('Склад-получатель')}
                rules={[
                  { required: true },
                  {
                    validator: (_, value: number) =>
                      value && value === form.getFieldValue('warehouseId')
                        ? Promise.reject(new Error(t('Склады совпадают')))
                        : Promise.resolve(),
                  },
                ]}
              >
                <Select
                  options={warehouses.map((w) => ({
                    value: w.id,
                    label: `${w.code} — ${w.name}`,
                  }))}
                />
              </Form.Item>
            </Col>
          )}

          <Col span={8}>
            <Form.Item name="documentDate" label={t('Дата и время')} rules={[{ required: true }]}>
              <DatePicker showTime format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </Col>

          {kind === StockDocumentKind.RECEIPT && (
            <>
              <Col span={8}>
                <Form.Item name="supplierId" label={t('Поставщик')}>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={dictionaries.data?.counterparties.map((c) => ({
                      value: c.id,
                      label: c.name,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="externalNumber" label={t('Накладная поставщика')}>
                  <Input placeholder={t('ТТН-000123')} />
                </Form.Item>
              </Col>
            </>
          )}

          {kind === StockDocumentKind.ISSUE && (
            <Col span={8}>
              <Form.Item name="purpose" label={t('Основание')} rules={[{ required: true }]}>
                <Select
                  options={Object.entries(STOCK_PURPOSE_LABEL).map(([value, label]) => ({
                    value,
                    label: t(label),
                  }))}
                />
              </Form.Item>
            </Col>
          )}

          {(kind === StockDocumentKind.ISSUE ||
            kind === StockDocumentKind.RETURN ||
            kind === StockDocumentKind.WRITE_OFF) && (
            <Col span={8}>
              <Form.Item
                name="vehicleId"
                label={t('Техника')}
                tooltip={t(
                  'На какую машину идут ценности. Без этого поля не собрать стоимость её содержания.',
                )}
              >
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={vehicles.data?.items.map((v) => ({
                    value: v.id,
                    label: `${v.garageNumber}${v.plateNumber ? ` · ${v.plateNumber}` : ''}`,
                  }))}
                />
              </Form.Item>
            </Col>
          )}
        </Row>

        {(kind === StockDocumentKind.ISSUE || kind === StockDocumentKind.RETURN) && (
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item
                label={kind === StockDocumentKind.ISSUE ? t('Кому выдаём') : t('Кто возвращает')}
              >
                <Radio.Group
                  value={recipientKind}
                  onChange={(e) => setRecipientKind(e.target.value as 'driver' | 'user')}
                  optionType="button"
                  buttonStyle="solid"
                  options={[
                    { label: t('Водитель'), value: 'driver' },
                    { label: t('Сотрудник'), value: 'user' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={16}>
              {recipientKind === 'driver' ? (
                <Form.Item
                  name="recipientDriverId"
                  label={t('Получатель')}
                  rules={[{ required: kind === StockDocumentKind.ISSUE }]}
                >
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={drivers.data?.items.map((d) => ({
                      value: d.id,
                      label: `${d.lastName} ${d.firstName} (${t('таб.')} ${d.personnelNumber})`,
                    }))}
                  />
                </Form.Item>
              ) : (
                <Form.Item
                  name="recipientUserId"
                  label={t('Получатель')}
                  rules={[{ required: kind === StockDocumentKind.ISSUE }]}
                >
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={users.data?.items.map((u) => ({ value: u.id, label: u.fullName }))}
                  />
                </Form.Item>
              )}
            </Col>
          </Row>
        )}

        <Divider style={{ margin: '4px 0 12px' }} orientation="left" plain>
          {t('Строки документа')}
        </Divider>

        <Form.List name="lines">
          {(fields, { add, remove }) => (
            <>
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                dataSource={fields}
                columns={[
                  {
                    title: t('Позиция'),
                    render: (_: unknown, field) => (
                      <Form.Item
                        name={[field.name, 'partId']}
                        rules={[{ required: true, message: t('Выберите позицию') }]}
                        style={{ margin: 0 }}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder={t('Наименование или код')}
                          options={items.map((i) => ({
                            value: i.id,
                            label: `${i.name} · ${i.code}${
                              isOutgoing
                                ? ` · ${t('остаток')} ${fmt(onHand.get(i.id) ?? 0, 2)} ${t(i.unit)}`
                                : ''
                            }`,
                          }))}
                        />
                      </Form.Item>
                    ),
                  },
                  {
                    title: t('Кол-во'),
                    width: 150,
                    render: (_: unknown, field) => (
                      <Form.Item
                        noStyle
                        shouldUpdate={(prev, next) =>
                          prev.lines?.[field.name]?.partId !== next.lines?.[field.name]?.partId
                        }
                      >
                        {({ getFieldValue }) => {
                          const partId = getFieldValue(['lines', field.name, 'partId']) as
                            | number
                            | undefined;
                          const item = partId ? itemById.get(partId) : undefined;
                          const available = partId ? (onHand.get(partId) ?? 0) : 0;

                          return (
                            <Form.Item
                              name={[field.name, 'quantity']}
                              style={{ margin: 0 }}
                              rules={[
                                { required: true, message: t('Укажите количество') },
                                {
                                  validator: (_, value: number) =>
                                    isOutgoing && value > available
                                      ? Promise.reject(
                                          new Error(`${t('На складе')} ${fmt(available, 2)}`),
                                        )
                                      : Promise.resolve(),
                                },
                              ]}
                            >
                              <InputNumber
                                min={0.001}
                                step={1}
                                style={{ width: '100%' }}
                                addonAfter={item?.unit ? t(item.unit) : ''}
                              />
                            </Form.Item>
                          );
                        }}
                      </Form.Item>
                    ),
                  },
                  {
                    title: t('Цена'),
                    width: 140,
                    render: (_: unknown, field) => (
                      <Form.Item name={[field.name, 'unitPrice']} style={{ margin: 0 }}>
                        <InputNumber min={0} style={{ width: '100%' }} placeholder={t('сум')} />
                      </Form.Item>
                    ),
                  },
                  {
                    title: t('Обмен'),
                    width: 110,
                    render: (_: unknown, field) => (
                      <Form.Item
                        noStyle
                        shouldUpdate={(prev, next) =>
                          prev.lines?.[field.name]?.partId !== next.lines?.[field.name]?.partId
                        }
                      >
                        {({ getFieldValue }) => {
                          const partId = getFieldValue(['lines', field.name, 'partId']) as
                            | number
                            | undefined;
                          const item = partId ? itemById.get(partId) : undefined;
                          if (kind !== StockDocumentKind.ISSUE || !item) return null;

                          return (
                            <Form.Item
                              name={[field.name, 'returnsOld']}
                              valuePropName="checked"
                              style={{ margin: 0 }}
                            >
                              <Checkbox>
                                <Typography.Text
                                  type={item.exchangeRequired ? undefined : 'secondary'}
                                  style={{ fontSize: 12 }}
                                >
                                  {t('старое сдано')}
                                </Typography.Text>
                              </Checkbox>
                            </Form.Item>
                          );
                        }}
                      </Form.Item>
                    ),
                  },
                  {
                    title: '',
                    width: 40,
                    render: (_: unknown, field) =>
                      fields.length > 1 && (
                        <DeleteOutlined
                          style={{ color: '#cf1322', cursor: 'pointer' }}
                          onClick={() => remove(field.name)}
                        />
                      ),
                  },
                ]}
                footer={() => (
                  <Typography.Link onClick={() => add({})}>
                    <PlusOutlined /> {t('Добавить строку')}
                  </Typography.Link>
                )}
              />
            </>
          )}
        </Form.List>

        {kind === StockDocumentKind.ISSUE && exchangeWithoutOld.length > 0 && (
          <Alert
            style={{ marginTop: 12 }}
            type="warning"
            showIcon
            icon={<SwapOutlined />}
            message={t('Выдача без обмена')}
            description={
              <>
                {exchangeWithoutOld.map((line) => (
                  <Tag key={line.partId} color="orange">
                    {itemById.get(line.partId as number)?.name}
                  </Tag>
                ))}
                <div style={{ marginTop: 6 }}>
                  {t(
                    'Эти позиции выдаются в обмен на сданное отработанное. Отметьте «старое сдано» либо укажите причину — она останется в документе.',
                  )}
                </div>
              </>
            }
          />
        )}

        <Row gutter={12} style={{ marginTop: 12 }}>
          {kind === StockDocumentKind.WRITE_OFF && (
            <Col span={24}>
              <Form.Item
                name="reason"
                label={t('Основание списания')}
                rules={[{ required: true, min: 5, message: t('Опишите основание') }]}
              >
                <Input.TextArea
                  rows={2}
                  maxLength={400}
                  placeholder={t('Акт комиссии №… , порча при хранении, истёк срок годности')}
                />
              </Form.Item>
            </Col>
          )}

          {kind === StockDocumentKind.ISSUE && (
            <Col span={24}>
              <Form.Item
                name="reason"
                label={t('Причина выдачи без обмена')}
                rules={[
                  {
                    required: exchangeWithoutOld.length > 0,
                    message: t('Позиция выдаётся в обмен — укажите причину'),
                  },
                ]}
              >
                <Input placeholder={t('Первая установка на новую технику, утрата по акту')} />
              </Form.Item>
            </Col>
          )}

          <Col span={24}>
            <Form.Item name="notes" label={t('Примечание')}>
              <Input.TextArea rows={2} maxLength={400} />
            </Form.Item>
          </Col>
        </Row>

        <Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t(
              'Документ проводится целиком: либо все строки, либо ни одной. Номер присваивается при проведении и не меняется.',
            )}
          </Typography.Text>
        </Space>
      </Form>
    </Modal>
  );
}
