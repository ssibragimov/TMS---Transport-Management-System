import { Checkbox, Col, Form, Input, Modal, Row, Select, Typography } from 'antd';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  STOCK_CATEGORY_LABEL,
  STOCK_TRACKING_LABEL,
  StockCategory,
  StockTracking,
} from '@gsm/shared';

import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';

import type { StockItem } from './types';

/** Карточка позиции номенклатуры. Создание и правка — одна форма. */

interface Props {
  /** null — создание новой позиции */
  item: StockItem | null;
  open: boolean;
  onClose: () => void;
}

/*
 * Единицы измерения не переводятся списком, а идут через t() поштучно:
 * «шт» и «пара» в узбекском разные слова, а «л» и «кг» совпадают с русским
 * написанием только случайно.
 */
const UNITS = ['шт', 'л', 'кг', 'м', 'компл', 'упак', 'пара'];

export function StockItemModal({ item, open, onClose }: Props) {
  const { t } = useTranslation();
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      item ?? {
        unit: 'шт',
        category: StockCategory.SPARE,
        tracking: StockTracking.QUANTITY,
        exchangeRequired: false,
      },
    );
  }, [open, item, form]);

  const save = useApiMutation(
    async (values: Record<string, unknown>) =>
      item
        ? (await api.patch(`/stock/items/${item.id}`, values)).data
        : (await api.post('/stock/items', values)).data,
    {
      successMessage: item ? t('Позиция изменена') : t('Позиция заведена'),
      invalidate: [['stock-items'], ['stock-balances']],
    },
  );

  return (
    <Modal
      open={open}
      width={640}
      title={item ? `${t('Позиция')} · ${item.code}` : t('Новая позиция номенклатуры')}
      okText={t('Сохранить')}
      cancelText={t('Отмена')}
      confirmLoading={save.isPending}
      onCancel={onClose}
      onOk={() => {
        void form.validateFields().then((values) => {
          // Код позиции не меняется после создания: на него ссылаются
          // проведённые документы и отчёты соседних офисов.
          if (item) delete (values as { code?: string }).code;
          save.mutate(values as Record<string, unknown>, { onSuccess: onClose });
        });
      }}
    >
      <Form form={form} layout="vertical">
        <Row gutter={12}>
          <Col span={10}>
            <Form.Item
              name="code"
              label={t('Код')}
              tooltip={t('Уникален для всех аэропортов: по нему сводится расход по стране')}
              rules={[{ required: true, min: 2, max: 48 }]}
            >
              <Input disabled={Boolean(item)} placeholder="OIL-15W40" />
            </Form.Item>
          </Col>
          <Col span={14}>
            <Form.Item
              name="name"
              label={t('Наименование')}
              rules={[{ required: true, min: 2 }]}
            >
              <Input placeholder={t('Масло моторное 15W-40')} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="category" label={t('Категория')} rules={[{ required: true }]}>
              <Select
                options={Object.entries(STOCK_CATEGORY_LABEL).map(([value, label]) => ({
                  value,
                  label: t(label),
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="unit" label={t('Единица')} rules={[{ required: true }]}>
              <Select options={UNITS.map((unit) => ({ value: unit, label: t(unit) }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="catalogNumber" label={t('Каталожный номер')}>
              <Input placeholder={t('необязательно')} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="tracking"
          label={t('Способ учёта')}
          tooltip={t(
            'Поштучный учёт с серийным номером вводится следующим этапом; разметка нужна уже сейчас',
          )}
        >
          <Select
            options={Object.entries(STOCK_TRACKING_LABEL).map(([value, label]) => ({
              value,
              label: t(label),
            }))}
          />
        </Form.Item>

        <Form.Item name="exchangeRequired" valuePropName="checked">
          <Checkbox>{t('Выдаётся в обмен на сданное отработанное')}</Checkbox>
        </Form.Item>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t(
            'Признак для аккумуляторов и шин. При выдаче такой позиции форма предложит принять старое на склад отработанных, а без этого потребует записать причину.',
          )}
        </Typography.Text>
      </Form>
    </Modal>
  );
}
