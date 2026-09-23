import { UploadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, Upload } from 'antd';
import type { UploadFile } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import { violationPhoto } from '@/api/client';
import { useApiMutation, useDictionaries } from '@/api/hooks';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Если задан — карточка открыта из карточки водителя, выбор водителя скрыт. */
  driverId?: number;
  invalidate?: unknown[][];
}

interface DriverOption {
  id: number;
  lastName: string;
  firstName: string;
  personnelNumber: string;
}

interface VehicleOption {
  id: number;
  garageNumber: string;
  plateNumber: string | null;
}

/**
 * Форма оформления нарушения — общая для журнала службы безопасности дорог
 * (/violations, водитель выбирается вручную) и вкладки «Нарушения» в карточке
 * водителя (driverId уже известен и не показывается полем).
 *
 * Фото загружается вторым запросом после создания записи: у StreamableFile-
 * раздачи файла (см. ViolationsController) должен быть id, которого до
 * сохранения формы ещё не существует — тот же порядок, что у фото водителя.
 */
export function ViolationFormModal({ open, onClose, driverId, invalidate = [] }: Props) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const dictionaries = useDictionaries();

  const drivers = useQuery({
    queryKey: ['drivers-lookup'],
    enabled: open && driverId === undefined,
    queryFn: async () =>
      (await api.get('/drivers', { params: { pageSize: 200, isActive: true } })).data as {
        items: DriverOption[];
      },
  });

  const vehicles = useQuery({
    queryKey: ['vehicles-lookup'],
    enabled: open,
    queryFn: async () =>
      (await api.get('/vehicles', { params: { pageSize: 200, status: 'ACTIVE' } })).data as {
        items: VehicleOption[];
      },
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ driverId, occurredAt: dayjs() });
    setFileList([]);
  }, [open, driverId, form]);

  const create = useApiMutation(
    async (values: Record<string, unknown>) => {
      const { data } = await api.post<{ id: number }>('/violations', {
        ...values,
        occurredAt: (values.occurredAt as dayjs.Dayjs).toISOString(),
      });

      const file = fileList[0]?.originFileObj;
      if (file) {
        await violationPhoto.upload(data.id, file);
      }

      return data;
    },
    {
      successMessage: t('Нарушение оформлено'),
      invalidate: [['violations'], ['driver-violations'], ...invalidate],
    },
  );

  const submit = (): void => {
    void form.validateFields().then((values) => {
      create.mutate(values, { onSuccess: () => onClose() });
    });
  };

  const violationTypes = dictionaries.data?.violationTypes ?? [];

  return (
    <Modal
      open={open}
      title={t('Оформление нарушения')}
      okText={t('Сохранить')}
      cancelText={t('Отмена')}
      confirmLoading={create.isPending}
      onCancel={onClose}
      onOk={submit}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        {/*
          Поле остаётся зарегистрированным в форме и со скрытым driverId:
          form.setFieldsValue выше выставляет значение, но без Form.Item
          с этим name оно не попало бы в values при validateFields().
        */}
        <Form.Item
          name="driverId"
          label={t('Водитель')}
          hidden={driverId !== undefined}
          rules={driverId === undefined ? [{ required: true, message: t('Обязательное поле') }] : []}
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={drivers.isLoading}
            options={drivers.data?.items.map((d) => ({
              value: d.id,
              label: `${d.lastName} ${d.firstName} (${d.personnelNumber})`,
            }))}
          />
        </Form.Item>

        <Form.Item name="vehicleId" label={t('Техника')}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            loading={vehicles.isLoading}
            options={vehicles.data?.items.map((v) => ({
              value: v.id,
              label: `${v.garageNumber}${v.plateNumber ? ` · ${v.plateNumber}` : ''}`,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="typeId"
          label={t('Вид нарушения')}
          rules={[{ required: true, message: t('Обязательное поле') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            onChange={(id: number) => {
              const selected = violationTypes.find((item) => item.id === id);
              form.setFieldsValue({
                fineAmount: selected?.defaultFineAmount
                  ? Number(selected.defaultFineAmount)
                  : undefined,
              });
            }}
            options={violationTypes.map((item) => ({ value: item.id, label: item.name }))}
          />
        </Form.Item>

        <Form.Item
          name="occurredAt"
          label={t('Дата и время')}
          rules={[{ required: true, message: t('Обязательное поле') }]}
        >
          <DatePicker showTime format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item name="fineAmount" label={t('Сумма штрафа')}>
          <InputNumber min={0} max={100_000_000} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item name="description" label={t('Описание')}>
          <Input.TextArea rows={3} maxLength={400} />
        </Form.Item>

        <Form.Item label={t('Фото/вложение')}>
          <Upload
            listType="picture"
            maxCount={1}
            accept="image/jpeg,image/png,image/webp,image/heic"
            // На телефоне/планшете сразу открывает камеру, а не только галерею —
            // сотрудник БД фиксирует нарушение на месте, без файлов на устройстве.
            // На десктопе браузер этот атрибут игнорирует и открывает обычный
            // выбор файла, так что это ничего не ломает.
            capture="environment"
            fileList={fileList}
            beforeUpload={() => false}
            onChange={({ fileList: next }) => setFileList(next.slice(-1))}
          >
            <Button icon={<UploadOutlined />}>{t('Сфотографировать / выбрать файл')}</Button>
          </Upload>
        </Form.Item>
      </Form>
    </Modal>
  );
}
