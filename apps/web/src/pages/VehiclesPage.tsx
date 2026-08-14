import {
  DeleteOutlined,
  EditOutlined,
  PictureOutlined,
  PlusOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS, VehicleCategory, VehicleStatus } from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation, usePaged } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { StickyTable } from '@/components/StickyTable';
import { TableCard } from '@/components/TableCard';
import { CATEGORY_LABEL, STATUS_COLOR, STATUS_LABEL, fmt } from '@/lib/labels';

import { VehicleDrawer } from './vehicles/VehicleDrawer';
import { VehicleFormModal, type VehicleFormValues } from './vehicles/VehicleFormModal';
import { VehiclePhotoPreview, usePhotoPreview } from './vehicles/VehiclePhotoPreview';

interface VehicleRow {
  id: number;
  garageNumber: string;
  plateNumber: string | null;
  vin: string | null;
  inventoryNumber: string | null;
  category: string;
  status: string;
  ownership: string;
  meterType: string;
  tankCapacity: string | null;
  modelId: number;
  departmentId: number | null;
  fuelTypeId: number | null;
  manufactureYear: number | null;
  commissionedAt: string | null;
  requiresAirsidePermit: boolean;
  notes: string | null;
  currentOdometer: string | null;
  currentEngineHours: string | null;
  currentFuelLevel: string;
  model: { manufacturer: string; model: string } | null;
  department: { name: string } | null;
  /** Главное фото, если оно загружено. Список отдаёт только его идентификатор. */
  photos: Array<{ id: number }>;
}

