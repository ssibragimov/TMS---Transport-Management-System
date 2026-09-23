import { CameraOutlined, LogoutOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Result,
  Select,
  Typography,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@gsm/shared';

import { api, violationPhoto } from '@/api/client';
import { useApiMutation, useDictionaries } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';

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
 * Отдельный экран для сотрудника БД в поле — без бокового меню и таблиц
 * основного приложения: один сценарий на весь экран, крупные поля под
 * палец, фото сразу с камеры. Доступен по прямому адресу /field/violations
 * (и как ярлык PWA при установке — см. manifest.shortcuts в vite.config.ts).
 * Остальной функционал в поле не нужен и только мешал бы на маленьком экране.
 */
export function FieldViolationPage() {
  const { t } = useTranslation();
  const { user, can, logout } = useAuth();
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const dictionaries = useDictionaries();

  const drivers = useQuery({
    queryKey: ['drivers-lookup'],
    queryFn: async () =>
      (await api.get('/drivers', { params: { pageSize: 200, isActive: true } })).data as {
        items: DriverOption[];
      },
  });

  const vehicles = useQuery({
    queryKey: ['vehicles-lookup'],
    queryFn: async () =>
      (await api.get('/vehicles', { params: { pageSize: 200, status: 'ACTIVE' } })).data as {
        items: VehicleOption[];
      },
  });

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
    { invalidate: [['violations'], ['driver-violations']] },
  );

  const submit = (): void => {
    void form.validateFields().then((values) => {
      create.mutate(values, { onSuccess: () => setJustSubmitted(true) });
    });
  };

  const startNext = (): void => {
    form.resetFields();
    form.setFieldsValue({ occurredAt: dayjs() });
    setFileList([]);
    setJustSubmitted(false);
  };

  const violationTypes = dictionaries.data?.violationTypes ?? [];

  if (!can(PERMISSIONS.VIOLATION_MANAGE)) {
    return (
      <div className="gsm-field-page">
        <FieldHeader userName={user?.fullName} onLogout={logout} />
        <div className="gsm-field-body">
          <Result
            status="403"
            title={t('Нет доступа')}
            subTitle={t('У вашей учётной записи нет прав на оформление нарушений')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="gsm-field-page">
      <FieldHeader userName={user?.fullName} onLogout={logout} />

      <div className="gsm-field-body">
        <div className="gsm-field-card">
          {justSubmitted ? (
            <Result
              status="success"
              title={t('Нарушение оформлено')}
              extra={
                <Button
                  type="primary"
                  size="large"
                  icon={<PlusOutlined />}
                  className="gsm-field-submit"
                  onClick={startNext}
                >
                  {t('Оформить ещё одно')}
                </Button>
              }
            />
          ) : (
            <Form
              form={form}
              layout="vertical"
              className="gsm-field-form"
              initialValues={{ occurredAt: dayjs() }}
              scrollToFirstError
            >
              <Form.Item
                name="driverId"
                label={t('Водитель')}
                rules={[{ required: true, message: t('Обязательное поле') }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('Начните вводить фамилию')}
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
                  placeholder={t('Гаражный номер или госномер')}
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
                  capture="environment"
                  fileList={fileList}
                  beforeUpload={() => false}
                  onChange={({ fileList: next }) => setFileList(next.slice(-1))}
                >
                  <Button block size="large" icon={<CameraOutlined />}>
                    {t('Сфотографировать / выбрать файл')}
                  </Button>
                </Upload>
              </Form.Item>

              <Button
                type="primary"
                size="large"
                block
                className="gsm-field-submit"
                loading={create.isPending}
                onClick={submit}
              >
                {t('Сохранить')}
              </Button>
            </Form>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldHeader({ userName, onLogout }: { userName?: string; onLogout: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="gsm-field-header">
      <Typography.Text className="gsm-field-header-title">
        {t('Оформление нарушения')}
      </Typography.Text>
      <div className="gsm-field-header-user">
        {userName && <span className="gsm-field-header-name">{userName}</span>}
        <Button
          type="text"
          icon={<LogoutOutlined />}
          className="gsm-field-header-logout"
          onClick={() => void onLogout()}
        />
      </div>
    </div>
  );
}
