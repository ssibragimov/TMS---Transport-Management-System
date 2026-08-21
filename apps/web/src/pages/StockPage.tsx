import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PERMISSIONS,
  STOCK_CATEGORY_LABEL,
  STOCK_DOCUMENT_LABEL,
  STOCK_MOVEMENT_LABEL,
  STOCK_PURPOSE_LABEL,
  STOCK_TRACKING_LABEL,
  StockCategory,
  StockDocumentKind,
  WAREHOUSE_KIND_LABEL,
} from '@gsm/shared';

import { api } from '@/api/client';
import { usePaged } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { StickyTable } from '@/components/StickyTable';
import { TableCard } from '@/components/TableCard';
import { fmt } from '@/lib/labels';
import { StockDocumentModal } from '@/pages/stock/StockDocumentModal';
import { StockItemModal } from '@/pages/stock/StockItemModal';
import type {
  StockBalanceRow,
  StockDocumentRow,
  StockItem,
  StockMovementRow,
  StockSummary,
  StockWarehouse,
} from '@/pages/stock/types';

/**
 * Склад товарно-материальных ценностей.
 *
 * Рабочее место кладовщика: остатки по складам, журнал движений и документы.
 * Порядок вкладок повторяет порядок вопросов, которые ему задают за смену —
 * «что есть в наличии», «куда ушло», «покажи документ».
 */

const KIND_COLOR: Record<string, string> = {
  RECEIPT: 'green',
  ISSUE: 'blue',
  RETURN: 'cyan',
  WRITE_OFF: 'red',
  TRANSFER: 'purple',
};

const WAREHOUSE_COLOR: Record<string, string> = {
  MAIN: 'blue',
  SUB: 'default',
  UTILIZATION: 'orange',
};