export function VehiclesPage() {
  const { can, user } = useAuth();
  const { t } = useTranslation();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [category, setCategory] = useState<string | undefined>();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleFormValues | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [transferFor, setTransferFor] = useState<VehicleRow | null>(null);
  const [transferForm] = Form.useForm();
  const preview = usePhotoPreview();

  const query = usePaged<VehicleRow>(
    ['vehicles'],
    '/vehicles',
    { page, pageSize, search: search || undefined, status, category },
  );

  const remove = useApiMutation(
    async (id: number) => {
      const { data } = await api.delete(`/vehicles/${id}`);
      return data;
    },
    { successMessage: t('Техника списана с учёта'), invalidate: [['vehicles'], ['office-summary']] },
  );

  const transfer = useApiMutation(
    async (values: { targetOfficeId: number; effectiveFrom: dayjs.Dayjs; reason?: string }) => {
      const { data } = await api.post(`/vehicles/${transferFor!.id}/transfer`, {
        targetOfficeId: values.targetOfficeId,
        effectiveFrom: values.effectiveFrom.format('YYYY-MM-DD'),
        reason: values.reason,
      });
      return data;
    },
    { successMessage: t('Техника передана'), invalidate: [['vehicles'], ['office-summary']] },
  );

  if (!can(PERMISSIONS.VEHICLE_READ)) {
    return <Typography.Text type="danger">{t('Нет прав на просмотр транспорта')}</Typography.Text>;
  }

  return (
    <TableCard
      title={t('Транспорт и спецтехника')}
      extra={
        <Space wrap>
          <Input.Search
            allowClear
            placeholder={t('Гаражный номер, госномер, VIN')}
            style={{ width: 260 }}
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            placeholder={t('Категория')}
            style={{ width: 200 }}
            value={category}
            onChange={(value) => {
              setCategory(value);
              setPage(1);
            }}
            options={Object.values(VehicleCategory).map((c) => ({
              value: c,
              label: t(CATEGORY_LABEL[c] ?? c),
            }))}
          />
          <Select
            allowClear
            placeholder={t('Статус')}
            style={{ width: 150 }}
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={Object.values(VehicleStatus).map((s) => ({
              value: s,
              label: t(STATUS_LABEL[s] ?? s),
            }))}
          />
          {can(PERMISSIONS.VEHICLE_CREATE) && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              {t('Поставить на учёт')}
            </Button>
          )}
        </Space>
      }
    >
      <StickyTable<VehicleRow>
        rowKey="id"
        loading={query.isLoading}
        dataSource={query.data?.items ?? []}
        onRow={(row) => ({
          onClick: () => setDetailId(row.id),
          style: { cursor: 'pointer' },
        })}
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
            title: t('Фото'),
            key: 'photo',
            width: 70,
            align: 'center',
            render: (_: unknown, row: VehicleRow) => {
              const photo = row.photos?.[0];
              if (!photo) {
                // Пустая ячейка, а не серая иконка: колонка должна с одного
                // взгляда показывать, у какой техники снимок есть.
                return null;
              }
              return (
                <Tooltip title={t('Показать фото')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<PictureOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      preview.open(row.id, photo.id);
                    }}
                  />
                </Tooltip>
              );
            },
          },
          { title: t('Гаражный'), dataIndex: 'garageNumber', width: 120 },
          { title: t('Госномер'), dataIndex: 'plateNumber', width: 140 },
          {
            title: t('Категория'),
            dataIndex: 'category',
            render: (value: string) => t(CATEGORY_LABEL[value] ?? value),
          },
          {
            title: t('Модель'),
            dataIndex: 'model',
            render: (model: VehicleRow['model']) =>
              model ? `${model.manufacturer} ${model.model}` : '—',
          },
          {
            title: t('Статус'),
            dataIndex: 'status',
            width: 120,
            render: (value: string) => (
              <Tag color={STATUS_COLOR[value] ?? 'default'}>{t(STATUS_LABEL[value] ?? value)}</Tag>
            ),
          },
          {
            title: t('Одометр, км'),
            dataIndex: 'currentOdometer',
            width: 120,
            align: 'right',
            render: (value: string | null) => fmt(value),
          },
          {
            title: t('Моточасы'),
            dataIndex: 'currentEngineHours',
            width: 110,
            align: 'right',
            render: (value: string | null) => fmt(value),
          },
          {
            title: t('В баке, л'),
            dataIndex: 'currentFuelLevel',
            width: 100,
            align: 'right',
            render: (value: string) => fmt(value, 1),
          },
          {
            title: '',
            width: 130,
            render: (_: unknown, row: VehicleRow) => (
              <Space size={0} onClick={(event) => event.stopPropagation()}>
                {can(PERMISSIONS.VEHICLE_UPDATE) && (
                  <Tooltip title={t('Изменить')}>
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditing({
                          id: row.id,
                          garageNumber: row.garageNumber,
                          plateNumber: row.plateNumber ?? undefined,
                          vin: row.vin ?? undefined,
                          inventoryNumber: row.inventoryNumber ?? undefined,
                          category: row.category,
                          modelId: row.modelId,
                          departmentId: row.departmentId ?? undefined,
                          fuelTypeId: row.fuelTypeId ?? undefined,
                          meterType: row.meterType,
                          ownership: row.ownership,
                          tankCapacity: row.tankCapacity ? Number(row.tankCapacity) : undefined,
                          manufactureYear: row.manufactureYear ?? undefined,
                          commissionedAt: row.commissionedAt ?? undefined,
                          requiresAirsidePermit: row.requiresAirsidePermit,
                          notes: row.notes ?? undefined,
                          status: row.status,
                        });
                        setFormOpen(true);
                      }}
                    />
                  </Tooltip>
                )}
                {can(PERMISSIONS.VEHICLE_TRANSFER) && (
                  <Tooltip title={t('Передать в другой аэропорт')}>
                    <Button
                      type="text"
                      icon={<SwapOutlined />}
                      onClick={() => {
                        transferForm.resetFields();
                        setTransferFor(row);
                      }}
                    />
                  </Tooltip>
                )}
                {can(PERMISSIONS.VEHICLE_DELETE) && (
                  <Popconfirm
                    title={t('Списать технику с учёта?')}
                    description={t('Документы за прошлые периоды сохранятся.')}
                    okText={t('Списать')}
                    cancelText={t('Отмена')}
                    onConfirm={() => remove.mutate(row.id)}
                  >
                    <Tooltip title={t('Списать')}>
                      <Button type="text" danger icon={<DeleteOutlined />} />
                    </Tooltip>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <VehicleFormModal open={formOpen} initial={editing} onClose={() => setFormOpen(false)} />
      <VehicleDrawer vehicleId={detailId} onClose={() => setDetailId(null)} />

      {preview.target && (
        <VehiclePhotoPreview
          open
          vehicleId={preview.target.vehicleId}
          photoId={preview.target.photoId}
          onClose={preview.close}
        />
      )}

      <Modal
        open={transferFor !== null}
        title={`Передача техники ${transferFor?.garageNumber ?? ''}`}
        okText={t('Передать')}
        cancelText={t('Отмена')}
        confirmLoading={transfer.isPending}
        onCancel={() => setTransferFor(null)}
        onOk={() => {
          void transferForm.validateFields().then((values) => {
            transfer.mutate(values, { onSuccess: () => setTransferFor(null) });
          });
        }}
      >
        <Typography.Paragraph type="secondary">
          {t('Текущий период приписки будет закрыт, откроется новый. Отчёты за прошлые периоды')}
          останутся за нынешним офисом.
        </Typography.Paragraph>
        <Form form={transferForm} layout="vertical">
          <Form.Item
            name="targetOfficeId"
            label={t('Офис назначения')}
            rules={[{ required: true, message: t('Выберите офис') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={(user?.availableOffices ?? [])
                .filter((office) => office.id !== user?.activeOffice.id)
                .map((office) => ({ value: office.id, label: `${office.code} — ${office.name}` }))}
            />
          </Form.Item>
          <Form.Item
            name="effectiveFrom"
            label={t('Дата передачи')}
            rules={[{ required: true, message: t('Укажите дату') }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
          </Form.Item>
          <Form.Item name="reason" label={t('Основание')}>
            <Input placeholder={t('Приказ № ... от ...')} />
          </Form.Item>
        </Form>
      </Modal>
    </TableCard>
  );
}
