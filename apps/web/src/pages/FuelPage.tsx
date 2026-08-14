import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { FuelSource, PERMISSIONS } from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation, useDictionaries, usePaged } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { FUEL_SOURCE_LABEL, fmt } from '@/lib/labels';

interface Tank {
  id: number;
  code: string;
  name: string;
  capacity: string;
  currentVolume: string;
  minVolume: string;
  fuelType: { id: number; code: string; name: string };
}

interface IssueRow {
  id: number;
  documentNumber: string;
  issuedAt: string;
  volume: string;
  totalAmount: string | null;
  source: string;
  vehicle: { garageNumber: string; plateNumber: string | null } | null;
  driver: { lastName: string; firstName: string } | null;
  tank: { code: string } | null;
  waybill: { number: string } | null;
}

interface ReceiptRow {
  id: number;
  documentNumber: string;
  externalNumber: string | null;
  receivedAt: string;
  volume: string;
  pricePerLitre: string | null;
  totalAmount: string | null;
  tank: { code: string; name: string } | null;
  supplier: { name: string } | null;
}

interface InventoryRow {
  id: number;
  documentNumber: string;
  countedAt: string;
  bookVolume: string;
  actualVolume: string;
  difference: string;
  tank: { code: string } | null;
}

type ModalKind = 'issue' | 'receipt' | 'inventory' | null;

