import { Form, Input, InputNumber, Modal, Select, Switch } from 'antd';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import { useApiMutation, useDictionaries } from '@/api/hooks';

export interface TankRecord {
  id: number;
  code: string;
  name: string;
  capacity: string;
  currentVolume: string;
  minVolume: string;
  location: string | null;
  isActive: boolean;
  fuelType: { id: number; code: string; name: string };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Если задан — редактирование существующей ёмкости, иначе создание новой. */
  tank?: TankRecord | null;
}

/**
 * Форма ёмкости хранения топлива. Отдельная от общей модали ГСМ
 * (приход/выдача/инвентаризация в FuelPage), потому что у неё другой
 * жизненный цикл — редактирование существующей записи, а не разовый
 * документ, и другой набор полей (паспортные данные ёмкости, а не движение
 * топлива).
 */
export function TankFormModal({ open, onClose, tank }: Props) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const dictionaries = useDictionaries();
  const isEdit = tank != null;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (tank) {
      form.setFieldsValue({
        fuelTypeId: tank.fuelType.id,
        code: tank.code,
        name: tank.name,
        capacity: Number(tank.capacity),
        minVolume: Number(tank.minVolume),
        location: tank.location ?? undefined,
        isActive: tank.isActive,
      });
    }
  }, [open, tank, form]);

  const invalidate = [['fuel-tanks']];

  const create = useApiMutation(
    async (values: Record<string, unknown>) => (await api.post('/fuel/tanks', values)).data,
    { successMessage: t('Ёмкость добавлена'), invalidate },
  );

  const update = useApiMutation(
    async (values: Record<string, unknown>) =>
      (await api.patch(`/fuel/tanks/${tank!.id}`, values)).data,
    { successMessage: t('Ёмкость изменена'), invalidate },
  );

  const submit = (): void => {
    void form.validateFields().then((values) => {
      const mutation = isEdit ? update : create;
      mutation.mutate(values, { onSuccess: () => onClose() });
    });
  };

  return (
    <Modal
      open={open}
      title={isEdit ? t('Изменить ёмкость') : t('Новая ёмкость')}
      okText={t('Сохранить')}
      cancelText={t('Отмена')}
      confirmLoading={create.isPending || update.isPending}
      onCancel={onClose}
      onOk={submit}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="fuelTypeId"
          label={t('Вид топлива')}
          rules={[{ required: true, message: t('Обязательное поле') }]}
        >
          <Select
            options={dictionaries.data?.fuelTypes.map((ft) => ({ value: ft.id, label: ft.name }))}
          />
        </Form.Item>

        <Form.Item
          name="code"
          label={t('Код')}
          tooltip={t('Короткий код, уникальный в пределах офиса, например REZ-2')}
          rules={[{ required: true, message: t('Обязательное поле') }, { max: 24 }]}
        >
          <Input placeholder="REZ-2" />
        </Form.Item>

        <Form.Item
          name="name"
          label={t('Название')}
          rules={[{ required: true, message: t('Обязательное поле') }, { max: 160 }]}
        >
          <Input placeholder={t('Резервуар ДТ №2')} />
        </Form.Item>

        <Form.Item
          name="capacity"
          label={t('Вместимость, л')}
          rules={[{ required: true, message: t('Обязательное поле') }]}
        >
          <InputNumber min={1} max={10_000_000} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="minVolume"
          label={t('Порог низкого остатка, л')}
          tooltip={t('Ниже этого остатка ёмкость подсвечивается как требующая внимания')}
        >
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>

        {!isEdit && (
          <Form.Item
            name="currentVolume"
            label={t('Текущий остаток, л')}
            tooltip={t(
              'Если ёмкость уже эксплуатируется и в ней есть топливо — укажите остаток на момент постановки на учёт. По умолчанию 0.',
            )}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        )}

        <Form.Item name="location" label={t('Расположение')}>
          <Input placeholder={t('Топливный склад, сектор B')} />
        </Form.Item>

        {isEdit && (
          <Form.Item
            name="isActive"
            label={t('Активна')}
            valuePropName="checked"
            tooltip={t('Выключенная ёмкость остаётся в истории, но не предлагается для новых операций')}
          >
            <Switch />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
