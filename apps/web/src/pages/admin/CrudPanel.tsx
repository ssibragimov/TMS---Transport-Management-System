import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  Form,
  Modal,
  Popconfirm,
  Space,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { FormInstance } from 'antd/es/form';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { StickyTable } from '@/components/StickyTable';

export interface CrudPanelProps<T extends { id: number; isActive?: boolean }> {
  /** Базовый путь ресурса, например `/dictionaries/fuel-types` */
  url: string;
  queryKey: string;
  title: string;
  /** Пояснение, зачем этот справочник и что будет при удалении */
  description?: ReactNode;
  columns: ColumnsType<T>;
  /** Поля формы. Получает признак редактирования: часть полей неизменяема. */
  formFields: (isEdit: boolean, form: FormInstance) => ReactNode;
  /** Значения формы из строки таблицы. По умолчанию — сама строка. */
  toFormValues?: (row: T) => Record<string, unknown>;
  canManage: boolean;
  /** Дополнительные ключи кэша, которые надо сбросить после изменения */
  invalidateExtra?: string[][];
}

/**
 * Универсальная панель справочника.
 *
 * Абстракция оправдана здесь и только здесь: пять справочников отличаются
 * набором полей, но не поведением — список, создание, правка, отключение.
 * Писать это пять раз означало бы пять мест, где надо не забыть сбросить кэш
 * или обработать ошибку.
 */
export function CrudPanel<T extends { id: number; isActive?: boolean }>({
  url,
  queryKey,
  title,
  description,
  columns,
  formFields,
  toFormValues,
  canManage,
  invalidateExtra = [],
}: CrudPanelProps<T>) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [form] = Form.useForm();

  const query = useQuery({
    queryKey: [queryKey, showInactive],
    queryFn: async () =>
      (await api.get<T[]>(url, { params: { includeInactive: showInactive || undefined } })).data,
  });

  const invalidate = [[queryKey], ['dictionaries'], ...invalidateExtra];

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (editing) {
      form.setFieldsValue(toFormValues ? toFormValues(editing) : editing);
    }
  }, [open, editing, form, toFormValues]);

  const save = useApiMutation(
    async (values: Record<string, unknown>) => {
      if (editing) {
        return (await api.patch(`${url}/${editing.id}`, values)).data;
      }
      return (await api.post(url, values)).data;
    },
    { successMessage: editing ? 'Изменения сохранены' : 'Запись добавлена', invalidate },
  );

  const remove = useApiMutation(
    async (id: number) => (await api.delete(`${url}/${id}`)).data,
    { successMessage: 'Запись удалена', invalidate },
  );

  const actionColumn: ColumnsType<T> = canManage
    ? [
        {
          title: '',
          width: 90,
          render: (_: unknown, row: T) => (
            <Space size={0}>
              <Tooltip title="Изменить">
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditing(row);
                    setOpen(true);
                  }}
                />
              </Tooltip>
              <Popconfirm
                title="Удалить запись?"
                description="Если на неё есть ссылки, запись будет отключена, а не удалена."
                okText="Удалить"
                cancelText="Отмена"
                onConfirm={() => remove.mutate(row.id)}
              >
                <Tooltip title="Удалить">
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </Space>
          ),
        },
      ]
    : [];

  return (
    <>
      {description && (
        <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
      )}

      <Space style={{ marginBottom: 12 }} wrap>
        {canManage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Добавить
          </Button>
        )}
        <Checkbox
          checked={showInactive}
          onChange={(event) => setShowInactive(event.target.checked)}
        >
          Показывать отключённые
        </Checkbox>
      </Space>

      <StickyTable<T>
        rowKey="id"
        size="small"
        loading={query.isLoading}
        dataSource={query.data ?? []}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        // Отключённые записи приглушены: они остаются в списке ради истории,
        // но в формах уже не предлагаются.
        rowClassName={(row) => (row.isActive === false ? 'row-inactive' : '')}
        columns={[...columns, ...actionColumn]}
      />

      <Modal
        open={open}
        title={editing ? `${title}: изменение` : `${title}: добавление`}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        onCancel={() => setOpen(false)}
        onOk={() => {
          void form.validateFields().then((values) => {
            save.mutate(values, { onSuccess: () => setOpen(false) });
          });
        }}
      >
        <Form form={form} layout="vertical">
          {formFields(Boolean(editing), form)}
        </Form>
      </Modal>
    </>
  );
}