export function FuelPage() {
  const { can } = useAuth();
  const dictionaries = useDictionaries();
  const [modal, setModal] = useState<ModalKind>(null);
  const [form] = Form.useForm();
  const [issuePage, setIssuePage] = useState(1);
  const [receiptPage, setReceiptPage] = useState(1);

  const tanks = useQuery({
    queryKey: ['fuel-tanks'],
    queryFn: async () => (await api.get<Tank[]>('/fuel/tanks')).data,
  });

  const issues = usePaged<IssueRow>(['fuel-issues'], '/fuel/issues', {
    page: issuePage,
    pageSize: 20,
  });
  const receipts = usePaged<ReceiptRow>(['fuel-receipts'], '/fuel/receipts', {
    page: receiptPage,
    pageSize: 20,
  });
  const inventories = usePaged<InventoryRow>(['fuel-inventories'], '/fuel/inventories', {
    page: 1,
    pageSize: 20,
  });

  // Техника нужна для выпадающего списка выдачи. Берём первую сотню:
  // диспетчер ищет по гаражному номеру, а не листает.
  const vehicles = useQuery({
    queryKey: ['vehicles-lookup'],
    queryFn: async () =>
      (await api.get('/vehicles', { params: { pageSize: 200, status: 'ACTIVE' } })).data as {
        items: Array<{ id: number; garageNumber: string; plateNumber: string | null }>;
      },
  });

  const drivers = useQuery({
    queryKey: ['drivers-lookup'],
    queryFn: async () =>
      (await api.get('/drivers', { params: { pageSize: 200, isActive: true } })).data as {
        items: Array<{ id: number; lastName: string; firstName: string; personnelNumber: string }>;
      },
  });

  const invalidate = [
    ['fuel-tanks'],
    ['fuel-issues'],
    ['fuel-receipts'],
    ['fuel-inventories'],
    ['office-summary'],
    ['vehicles'],
  ];

  const createIssue = useApiMutation(
    async (values: Record<string, unknown>) =>
      (
        await api.post('/fuel/issues', {
          ...values,
          issuedAt: (values.issuedAt as dayjs.Dayjs).toISOString(),
        })
      ).data,
    { successMessage: 'Топливо выдано', invalidate },
  );

  const createReceipt = useApiMutation(
    async (values: Record<string, unknown>) =>
      (
        await api.post('/fuel/receipts', {
          ...values,
          receivedAt: (values.receivedAt as dayjs.Dayjs).toISOString(),
        })
      ).data,
    { successMessage: 'Топливо оприходовано', invalidate },
  );

  const createInventory = useApiMutation(
    async (values: Record<string, unknown>) =>
      (
        await api.post('/fuel/inventories', {
          ...values,
          countedAt: (values.countedAt as dayjs.Dayjs).toISOString(),
        })
      ).data,
    { successMessage: 'Акт инвентаризации создан', invalidate },
  );

  const submit = (): void => {
    void form.validateFields().then((values) => {
      const done = { onSuccess: () => setModal(null) };
      if (modal === 'issue') createIssue.mutate(values, done);
      if (modal === 'receipt') createReceipt.mutate(values, done);
      if (modal === 'inventory') createInventory.mutate(values, done);
    });
  };

  const openModal = (kind: ModalKind): void => {
    form.resetFields();
    form.setFieldsValue({
      issuedAt: dayjs(),
      receivedAt: dayjs(),
      countedAt: dayjs(),
      source: FuelSource.TANK,
    });
    setModal(kind);
  };

  if (!can(PERMISSIONS.FUEL_READ)) {
    return <Typography.Text type="danger">Нет прав на просмотр ГСМ</Typography.Text>;
  }

  return (
    <Card
      title="Горюче-смазочные материалы"
      extra={
        <Space wrap>
          {can(PERMISSIONS.FUEL_RECEIPT_MANAGE) && (
            <Button icon={<PlusOutlined />} onClick={() => openModal('receipt')}>
              Приход
            </Button>
          )}
          {can(PERMISSIONS.FUEL_INVENTORY_MANAGE) && (
            <Button onClick={() => openModal('inventory')}>Инвентаризация</Button>
          )}
          {can(PERMISSIONS.FUEL_ISSUE_CREATE) && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal('issue')}>
              Выдать топливо
            </Button>
          )}
        </Space>
      }
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {tanks.data?.map((tank) => {
          const percent = Math.round((Number(tank.currentVolume) / Number(tank.capacity)) * 100);
          const belowMin = Number(tank.currentVolume) < Number(tank.minVolume);
          return (
            <Col key={tank.id} xs={24} sm={12} lg={8}>
              <Card size="small">
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  <Space>
                    <Typography.Text strong>{tank.code}</Typography.Text>
                    <Tag>{tank.fuelType.code}</Tag>
                    {belowMin && <Tag color="red">ниже минимума</Tag>}
                  </Space>
                  <Typography.Text type="secondary">{tank.name}</Typography.Text>
                  <Progress
                    percent={percent}
                    status={belowMin ? 'exception' : 'normal'}
                    format={() => `${fmt(tank.currentVolume)} / ${fmt(tank.capacity)} л`}
                  />
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Tabs
        items={[
          {
            key: 'issues',
            label: 'Выдача',
            children: (
              <Table<IssueRow>
                rowKey="id"
                size="small"
                loading={issues.isLoading}
                dataSource={issues.data?.items ?? []}
                pagination={{
                  current: issuePage,
                  pageSize: 20,
                  total: issues.data?.meta.total ?? 0,
                  onChange: setIssuePage,
                  showTotal: (total) => `Всего: ${total}`,
                }}
                columns={[
                  { title: 'Документ', dataIndex: 'documentNumber', width: 200 },
                  {
                    title: 'Дата',
                    dataIndex: 'issuedAt',
                    width: 150,
                    render: (d: string) => dayjs(d).format('DD.MM.YYYY HH:mm'),
                  },
                  {
                    title: 'Техника',
                    render: (_: unknown, row: IssueRow) => row.vehicle?.garageNumber ?? '—',
                  },
                  {
                    title: 'Водитель',
                    render: (_: unknown, row: IssueRow) =>
                      row.driver ? `${row.driver.lastName} ${row.driver.firstName}` : '—',
                  },
                  {
                    title: 'Источник',
                    dataIndex: 'source',
                    width: 140,
                    render: (s: string, row: IssueRow) =>
                      row.tank ? `${FUEL_SOURCE_LABEL[s]} ${row.tank.code}` : FUEL_SOURCE_LABEL[s] ?? s,
                  },
                  {
                    title: 'Объём, л',
                    dataIndex: 'volume',
                    width: 100,
                    align: 'right',
                    render: (v: string) => fmt(v, 2),
                  },
                  {
                    title: 'Сумма',
                    dataIndex: 'totalAmount',
                    width: 130,
                    align: 'right',
                    render: (v: string | null) => fmt(v),
                  },
                  {
                    title: 'Путевой лист',
                    render: (_: unknown, row: IssueRow) => row.waybill?.number ?? '—',
                  },
                ]}
              />
            ),
          },
          {
            key: 'receipts',
            label: 'Приход',
            children: (
              <Table<ReceiptRow>
                rowKey="id"
                size="small"
                loading={receipts.isLoading}
                dataSource={receipts.data?.items ?? []}
                pagination={{
                  current: receiptPage,
                  pageSize: 20,
                  total: receipts.data?.meta.total ?? 0,
                  onChange: setReceiptPage,
                  showTotal: (total) => `Всего: ${total}`,
                }}
                columns={[
                  { title: 'Документ', dataIndex: 'documentNumber', width: 210 },
                  { title: 'Накладная', dataIndex: 'externalNumber', width: 140 },
                  {
                    title: 'Дата',
                    dataIndex: 'receivedAt',
                    width: 120,
                    render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
                  },
                  {
                    title: 'Ёмкость',
                    render: (_: unknown, row: ReceiptRow) => row.tank?.code ?? '—',
                  },
                  {
                    title: 'Поставщик',
                    render: (_: unknown, row: ReceiptRow) => row.supplier?.name ?? '—',
                  },
                  {
                    title: 'Объём, л',
                    dataIndex: 'volume',
                    align: 'right',
                    width: 110,
                    render: (v: string) => fmt(v, 2),
                  },
                  {
                    title: 'Сумма',
                    dataIndex: 'totalAmount',
                    align: 'right',
                    width: 140,
                    render: (v: string | null) => fmt(v),
                  },
                ]}
              />
            ),
          },
          {
            key: 'inventories',
            label: 'Инвентаризация',
            children: (
              <Table<InventoryRow>
                rowKey="id"
                size="small"
                loading={inventories.isLoading}
                dataSource={inventories.data?.items ?? []}
                pagination={false}
                columns={[
                  { title: 'Акт', dataIndex: 'documentNumber', width: 210 },
                  {
                    title: 'Дата',
                    dataIndex: 'countedAt',
                    width: 120,
                    render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
                  },
                  { title: 'Ёмкость', render: (_: unknown, row: InventoryRow) => row.tank?.code ?? '—' },
                  {
                    title: 'По учёту, л',
                    dataIndex: 'bookVolume',
                    align: 'right',
                    render: (v: string) => fmt(v, 2),
                  },
                  {
                    title: 'Фактически, л',
                    dataIndex: 'actualVolume',
                    align: 'right',
                    render: (v: string) => fmt(v, 2),
                  },
                  {
                    title: 'Разница, л',
                    dataIndex: 'difference',
                    align: 'right',
                    render: (v: string) => {
                      const diff = Number(v);
                      // Недостача важнее излишка: её и подсвечиваем.
                      return (
                        <Typography.Text style={{ color: diff < 0 ? '#cf1322' : '#389e0d' }}>
                          {diff > 0 ? '+' : ''}
                          {fmt(v, 2)}
                        </Typography.Text>
                      );
                    },
                  },
                ]}
              />
            ),
          },
        ]}
      />

      <Modal
        open={modal !== null}
        width={640}
        title={
          modal === 'issue'
            ? 'Выдача топлива'
            : modal === 'receipt'
              ? 'Приход топлива'
              : 'Акт инвентаризации'
        }
        okText="Провести"
        cancelText="Отмена"
        confirmLoading={createIssue.isPending || createReceipt.isPending || createInventory.isPending}
        onCancel={() => setModal(null)}
        onOk={submit}
      >
        <Form form={form} layout="vertical">
          {modal === 'issue' && (
            <>
              <Form.Item name="vehicleId" label="Техника" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={vehicles.data?.items.map((v) => ({
                    value: v.id,
                    label: `${v.garageNumber}${v.plateNumber ? ` · ${v.plateNumber}` : ''}`,
                  }))}
                />
              </Form.Item>
              <Form.Item name="driverId" label="Водитель">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={drivers.data?.items.map((d) => ({
                    value: d.id,
                    label: `${d.lastName} ${d.firstName} (${d.personnelNumber})`,
                  }))}
                />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="source" label="Источник" rules={[{ required: true }]}>
                    <Select
                      options={Object.values(FuelSource).map((s) => ({
                        value: s,
                        label: FUEL_SOURCE_LABEL[s] ?? s,
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    noStyle
                    shouldUpdate={(prev, next) => prev.source !== next.source}
                  >
                    {({ getFieldValue }) =>
                      getFieldValue('source') === FuelSource.TANK ? (
                        <Form.Item name="tankId" label="Ёмкость" rules={[{ required: true }]}>
                          <Select
                            options={tanks.data?.map((t) => ({
                              value: t.id,
                              label: `${t.code} · ${t.fuelType.code} · остаток ${fmt(t.currentVolume)} л`,
                            }))}
                          />
                        </Form.Item>
                      ) : null
                    }
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="issuedAt" label="Дата и время" rules={[{ required: true }]}>
                    <DatePicker showTime format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="volume" label="Объём, л" rules={[{ required: true }]}>
                    <InputNumber min={0.01} step={1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="pricePerLitre" label="Цена за литр">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="odometerAtIssue"
                    label="Одометр при заправке"
                    tooltip="Нужен для сверки с путевым листом"
                  >
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="engineHoursAtIssue" label="Моточасы при заправке">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          {modal === 'receipt' && (
            <>
              <Form.Item name="tankId" label="Ёмкость" rules={[{ required: true }]}>
                <Select
                  options={tanks.data?.map((t) => ({
                    value: t.id,
                    label: `${t.code} · ${t.fuelType.code} · свободно ${fmt(
                      Number(t.capacity) - Number(t.currentVolume),
                    )} л`,
                  }))}
                />
              </Form.Item>
              <Form.Item name="supplierId" label="Поставщик">
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
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="externalNumber" label="Номер накладной">
                    <Input placeholder="ТТН-123456" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="receivedAt" label="Дата приёмки" rules={[{ required: true }]}>
                    <DatePicker showTime format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="volume" label="Объём, л" rules={[{ required: true }]}>
                    <InputNumber min={0.01} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="density" label="Плотность, кг/л">
                    <InputNumber min={0.5} max={1.2} step={0.001} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="pricePerLitre" label="Цена за литр">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="notes" label="Примечание">
                <Input.TextArea rows={2} />
              </Form.Item>
            </>
          )}

          {modal === 'inventory' && (
            <>
              <Typography.Paragraph type="secondary">
                Расхождение свыше 0,5 % от объёма ёмкости автоматически поднимет алерт.
              </Typography.Paragraph>
              <Form.Item name="tankId" label="Ёмкость" rules={[{ required: true }]}>
                <Select
                  options={tanks.data?.map((t) => ({
                    value: t.id,
                    label: `${t.code} · по учёту ${fmt(t.currentVolume)} л`,
                  }))}
                />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="countedAt" label="Дата замера" rules={[{ required: true }]}>
                    <DatePicker showTime format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="actualVolume"
                    label="Фактический остаток, л"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="commission" label="Состав комиссии">
                <Input.TextArea rows={2} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </Card>
  );
}
