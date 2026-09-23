import {
  CameraOutlined,
  CarOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FileTextOutlined,
  LogoutOutlined,
  PlusOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { DatePicker, Form, Input, InputNumber, Result, Select, Upload } from 'antd';
import type { UploadFile } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import type { ReactNode } from 'react';
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

/** Подпись поля с иконкой — единый приём для всех полей формы на этом экране. */
function FieldLabel({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="gsm-field-label">
      {icon}
      {text}
    </span>
  );
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
        <FieldHeader user={user} onLogout={logout} />
        <div className="gsm-field-body">
          <div className="gsm-field-card">
            <Result
              status="403"
              title={t('Нет доступа')}
              subTitle={t('У вашей учётной записи нет прав на оформление нарушений')}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gsm-field-page">
      <FieldHeader user={user} onLogout={logout} />

      <div className="gsm-field-body">
        <div className="gsm-field-card">
          {justSubmitted ? (
            <div className="gsm-field-success">
              <div className="gsm-field-success-badge">
                <CheckOutlined />
              </div>
              <div className="gsm-field-success-title">{t('Нарушение оформлено')}</div>
              <button type="button" className="gsm-field-submit" onClick={startNext}>
                <PlusOutlined />
                {t('Оформить ещё одно')}
              </button>
            </div>
          ) : (
            <Form
              form={form}
              layout="vertical"
              className="gsm-field-form"
              initialValues={{ occurredAt: dayjs() }}
              scrollToFirstError
            >
              <div className="gsm-field-section-title">{t('Участники')}</div>

              <Form.Item
                name="driverId"
                label={<FieldLabel icon={<UserOutlined />} text={t('Водитель')} />}
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

              <Form.Item
                name="vehicleId"
                label={<FieldLabel icon={<CarOutlined />} text={t('Техника')} />}
              >
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

              <div className="gsm-field-section-title">{t('Нарушение')}</div>

              <Form.Item
                name="typeId"
                label={<FieldLabel icon={<WarningOutlined />} text={t('Вид нарушения')} />}
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
                label={<FieldLabel icon={<ClockCircleOutlined />} text={t('Дата и время')} />}
                rules={[{ required: true, message: t('Обязательное поле') }]}
              >
                <DatePicker showTime format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                name="fineAmount"
                label={<FieldLabel icon={<DollarOutlined />} text={t('Сумма штрафа')} />}
              >
                <InputNumber min={0} max={100_000_000} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                name="description"
                label={<FieldLabel icon={<FileTextOutlined />} text={t('Описание')} />}
              >
                <Input.TextArea rows={3} maxLength={400} />
              </Form.Item>

              <div className="gsm-field-section-title">{t('Доказательство')}</div>

              <Form.Item>
                <Upload
                  listType="picture-card"
                  maxCount={1}
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  capture="environment"
                  fileList={fileList}
                  className="gsm-field-photo-upload"
                  beforeUpload={() => false}
                  onChange={({ fileList: next }) => setFileList(next.slice(-1))}
                >
                  {fileList.length === 0 && (
                    <span className="gsm-field-photo-placeholder">
                      <CameraOutlined />
                      {t('Сфотографировать')}
                    </span>
                  )}
                </Upload>
              </Form.Item>

              <button
                type="button"
                className="gsm-field-submit"
                disabled={create.isPending}
                onClick={submit}
              >
                {create.isPending ? t('Сохранение…') : t('Сохранить')}
              </button>
            </Form>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldHeader({
  user,
  onLogout,
}: {
  user: { fullName: string; activeOffice: { name: string } } | null;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const initial = user?.fullName?.trim().charAt(0).toUpperCase() ?? '?';

  return (
    <div className="gsm-field-header">
      <div className="gsm-field-header-brand">
        <img src="/favicon.svg" alt="" className="gsm-field-header-logo" />
        <div className="gsm-field-header-titles">
          <span className="gsm-field-header-title">{t('Оформление нарушения')}</span>
          {user && <span className="gsm-field-header-subtitle">{user.activeOffice.name}</span>}
        </div>
      </div>
      <div className="gsm-field-header-user">
        <span className="gsm-field-avatar">{initial}</span>
        <button
          type="button"
          className="gsm-field-header-logout"
          aria-label={t('Выйти')}
          onClick={() => void onLogout()}
        >
          <LogoutOutlined />
        </button>
      </div>
    </div>
  );
}