export function StockPage() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [category, setCategory] = useState<StockCategory | undefined>();
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'inStock' | 'belowMin'>('inStock');
  const [documentKind, setDocumentKind] = useState<StockDocumentKind | null>(null);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [movementPage, setMovementPage] = useState(1);
  const [documentPage, setDocumentPage] = useState(1);

  const canIssue = can(PERMISSIONS.STOCK_ISSUE);
  const canReceipt = can(PERMISSIONS.STOCK_RECEIPT);
  const canWriteOff = can(PERMISSIONS.STOCK_WRITE_OFF);
  const canTransfer = can(PERMISSIONS.STOCK_TRANSFER);
  const canManageCatalog = can(PERMISSIONS.SPARE_PART_MANAGE);

  const summary = useQuery({
    queryKey: ['stock-summary'],
    queryFn: async () => (await api.get<StockSummary>('/stock/summary')).data,
  });

  const warehouses = useQuery({
    queryKey: ['stock-warehouses'],
    queryFn: async () => (await api.get<StockWarehouse[]>('/stock/warehouses')).data,
  });

  const items = useQuery({
    queryKey: ['stock-items'],
    queryFn: async () => (await api.get<StockItem[]>('/stock/items')).data,
  });

  const balances = usePaged<StockBalanceRow>(['stock-balances'], '/stock/balances', {
    warehouseId,
    category,
    search: search || undefined,
    inStockOnly: stockFilter === 'inStock' || undefined,
    belowMin: stockFilter === 'belowMin' || undefined,
    page: 1,
    pageSize: 200,
  });

  const movements = usePaged<StockMovementRow>(['stock-movements'], '/stock/movements', {
    warehouseId,
    page: movementPage,
    pageSize: 25,
  });

  const documents = usePaged<StockDocumentRow>(['stock-documents'], '/stock/documents', {
    warehouseId,
    page: documentPage,
    pageSize: 25,
  });

  if (!can(PERMISSIONS.STOCK_READ)) {
    return <Typography.Text type="danger">{t('Нет прав на просмотр склада')}</Typography.Text>;
  }

  const recipientName = (row: {
    recipientDriver: { lastName: string; firstName: string } | null;
    recipientUser: { fullName: string } | null;
  }): string =>
    row.recipientDriver
      ? `${row.recipientDriver.lastName} ${row.recipientDriver.firstName}`
      : (row.recipientUser?.fullName ?? '—');

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t('Позиций в наличии')}
              value={summary.data?.positions ?? 0}
              prefix={<InboxOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t('Стоимость запасов')}
              value={summary.data?.totalValue ?? 0}
              formatter={(v) => fmt(v as number)}
              suffix={t('сум')}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t('Ниже минимума')}
              value={summary.data?.belowMin ?? 0}
              valueStyle={{ color: (summary.data?.belowMin ?? 0) > 0 ? '#cf1322' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Tooltip title={t('Старые аккумуляторы и шины, принятые при обмене и ожидающие сдачи')}>
              <Statistic
                title={t('К утилизации')}
                value={summary.data?.utilizationQuantity ?? 0}
                formatter={(v) => fmt(v as number, 0)}
                suffix={t('ед.')}
              />
            </Tooltip>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {warehouses.data?.map((warehouse) => (
          <Col key={warehouse.id} xs={24} sm={12} lg={8}>
            <Card
              size="small"
              hoverable
              onClick={() =>
                setWarehouseId((current) => (current === warehouse.id ? undefined : warehouse.id))
              }
              style={{
                borderColor: warehouseId === warehouse.id ? '#1677ff' : undefined,
              }}
            >
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <Space wrap size="small">
                  <Typography.Text strong>{warehouse.code}</Typography.Text>
                  <Tag color={WAREHOUSE_COLOR[warehouse.kind]}>
                    {t(WAREHOUSE_KIND_LABEL[warehouse.kind])}
                  </Tag>
                </Space>
                <Typography.Text type="secondary">{warehouse.name}</Typography.Text>
                <Space size="large">
                  <span>
                    {t('позиций')}: <strong>{warehouse.positions}</strong>
                  </span>
                  <span>
                    {t('на сумму')}: <strong>{fmt(warehouse.totalValue)}</strong>
                  </span>
                </Space>
                {warehouse.keeper && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t('ответственный')}: {warehouse.keeper.fullName}
                  </Typography.Text>
                )}
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <TableCard
        title={
          <Space wrap size="small">
            <span>{t('Склад ТМЦ')}</span>
            {warehouseId && (
              <Tag closable onClose={() => setWarehouseId(undefined)} color="blue">
                {warehouses.data?.find((w) => w.id === warehouseId)?.name}
              </Tag>
            )}
            <Badge
              status="processing"
              text={`${t('движений сегодня')}: ${summary.data?.movementsToday ?? 0}`}
            />
          </Space>
        }
        extra={
          <Space wrap>
            {canReceipt && (
              <Button
                icon={<ArrowDownOutlined />}
                onClick={() => setDocumentKind(StockDocumentKind.RECEIPT)}
              >
                {t('Приход')}
              </Button>
            )}
            {canIssue && (
              <Button onClick={() => setDocumentKind(StockDocumentKind.RETURN)}>{t('Возврат')}</Button>
            )}
            {canTransfer && (
              <Button
                icon={<SwapOutlined />}
                onClick={() => setDocumentKind(StockDocumentKind.TRANSFER)}
              >
                {t('Перемещение')}
              </Button>
            )}
            {canWriteOff && (
              <Button danger onClick={() => setDocumentKind(StockDocumentKind.WRITE_OFF)}>
                {t('Списание')}
              </Button>
            )}
            {canIssue && (
              <Button
                type="primary"
                icon={<ArrowUpOutlined />}
                onClick={() => setDocumentKind(StockDocumentKind.ISSUE)}
              >
                {t('Выдать ТМЦ')}
              </Button>
            )}
          </Space>
        }
      >
        <Tabs
          items={[
            {
              key: 'balances',
              label: t('Остатки'),
              children: (
                <>
                  <Space wrap style={{ marginBottom: 12 }}>
                    <Input.Search
                      allowClear
                      placeholder={t('Наименование или код')}
                      style={{ width: 260 }}
                      onSearch={setSearch}
                    />
                    <Select
                      allowClear
                      placeholder={t('Категория')}
                      style={{ width: 220 }}
                      value={category}
                      onChange={setCategory}
                      options={Object.entries(STOCK_CATEGORY_LABEL).map(([value, label]) => ({
                        value,
                        label: t(label),
                      }))}
                    />
                    <Segmented
                      value={stockFilter}
                      onChange={(v) => setStockFilter(v as typeof stockFilter)}
                      options={[
                        { label: t('В наличии'), value: 'inStock' },
                        { label: t('Ниже минимума'), value: 'belowMin' },
                        { label: t('Все'), value: 'all' },
                      ]}
                    />
                  </Space>

                  <StickyTable<StockBalanceRow>
                    rowKey="id"
                    size="small"
                    loading={balances.isLoading}
                    dataSource={balances.data?.items ?? []}
                    pagination={false}
                    locale={{ emptyText: <Empty description={t('Остатков не найдено')} /> }}
                    columns={[
                      {
                        title: t('Позиция'),
                        render: (_: unknown, row: StockBalanceRow) => (
                          <Space direction="vertical" size={0}>
                            <span>{row.part.name}</span>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {row.part.code}
                              {row.part.catalogNumber ? ` · ${row.part.catalogNumber}` : ''}
                            </Typography.Text>
                          </Space>
                        ),
                      },
                      {
                        title: t('Категория'),
                        width: 180,
                        render: (_: unknown, row: StockBalanceRow) =>
                          t(STOCK_CATEGORY_LABEL[row.part.category]),
                      },
                      {
                        title: t('Склад'),
                        width: 150,
                        render: (_: unknown, row: StockBalanceRow) => row.warehouse.code,
                      },
                      {
                        title: t('Остаток'),
                        width: 130,
                        align: 'right',
                        render: (_: unknown, row: StockBalanceRow) => {
                          const quantity = Number(row.quantity);
                          const min = Number(row.minQuantity);
                          const low = min > 0 && quantity < min;
                          return (
                            <Tooltip title={low ? `${t('Неснижаемый запас')}: ${fmt(min, 2)}` : undefined}>
                              <Typography.Text
                                strong
                                style={{ color: low ? '#cf1322' : undefined }}
                              >
                                {fmt(quantity, 2)} {t(row.part.unit)}
                              </Typography.Text>
                            </Tooltip>
                          );
                        },
                      },
                      {
                        title: t('Средняя цена'),
                        width: 140,
                        align: 'right',
                        render: (_: unknown, row: StockBalanceRow) => fmt(row.avgPrice),
                      },
                      {
                        title: t('Сумма'),
                        width: 150,
                        align: 'right',
                        render: (_: unknown, row: StockBalanceRow) =>
                          fmt(Number(row.quantity) * Number(row.avgPrice ?? 0)),
                      },
                      {
                        title: t('Учёт'),
                        width: 120,
                        render: (_: unknown, row: StockBalanceRow) =>
                          row.part.exchangeRequired ? (
                            <Tooltip title={t('Выдаётся в обмен на сданное отработанное')}>
                              <Tag color="orange">{t('обмен')}</Tag>
                            </Tooltip>
                          ) : (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {t(STOCK_TRACKING_LABEL[row.part.tracking])}
                            </Typography.Text>
                          ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'movements',
              label: t('Движения'),
              children: (
                <StickyTable<StockMovementRow>
                  rowKey="id"
                  size="small"
                  loading={movements.isLoading}
                  dataSource={movements.data?.items ?? []}
                  pagination={{
                    current: movementPage,
                    pageSize: 25,
                    total: movements.data?.meta.total ?? 0,
                    onChange: setMovementPage,
                    showTotal: (total) => `${t('Всего')}: ${total}`,
                  }}
                  columns={[
                    {
                      title: t('Дата'),
                      width: 140,
                      render: (_: unknown, row: StockMovementRow) =>
                        dayjs(row.movedAt).format('DD.MM.YYYY HH:mm'),
                    },
                    {
                      title: t('Операция'),
                      width: 190,
                      render: (_: unknown, row: StockMovementRow) => (
                        <Tag color={KIND_COLOR[row.document.kind]}>
                          {t(STOCK_MOVEMENT_LABEL[row.type])}
                        </Tag>
                      ),
                    },
                    {
                      title: t('Документ'),
                      width: 200,
                      render: (_: unknown, row: StockMovementRow) => row.document.number,
                    },
                    {
                      title: t('Позиция'),
                      render: (_: unknown, row: StockMovementRow) => row.part.name,
                    },
                    {
                      title: t('Склад'),
                      width: 110,
                      render: (_: unknown, row: StockMovementRow) => row.warehouse.code,
                    },
                    {
                      title: t('Кол-во'),
                      width: 130,
                      align: 'right',
                      render: (_: unknown, row: StockMovementRow) => {
                        const quantity = Number(row.quantity);
                        return (
                          <Typography.Text
                            style={{ color: quantity < 0 ? '#cf1322' : '#389e0d' }}
                          >
                            {quantity > 0 ? '+' : '−'}
                            {fmt(Math.abs(quantity), 2)} {t(row.part.unit)}
                          </Typography.Text>
                        );
                      },
                    },
                    {
                      title: t('Остаток после'),
                      width: 130,
                      align: 'right',
                      render: (_: unknown, row: StockMovementRow) => fmt(row.balanceAfter, 2),
                    },
                    {
                      title: t('Куда / кому'),
                      render: (_: unknown, row: StockMovementRow) => {
                        const parts = [
                          row.document.vehicle?.garageNumber,
                          recipientName(row.document),
                        ].filter((value) => value && value !== '—');
                        return parts.length > 0 ? parts.join(' · ') : '—';
                      },
                    },
                  ]}
                />
              ),
            },
            {
              key: 'documents',
              label: t('Документы'),
              children: (
                <StickyTable<StockDocumentRow>
                  rowKey="id"
                  size="small"
                  loading={documents.isLoading}
                  dataSource={documents.data?.items ?? []}
                  pagination={{
                    current: documentPage,
                    pageSize: 25,
                    total: documents.data?.meta.total ?? 0,
                    onChange: setDocumentPage,
                    showTotal: (total) => `${t('Всего')}: ${total}`,
                  }}
                  expandable={{
                    expandedRowRender: (row) => (
                      <Space direction="vertical" size={2}>
                        {row.reason && <span>{t('Основание')}: {row.reason}</span>}
                        {row.notes && <span>{t('Примечание')}: {row.notes}</span>}
                        {row.externalNumber && <span>{t('Накладная')}: {row.externalNumber}</span>}
                        {row.targetWarehouse && (
                          <span>{t('Склад-получатель')}: {row.targetWarehouse.name}</span>
                        )}
                        {row.purpose && (
                          <span>
                            {t('Основание выдачи')}: {t(STOCK_PURPOSE_LABEL[row.purpose])}
                          </span>
                        )}
                      </Space>
                    ),
                    rowExpandable: (row) =>
                      Boolean(
                        row.reason || row.notes || row.externalNumber || row.targetWarehouse || row.purpose,
                      ),
                  }}
                  columns={[
                    {
                      title: t('Документ'),
                      width: 210,
                      render: (_: unknown, row: StockDocumentRow) => row.number,
                    },
                    {
                      title: t('Вид'),
                      width: 140,
                      render: (_: unknown, row: StockDocumentRow) => (
                        <Tag color={KIND_COLOR[row.kind]}>{t(STOCK_DOCUMENT_LABEL[row.kind])}</Tag>
                      ),
                    },
                    {
                      title: t('Дата'),
                      width: 140,
                      render: (_: unknown, row: StockDocumentRow) =>
                        dayjs(row.documentDate).format('DD.MM.YYYY HH:mm'),
                    },
                    {
                      title: t('Склад'),
                      width: 130,
                      render: (_: unknown, row: StockDocumentRow) => row.warehouse.code,
                    },
                    {
                      title: t('Строк'),
                      width: 80,
                      align: 'right',
                      render: (_: unknown, row: StockDocumentRow) => row._count.movements,
                    },
                    {
                      title: t('Техника'),
                      width: 130,
                      render: (_: unknown, row: StockDocumentRow) =>
                        row.vehicle?.garageNumber ?? '—',
                    },
                    {
                      title: t('Кому / от кого'),
                      render: (_: unknown, row: StockDocumentRow) =>
                        row.supplier?.name ?? recipientName(row),
                    },
                    {
                      title: t('Сумма'),
                      width: 150,
                      align: 'right',
                      render: (_: unknown, row: StockDocumentRow) => fmt(row.totalAmount),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'items',
              label: t('Номенклатура'),
              children: (
                <>
                  {canManageCatalog && (
                    <Space style={{ marginBottom: 12 }}>
                      <Button
                        icon={<PlusOutlined />}
                        onClick={() => {
                          setEditingItem(null);
                          setItemModalOpen(true);
                        }}
                      >
                        {t('Новая позиция')}
                      </Button>
                    </Space>
                  )}

                  <Table<StockItem>
                    rowKey="id"
                    size="small"
                    loading={items.isLoading}
                    dataSource={items.data ?? []}
                    pagination={{ pageSize: 50, showTotal: (total) => `${t('Всего')}: ${total}` }}
                    columns={[
                      { title: t('Код'), dataIndex: 'code', width: 160 },
                      { title: t('Наименование'), dataIndex: 'name' },
                      {
                        title: t('Категория'),
                        width: 190,
                        render: (_: unknown, row: StockItem) => t(STOCK_CATEGORY_LABEL[row.category]),
                      },
                      { title: t('Ед.'), dataIndex: 'unit', width: 80 },
                      {
                        title: t('В офисе'),
                        width: 120,
                        align: 'right',
                        render: (_: unknown, row: StockItem) => fmt(row.onHand, 2),
                      },
                      {
                        title: t('Признаки'),
                        width: 200,
                        render: (_: unknown, row: StockItem) => (
                          <Space size={4} wrap>
                            {row.exchangeRequired && <Tag color="orange">{t('обмен')}</Tag>}
                            {row.tracking === 'SERIAL' && <Tag color="geekblue">{t('поштучно')}</Tag>}
                            {!row.isActive && <Tag>{t('снята')}</Tag>}
                          </Space>
                        ),
                      },
                      {
                        title: '',
                        width: 60,
                        render: (_: unknown, row: StockItem) =>
                          canManageCatalog && (
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => {
                                setEditingItem(row);
                                setItemModalOpen(true);
                              }}
                            />
                          ),
                      },
                    ]}
                  />
                </>
              ),
            },
          ]}
        />
      </TableCard>

      <StockDocumentModal
        kind={documentKind}
        warehouses={warehouses.data ?? []}
        items={items.data ?? []}
        onClose={() => setDocumentKind(null)}
      />

      <StockItemModal
        item={editingItem}
        open={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
      />
    </>
  );
}
