import {
  CameraOutlined,
  DeleteOutlined,
  FileExcelOutlined,
  MobileOutlined,
  PlusOutlined,
  PrinterOutlined,
} from '@ant-design/icons';
import {
  Button,
  DatePicker,
  Popconfirm,
  Space,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PERMISSIONS } from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation, useDownload, usePaged } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { createdAtColumn } from '@/components/createdAtColumn';
import { StickyTable } from '@/components/StickyTable';
import { TableCard } from '@/components/TableCard';
import { fmt } from '@/lib/labels';

import { ViolationFormModal } from './violations/ViolationFormModal';
import { ViolationPhotoPreview, useViolationPhotoPreview } from './violations/ViolationPhotoPreview';

const { RangePicker } = DatePicker;

interface ViolationRow {
  id: number;
  occurredAt: string;
  fineAmount: string | null;
  description: string | null;
  photoKey: string | null;
  createdAt: string;
  driver: { id: number; lastName: string; firstName: string; middleName: string | null; personnelNumber: string };
  vehicle: { id: number; garageNumber: string; plateNumber: string | null } | null;
  type: { id: number; name: string };
  issuedByUser: { id: number; fullName: string } | null;
}

/**
 * Журнал нарушений — рабочее место службы безопасности дорог аэропорта.
 *
 * Отдельное от карточки водителя меню, потому что доступ к нему выдаётся
 * отдельным правом (violation.manage): сотрудник БД не должен получать
 * заодно доступ к остальной карточке водителя, а начальник автослужбы —
 * не должен оформлять нарушения от чужого имени.
 */
export function ViolationsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const photoPreview = useViolationPhotoPreview();
  const download = useDownload();

  const canManage = can(PERMISSIONS.VIOLATION_MANAGE);

  const filters = { dateFrom: dateRange?.[0], dateTo: dateRange?.[1] };

  const query = usePaged<ViolationRow>(['violations'], '/violations', {
    page,
    pageSize,
    ...filters,
  });

  const remove = useApiMutation(
    async (id: number) => (await api.delete(`/violations/${id}`)).data,
    { successMessage: t('Запись удалена'), invalidate: [['violations']] },
  );

  if (!can(PERMISSIONS.VIOLATION_READ)) {
    return <Typography.Text type="danger">{t('Нет прав на просмотр нарушений')}</Typography.Text>;
  }

  return (
    <TableCard
      title={t('Нарушения')}
      extra={
        <Space wrap>
          <RangePicker
            format="DD.MM.YYYY"
            onChange={(_, formatted) => {
              setDateRange(formatted[0] && formatted[1] ? [formatted[0], formatted[1]] : null);
              setPage(1);
            }}
          />
          <Button
            icon={<FileExcelOutlined />}
            onClick={() => download('/violations/export.csv', filters, 'narusheniya.csv')}
          >
            Excel
          </Button>
          {canManage && (
            <>
              {/*
                Открывает упрощённый экран (FieldViolationPage) в новой вкладке —
                тот же сценарий, но без сайдбара и таблиц, под палец на телефоне
                или планшете сотрудника БД в поле. Журнал в текущей вкладке при
                этом остаётся открытым.
              */}
              <Tooltip title={t('Открыть мобильный экран для оформления в поле')}>
                <Link to="/field/violations" target="_blank" rel="noopener">
                  <Button icon={<MobileOutlined />}>{t('Мобильный режим')}</Button>
                </Link>
              </Tooltip>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                {t('Оформить нарушение')}
              </Button>
            </>
          )}
        </Space>
      }
    >
      <StickyTable<ViolationRow>
        rowKey="id"
        rowNumbers
        loading={query.isLoading}
        dataSource={query.data?.items ?? []}
        pagination={{
          current: page,
          pageSize,
          total: query.data?.meta.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${t('Всего:')} ${total}`,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          },
        }}
        columns={[
          {
            title: t('Дата'),
            dataIndex: 'occurredAt',
            width: 150,
            render: (date: string) => dayjs(date).format('DD.MM.YYYY HH:mm'),
          },
          {
            title: t('Водитель'),
            render: (_: unknown, row: ViolationRow) =>
              `${row.driver.lastName} ${row.driver.firstName} ${row.driver.middleName ?? ''}`.trim(),
          },
          {
            title: t('Техника'),
            width: 160,
            render: (_: unknown, row: ViolationRow) =>
              row.vehicle
                ? `${row.vehicle.garageNumber}${row.vehicle.plateNumber ? ` · ${row.vehicle.plateNumber}` : ''}`
                : '—',
          },
          { title: t('Вид нарушения'), width: 220, render: (_: unknown, row: ViolationRow) => row.type.name },
          {
            title: t('Штраф'),
            dataIndex: 'fineAmount',
            width: 120,
            align: 'right',
            render: (value: string | null) => (value ? fmt(value) : '—'),
          },
          {
            title: t('Оформил'),
            width: 180,
            render: (_: unknown, row: ViolationRow) => row.issuedByUser?.fullName ?? '—',
          },
          createdAtColumn<ViolationRow>(t),
          {
            title: '',
            width: 150,
            render: (_: unknown, row: ViolationRow) => (
              <Space size={0}>
                {row.photoKey && (
                  <Tooltip
                    title={`${t('Показать фото')} · ${t('Загружено')} ${dayjs(row.createdAt).format('DD.MM.YYYY HH:mm')}`}
                  >
                    <Button
                      type="text"
                      icon={<CameraOutlined />}
                      onClick={() => photoPreview.open(row.id)}
                    />
                  </Tooltip>
                )}
                <Tooltip title={t('Печать')}>
                  <Button
                    type="text"
                    icon={<PrinterOutlined />}
                    onClick={() =>
                      window.open(`/violations/${row.id}/print`, '_blank', 'noopener')
                    }
                  />
                </Tooltip>
                <Tooltip title="Excel">
                  <Button
                    type="text"
                    icon={<FileExcelOutlined />}
                    onClick={() =>
                      download(`/violations/${row.id}/export.csv`, {}, `narushenie-${row.id}.csv`)
                    }
                  />
                </Tooltip>
                {canManage && (
                  <Popconfirm
                    title={t('Удалить запись о нарушении?')}
                    okText={t('Удалить')}
                    cancelText={t('Отмена')}
                    onConfirm={() => remove.mutate(row.id)}
                  >
                    <Tooltip title={t('Удалить')}>
                      <Button type="text" danger icon={<DeleteOutlined />} />
                    </Tooltip>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
        expandable={{
          rowExpandable: (row) => Boolean(row.description),
          expandedRowRender: (row) => (
            <Typography.Text type="secondary">{row.description}</Typography.Text>
          ),
        }}
      />

      <ViolationFormModal open={formOpen} onClose={() => setFormOpen(false)} />

      {photoPreview.target !== null && (
        <ViolationPhotoPreview
          violationId={photoPreview.target}
          open
          onClose={photoPreview.close}
        />
      )}
    </TableCard>
  );
}
