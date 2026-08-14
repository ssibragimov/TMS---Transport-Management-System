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
    { successMessage: 'Техника списана с учёта', invalidate: [['vehicles'], ['office-summary']] },
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
    { successMessage: 'Техника передана', invalidate: [['vehicles'], ['office-summary']] },
  );

  if (!can(PERMISSIONS.VEHICLE_READ)) {
    return <Typography.Text type="danger">Нет прав на просмотр транспорта</Typography.Text>;
  }

  return (
    <TableCard
      title="Транспорт и спецтехника"
      extra={
        <Space wrap>
          <Input.Search
            allowClear
            placeholder="Гаражный номер, госномер, VIN"
            style={{ width: 260 }}
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            placeholder="Категория"
            style={{ width: 200 }}
            value={category}
            onChange={(value) => {
              setCategory(value);
              setPage(1);
            }}
            options={Object.values(VehicleCategory).map((c) => ({
              value: c,
              label: CATEGORY_LABEL[c] ?? c,
            }))}
          />
          <Select
            allowClear
            placeholder="Статус"
            style={{ width: 150 }}
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={Object.values(VehicleStatus).map((s) => ({
              value: s,
              label: STATUS_LABEL[s] ?? s,
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
              Поставить на учёт
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
          showTotal: (total) => `Всего: ${total}`,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          },
        }}
        columns={[
          {
            title: 'Фото',
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
                <Tooltip title="Показать фото">
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
          { title: 'Гаражный', dataIndex: 'garageNumber', width: 120 },
          { title: 'Госномер', dataIndex: 'plateNumber', width: 140 },
          {
            title: 'Категория',
            dataIndex: 'category',
            render: (value: string) => CATEGORY_LABEL[value] ?? value,
          },
          {
            title: 'Модель',
            dataIndex: 'model',
            render: (model: VehicleRow['model']) =>
              model ? `${model.manufacturer} ${model.model}` : '—',
          },
          {
            title: 'Статус',
            dataIndex: 'status',
            width: 120,
            render: (value: string) => (
              <Tag color={STATUS_COLOR[value] ?? 'default'}>{STATUS_LABEL[value] ?? value}</Tag>
            ),
          },
          {
            title: 'Одометр, км',
            dataIndex: 'currentOdometer',
            width: 120,
            align: 'right',
            render: (value: string | null) => fmt(value),
          },
          {
            title: 'Моточасы',
            dataIndex: 'currentEngineHours',
            width: 110,
            align: 'right',
            render: (value: string | null) => fmt(value),
          },
          {
            title: 'В баке, л',
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
                  <Tooltip title="Изменить">
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
                  <Tooltip title="Передать в другой аэропорт">
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
                    title="Списать технику с учёта?"
                    description="Документы за прошлые периоды сохранятся."
                    okText="Списать"
                    cancelText="Отмена"
                    onConfirm={() => remove.mutate(row.id)}
                  >
                    <Tooltip title="Списать">
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
        okText="Передать"
        cancelText="Отмена"
        confirmLoading={transfer.isPending}
        onCancel={() => setTransferFor(null)}
        onOk={() => {
          void transferForm.validateFields().then((values) => {
            transfer.mutate(values, { onSuccess: () => setTransferFor(null) });
          });
        }}
      >
        <Typography.Paragraph type="secondary">
          Текущий период приписки будет закрыт, откроется новый. Отчёты за прошлые периоды
          останутся за нынешним офисом.
        </Typography.Paragraph>
        <Form form={transferForm} layout="vertical">
          <Form.Item
            name="targetOfficeId"
            label="Офис назначения"
            rules={[{ required: true, message: 'Выберите офис' }]}
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
            label="Дата передачи"
            rules={[{ required: true, message: 'Укажите дату' }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
          </Form.Item>
          <Form.Item name="reason" label="Основание">
            <Input placeholder="Приказ № ... от ..." />
          </Form.Item>
        </Form>
      </Modal>
    </TableCard>
  );
}
