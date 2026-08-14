import { DownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Row,
  Select,
  Space,
  Statistic,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { PERMISSIONS, VehicleCategory } from '@gsm/shared';

import { api } from '@/api/client';
import { useDictionaries, useDownload } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { StickyTable } from '@/components/StickyTable';
import { CATEGORY_LABEL, DOCUMENT_TYPE_LABEL, deviationColor, fmt } from '@/lib/labels';

interface Summary {
  waybills: number;
  distanceKm: number;
  engineHours: number;
  normLitres: number;
  actualLitres: number;
  deviationLitres: number;
  deviationPct: number | null;
  issuedLitres: number;
  fuelCost: number;
  openAlerts: number;
}

interface ConsumptionRow {
  vehicleId: number;
  garageNumber: string;
  plateNumber: string | null;
  category: string;
  model: string;
  waybills: number;
  distanceKm: number;
  engineHours: number;
  normLitres: number;
  actualLitres: number;
  deviationLitres: number;
  deviationPct: number | null;
  litresPer100Km: number | null;
  litresPerHour: number | null;
  fuelCost: number;
}

interface DriverRow {
  driverId: number;
  driver: string;
  personnelNumber: string;
  shifts: number;
  distanceKm: number;
  engineHours: number;
  normLitres: number;
  actualLitres: number;
  deviationPct: number | null;
}

interface MovementRow {
  tankId: number;
  code: string;
  name: string;
  fuelType: string;
  openingVolume: number;
  receivedLitres: number;
  issuedLitres: number;
  closingVolume: number;
  receivedAmount: number;
  issuedAmount: number;
}

interface ExpiryRow {
  entityType: string;
  entityId: number;
  subjectLabel: string;
  documentType: string;
  documentNumber: string | null;
  expiresAt: string;
  daysLeft: number;
  severity: string;
}

export function ReportsPage() {
  const { t } = useTranslation();

  const { can } = useAuth();
  const download = useDownload();
  const dictionaries = useDictionaries();

  // По умолчанию — текущий месяц: именно за него собирают отчётность.
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs(),
  ]);
  const [category, setCategory] = useState<string | undefined>();
  const [departmentId, setDepartmentId] = useState<number | undefined>();

  const params = {
    dateFrom: range[0].format('YYYY-MM-DD'),
    dateTo: range[1].format('YYYY-MM-DD'),
    category,
    departmentId,
  };
  const key = [params.dateFrom, params.dateTo, category, departmentId];

  const summary = useQuery({
    queryKey: ['report-summary', ...key],
    queryFn: async () => (await api.get<Summary>('/reports/summary', { params })).data,
  });

  const consumption = useQuery({
    queryKey: ['report-consumption', ...key],
    queryFn: async () =>
      (await api.get<ConsumptionRow[]>('/reports/fuel-consumption', { params })).data,
  });

  const drivers = useQuery({
    queryKey: ['report-drivers', ...key],
    queryFn: async () =>
      (await api.get<DriverRow[]>('/reports/driver-activity', { params })).data,
  });

  const movement = useQuery({
    queryKey: ['report-movement', ...key],
    queryFn: async () =>
      (await api.get<MovementRow[]>('/reports/fuel-movement', { params })).data,
  });

  const expiring = useQuery({
    queryKey: ['expiring-all'],
    queryFn: async () =>
      (await api.get<ExpiryRow[]>('/reports/expiring', { params: { days: 60 } })).data,
  });

  if (!can(PERMISSIONS.REPORT_READ)) {
    return <Typography.Text type="danger">Нет прав на просмотр отчётов</Typography.Text>;
  }

  const canExport = can(PERMISSIONS.REPORT_EXPORT);

  const exportButton = (url: string, name: string) =>
    canExport ? (
      <Button
        icon={<DownloadOutlined />}
        onClick={() => void download(url, params, name)}
      >
        {t("Выгрузить в Excel")}
      </Button>
    ) : null;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card>
        <Space wrap>
          <DatePicker.RangePicker
            value={range}
            format="DD.MM.YYYY"
            allowClear={false}
            onChange={(value) => value && setRange(value as [dayjs.Dayjs, dayjs.Dayjs])}
            presets={[
              { label: t("Текущий месяц"), value: [dayjs().startOf('month'), dayjs()] },
              {
                label: t("Прошлый месяц"),
                value: [
                  dayjs().subtract(1, 'month').startOf('month'),
                  dayjs().subtract(1, 'month').endOf('month'),
                ],
              },
              { label: t("Квартал"), value: [dayjs().startOf('quarter'), dayjs()] },
              { label: t("Год"), value: [dayjs().startOf('year'), dayjs()] },
            ]}
          />
          <Select
            allowClear
            placeholder={t("Категория техники")}
            style={{ width: 220 }}
            value={category}
            onChange={setCategory}
            options={Object.values(VehicleCategory).map((c) => ({
              value: c,
              label: t(CATEGORY_LABEL[c] ?? c),
            }))}
          />
          <Select
            allowClear
            placeholder={t("Подразделение")}
            style={{ width: 220 }}
            value={departmentId}
            onChange={setDepartmentId}
            options={dictionaries.data?.departments.map((d) => ({ value: d.id, label: d.name }))}
          />
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title={t("Закрытых листов")} value={summary.data?.waybills ?? 0} loading={summary.isLoading} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t("Пробег, км")}
              value={fmt(summary.data?.distanceKm)}
              loading={summary.isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t("Израсходовано, л")}
              value={fmt(summary.data?.actualLitres)}
              loading={summary.isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t("Отклонение от нормы")}
              value={
                summary.data?.deviationPct === null || summary.data?.deviationPct === undefined
                  ? '—'
                  : `${summary.data.deviationPct > 0 ? '+' : ''}${summary.data.deviationPct} %`
              }
              valueStyle={{ color: deviationColor(summary.data?.deviationPct ?? null) }}
              loading={summary.isLoading}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs
          items={[
            {
              key: 'consumption',
              label: t("Расход по технике"),
              children: (
                <>
                  <Space style={{ marginBottom: 12 }}>
                    {exportButton('/reports/fuel-consumption.csv', 'rashod-gsm.csv')}
                  </Space>
                  <StickyTable<ConsumptionRow>
                    rowKey="vehicleId"
                    size="small"
                    loading={consumption.isLoading}
                    dataSource={consumption.data ?? []}
                    pagination={{ pageSize: 20, showTotal: (t) => `Единиц техники: ${t}` }}
                    scroll={{ x: 1100 }}
                    columns={[
                      { title: t("Гаражный"), dataIndex: 'garageNumber', width: 110, fixed: 'left' },
                      { title: t("Модель"), dataIndex: 'model' },
                      {
                        title: t("Категория"),
                        dataIndex: 'category',
                        render: (c: string) => t(CATEGORY_LABEL[c] ?? c),
                      },
                      { title: t("Листов"), dataIndex: 'waybills', width: 80, align: 'right' },
                      {
                        title: t("Пробег, км"),
                        dataIndex: 'distanceKm',
                        width: 110,
                        align: 'right',
                        render: (v: number) => fmt(v, 1),
                      },
                      {
                        title: t("Моточасы"),
                        dataIndex: 'engineHours',
                        width: 100,
                        align: 'right',
                        render: (v: number) => fmt(v, 1),
                      },
                      {
                        title: t("Норма, л"),
                        dataIndex: 'normLitres',
                        width: 100,
                        align: 'right',
                        render: (v: number) => fmt(v, 1),
                      },
                      {
                        title: t("Факт, л"),
                        dataIndex: 'actualLitres',
                        width: 100,
                        align: 'right',
                        render: (v: number) => fmt(v, 1),
                      },
                      {
                        title: t("Отклонение"),
                        dataIndex: 'deviationPct',
                        width: 120,
                        align: 'right',
                        render: (v: number | null) =>
                          v === null ? (
                            '—'
                          ) : (
                            <Typography.Text strong style={{ color: deviationColor(v) }}>
                              {v > 0 ? '+' : ''}
                              {v.toFixed(1)} %
                            </Typography.Text>
                          ),
                      },
                      {
                        title: t("л/100 км"),
                        dataIndex: 'litresPer100Km',
                        width: 100,
                        align: 'right',
                        render: (v: number | null) => (v === null ? '—' : fmt(v, 1)),
                      },
                      {
                        title: t("л/мч"),
                        dataIndex: 'litresPerHour',
                        width: 90,
                        align: 'right',
                        render: (v: number | null) => (v === null ? '—' : fmt(v, 1)),
                      },
                      {
                        title: t("Стоимость"),
                        dataIndex: 'fuelCost',
                        width: 130,
                        align: 'right',
                        render: (v: number) => fmt(v),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'drivers',
              label: t("Наработка водителей"),
              children: (
                <>
                  <Space style={{ marginBottom: 12 }}>
                    {exportButton('/reports/driver-activity.csv', 'voditeli.csv')}
                  </Space>
                  <StickyTable<DriverRow>
                    rowKey="driverId"
                    size="small"
                    loading={drivers.isLoading}
                    dataSource={drivers.data ?? []}
                    pagination={{ pageSize: 20 }}
                    columns={[
                      { title: t("Табельный"), dataIndex: 'personnelNumber', width: 120 },
                      { title: t("Водитель"), dataIndex: 'driver' },
                      { title: t("Смен"), dataIndex: 'shifts', width: 80, align: 'right' },
                      {
                        title: t("Пробег, км"),
                        dataIndex: 'distanceKm',
                        width: 120,
                        align: 'right',
                        render: (v: number) => fmt(v, 1),
                      },
                      {
                        title: t("Моточасы"),
                        dataIndex: 'engineHours',
                        width: 110,
                        align: 'right',
                        render: (v: number) => fmt(v, 1),
                      },
                      {
                        title: t("Факт, л"),
                        dataIndex: 'actualLitres',
                        width: 110,
                        align: 'right',
                        render: (v: number) => fmt(v, 1),
                      },
                      {
                        title: t("Отклонение"),
                        dataIndex: 'deviationPct',
                        width: 120,
                        align: 'right',
                        render: (v: number | null) =>
                          v === null ? (
                            '—'
                          ) : (
                            <Typography.Text strong style={{ color: deviationColor(v) }}>
                              {v > 0 ? '+' : ''}
                              {v.toFixed(1)} %
                            </Typography.Text>
                          ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'movement',
              label: t("Движение ГСМ"),
              children: (
                <>
                  <Space style={{ marginBottom: 12 }}>
                    {exportButton('/reports/fuel-movement.csv', 'dvizhenie-gsm.csv')}
                  </Space>
                  <StickyTable<MovementRow>
                    rowKey="tankId"
                    size="small"
                    loading={movement.isLoading}
                    dataSource={movement.data ?? []}
                    pagination={false}
                    columns={[
                      { title: t("Ёмкость"), dataIndex: 'code', width: 100 },
                      { title: t("Наименование"), dataIndex: 'name' },
                      { title: t("Топливо"), dataIndex: 'fuelType', width: 160 },
                      {
                        title: t("На начало, л"),
                        dataIndex: 'openingVolume',
                        align: 'right',
                        render: (v: number) => fmt(v, 1),
                      },
                      {
                        title: t("Приход, л"),
                        dataIndex: 'receivedLitres',
                        align: 'right',
                        render: (v: number) => fmt(v, 1),
                      },
                      {
                        title: t("Расход, л"),
                        dataIndex: 'issuedLitres',
                        align: 'right',
                        render: (v: number) => fmt(v, 1),
                      },
                      {
                        title: t("На конец, л"),
                        dataIndex: 'closingVolume',
                        align: 'right',
                        render: (v: number) => fmt(v, 1),
                      },
                      {
                        title: t("Сумма прихода"),
                        dataIndex: 'receivedAmount',
                        align: 'right',
                        render: (v: number) => fmt(v),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'expiring',
              label: `Истекающие документы (${expiring.data?.length ?? 0})`,
              children: (
                <StickyTable<ExpiryRow>
                  rowKey={(row) => `${row.entityType}-${row.entityId}`}
                  size="small"
                  loading={expiring.isLoading}
                  dataSource={expiring.data ?? []}
                  pagination={{ pageSize: 20 }}
                  columns={[
                    {
                      title: t("Объект"),
                      dataIndex: 'entityType',
                      width: 130,
                      render: (t: string) =>
                        t === 'VEHICLE_DOCUMENT' ? <Tag>Техника</Tag> : <Tag color="blue">Водитель</Tag>,
                    },
                    { title: t("Кто/что"), dataIndex: 'subjectLabel' },
                    {
                      title: t("Документ"),
                      dataIndex: 'documentType',
                      render: (code: string) => t(DOCUMENT_TYPE_LABEL[code] ?? code),
                    },
                    { title: t("Номер"), dataIndex: 'documentNumber', width: 140 },
                    {
                      title: t("Действует до"),
                      dataIndex: 'expiresAt',
                      width: 130,
                      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
                    },
                    {
                      title: t("Осталось"),
                      dataIndex: 'daysLeft',
                      width: 130,
                      render: (days: number) =>
                        days < 0 ? (
                          <Tag color="red">просрочен {Math.abs(days)} дн.</Tag>
                        ) : (
                          <Tag color={days <= 7 ? 'orange' : days <= 30 ? 'gold' : 'default'}>
                            {days} дн.
                          </Tag>
                        ),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
