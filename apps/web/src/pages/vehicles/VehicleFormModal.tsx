import {
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Switch,
} from 'antd';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { MeterType, OwnershipType, VehicleCategory, VehicleStatus } from '@gsm/shared';

import { CardTitle } from '@/components/EntityId';
import { api } from '@/api/client';
import { useApiMutation, useDictionaries } from '@/api/hooks';
import {
  CATEGORY_LABEL,
  METER_LABEL,
  OWNERSHIP_LABEL,
  STATUS_LABEL,
} from '@/lib/labels';

export interface VehicleFormValues {
  id?: number;
  garageNumber: string;
  plateNumber?: string;
  vin?: string;
  inventoryNumber?: string;
  category: string;
  modelId: number;
  departmentId?: number;
  fuelTypeId?: number;
  meterType?: string;
  ownership?: string;
  tankCapacity?: number;
  currentOdometer?: number;
  currentEngineHours?: number;
  manufactureYear?: number;
  commissionedAt?: string;
  requiresAirsidePermit?: boolean;
  notes?: string;
  status?: string;
}

interface Props {
  open: boolean;
  /** null — создание, иначе редактирование */
  initial: VehicleFormValues | null;
  onClose: () => void;
}

export function VehicleFormModal({ open, initial, onClose }: Props) {
  const { t } = useTranslation();

  const [form] = Form.useForm();
  const dictionaries = useDictionaries();
  const isEdit = Boolean(initial?.id);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (initial) {
      form.setFieldsValue({
        ...initial,
        commissionedAt: initial.commissionedAt ? dayjs(initial.commissionedAt) : undefined,
      });
    }
  }, [open, initial, form]);

  const save = useApiMutation(
    async (values: Record<string, unknown>) => {
      const payload: Record<string, unknown> = {
        ...values,
        commissionedAt: values.commissionedAt
          ? (values.commissionedAt as dayjs.Dayjs).format('YYYY-MM-DD')
          : undefined,
      };
      if (isEdit) {
        // При редактировании начальные показания счётчиков не отправляем:
        // их правит отдельная операция корректировки, оставляющая след.
        delete payload.currentOdometer;
        delete payload.currentEngineHours;
        const { data } = await api.patch(`/vehicles/${initial!.id}`, payload);
        return data;
      }
      const { data } = await api.post('/vehicles', payload);
      return data;
    },
    {
      successMessage: isEdit ? 'Карточка обновлена' : 'Техника поставлена на учёт',
      invalidate: [['vehicles'], ['office-summary']],
    },
  );

  /** Подстановка характеристик из справочника моделей — чтобы не вводить руками. */
  const applyModelDefaults = (modelId: number): void => {
    const model = dictionaries.data?.vehicleModels.find((m) => m.id === modelId);
    if (!model) return;
    form.setFieldsValue({
      category: model.category,
      meterType: model.meterType,
      fuelTypeId: model.fuelTypeId ?? undefined,
      tankCapacity: model.tankCapacity ? Number(model.tankCapacity) : undefined,
    });
  };

  return (
    <Modal
      open={open}
      title={<CardTitle title={isEdit ? `Техника ${initial?.garageNumber}` : 'Постановка техники на учёт'} id={initial?.id} />}
      okText={t("Сохранить")}
      cancelText={t("Отмена")}
      confirmLoading={save.isPending}
      width={760}
      onCancel={onClose}
      onOk={() => {
        void form.validateFields().then((values) => {
          save.mutate(values, { onSuccess: onClose });
        });
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ requiresAirsidePermit: true }}>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="garageNumber"
              label={t("Гаражный номер")}
              rules={[{ required: true, message: t("Обязательное поле") }]}
            >
              <Input placeholder={t("А-101")} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="plateNumber" label={t("Госномер")}>
              <Input placeholder="01 A 123 AA" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="inventoryNumber" label={t("Инвентарный номер")}>
              <Input placeholder={t("ОС-12345")} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="modelId"
              label={t("Модель")}
              rules={[{ required: true, message: t("Выберите модель") }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={dictionaries.isLoading}
                onChange={applyModelDefaults}
                options={dictionaries.data?.vehicleModels.map((m) => ({
                  value: m.id,
                  label: `${m.manufacturer} ${m.model}`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="category"
              label={t("Категория")}
              rules={[{ required: true, message: t("Выберите категорию") }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={Object.values(VehicleCategory).map((c) => ({
                  value: c,
                  label: t(CATEGORY_LABEL[c] ?? c),
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="departmentId" label={t("Подразделение")}>
              <Select
                allowClear
                options={dictionaries.data?.departments.map((d) => ({
                  value: d.id,
                  label: d.name,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="fuelTypeId" label={t("Вид топлива")}>
              <Select
                allowClear
                options={dictionaries.data?.fuelTypes.map((f) => ({
                  value: f.id,
                  label: f.name,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="meterType"
              label={t("Счётчик")}
              tooltip={t("Определяет, по какой базе считается норма расхода")}
            >
              <Select
                options={Object.values(MeterType).map((m) => ({
                  value: m,
                  label: t(METER_LABEL[m] ?? m),
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={6}>
            <Form.Item name="tankCapacity" label={t("Ёмкость бака, л")}>
              <InputNumber min={0} max={100000} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="ownership" label={t("Владение")}>
              <Select
                options={Object.values(OwnershipType).map((o) => ({
                  value: o,
                  label: t(OWNERSHIP_LABEL[o] ?? o),
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="manufactureYear" label={t("Год выпуска")}>
              <InputNumber min={1950} max={2100} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="commissionedAt" label={t("Дата ввода в эксплуатацию")}>
              <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
            </Form.Item>
          </Col>
        </Row>

        {!isEdit && (
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="currentOdometer"
                label={t("Одометр при постановке, км")}
                tooltip={t("Позже изменяется только корректировкой с указанием основания")}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="currentEngineHours" label={t("Моточасы при постановке")}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        )}

        <Row gutter={16}>
          {isEdit && (
            <Col span={8}>
              <Form.Item name="status" label={t("Статус")}>
                <Select
                  options={Object.values(VehicleStatus).map((s) => ({
                    value: s,
                    label: t(STATUS_LABEL[s] ?? s),
                  }))}
                />
              </Form.Item>
            </Col>
          )}
          <Col span={8}>
            <Form.Item
              name="requiresAirsidePermit"
              label={t("Нужен допуск на перрон")}
              valuePropName="checked"
              tooltip={t("Если включено, водителя без действующего допуска система не выпустит в смену")}
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="vin" label="VIN">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="notes" label={t("Примечание")}>
          <Input.TextArea rows={2} maxLength={2000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
