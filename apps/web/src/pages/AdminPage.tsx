import { useQuery } from '@tanstack/react-query';
import {
  Checkbox,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { MeterType, PERMISSIONS, VehicleCategory } from '@gsm/shared';

import { api } from '@/api/client';
import { useDictionaries } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { StickyTable } from '@/components/StickyTable';
import { TableCard } from '@/components/TableCard';
import { CATEGORY_LABEL, METER_LABEL, fmt } from '@/lib/labels';

import { CrudPanel } from './admin/CrudPanel';
import { OfficesPanel } from './admin/OfficesPanel';

interface FuelTypeRow {
  id: number;
  code: string;
  name: string;
  density: string;
  isActive: boolean;
  _count: { vehicles: number; tanks: number };
}

interface VehicleModelRow {
  id: number;
  category: string;
  manufacturer: string;
  model: string;
  meterType: string;
  tankCapacity: string | null;
  fuelTypeId: number | null;
  seats: number | null;
  isActive: boolean;
  _count: { vehicles: number };
}

interface DepartmentRow {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  _count: { vehicles: number; drivers: number };
}

interface CounterpartyRow {
  id: number;
  name: string;
  inn: string | null;
  isFuelSupplier: boolean;
  isServiceProvider: boolean;
  contactPhone: string | null;
  isActive: boolean;
}

interface SparePartRow {
  id: number;
  code: string;
  name: string;
  unit: string;
  catalogNumber: string | null;
  isActive: boolean;
}

const activeTag = (isActive: boolean) =>
  isActive ? <Tag color="green">активен</Tag> : <Tag>отключён</Tag>;

export function AdminPage() {
  const { can } = useAuth();
  const dictionaries = useDictionaries();

  const fuelTypes = useQuery({
    queryKey: ['fuel-types-lookup'],
    queryFn: async () =>
      (await api.get<FuelTypeRow[]>('/dictionaries/fuel-types')).data,
  });

  if (!can(PERMISSIONS.DICTIONARY_READ)) {
    return <Typography.Text type="danger">Нет прав на просмотр справочников</Typography.Text>;
  }

  const canManage = can(PERMISSIONS.DICTIONARY_MANAGE);

  return (
    <TableCard title="Администрирование">
      <Tabs
        items={[
          {
            key: 'fuel-types',
            label: 'Виды топлива',
            children: (
              <CrudPanel<FuelTypeRow>
                url="/dictionaries/fuel-types"
                queryKey="fuel-types"
                title="Вид топлива"
                canManage={canManage}
                invalidateExtra={[['fuel-types-lookup']]}
                description={
                  <>
                    Справочник общий для всех аэропортов. Плотность нужна для перевода
                    литров в тонны — бухгалтерия считает ГСМ в килограммах.
                  </>
                }
                columns={[
                  { title: 'Код', dataIndex: 'code', width: 110 },
                  { title: 'Наименование', dataIndex: 'name' },
                  {
                    title: 'Плотность, кг/л',
                    dataIndex: 'density',
                    width: 140,
                    align: 'right',
                    render: (value: string) => fmt(value, 3),
                  },
                  {
                    title: 'Используется',
                    width: 160,
                    render: (_: unknown, row: FuelTypeRow) =>
                      `${row._count.vehicles} ед. техники, ${row._count.tanks} ёмк.`,
                  },
                  {
                    title: 'Статус',
                    dataIndex: 'isActive',
                    width: 110,
                    render: activeTag,
                  },
                ]}
                formFields={(isEdit) => (
                  <>
                    <Form.Item
                      name="code"
                      label="Код"
                      tooltip="После создания не меняется: на него ссылаются выгрузки"
                      rules={[
                        { required: true, message: 'Обязательное поле' },
                        {
                          pattern: /^[A-Z0-9-]+$/,
                          message: 'Заглавные латинские буквы, цифры и дефис',
                        },
                      ]}
                    >
                      <Input disabled={isEdit} placeholder="DT" />
                    </Form.Item>
                    <Form.Item name="name" label="Наименование" rules={[{ required: true }]}>
                      <Input placeholder="Дизельное топливо" />
                    </Form.Item>
                    <Form.Item name="density" label="Плотность, кг/л при +20 °C">
                      <InputNumber min={0.3} max={1.5} step={0.001} style={{ width: '100%' }} />
                    </Form.Item>
                    {isEdit && (
                      <Form.Item name="isActive" label="Активен" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    )}
                  </>
                )}
              />
            ),
          },
          {
            key: 'vehicle-models',
            label: 'Модели техники',
            children: (
              <CrudPanel<VehicleModelRow>
                url="/dictionaries/vehicle-models"
                queryKey="vehicle-models"
                title="Модель техники"
                canManage={canManage}
                description={
                  <>
                    Справочник общий для всех аэропортов намеренно: только так можно
                    сравнить расход одинаковых тягачей в Ташкенте и Бухаре. Тип счётчика
                    определяет, по какой базе считается норма расхода.
                  </>
                }
                columns={[
                  { title: 'Производитель', dataIndex: 'manufacturer', width: 160 },
                  { title: 'Модель', dataIndex: 'model', width: 160 },
                  {
                    title: 'Категория',
                    dataIndex: 'category',
                    render: (value: string) => CATEGORY_LABEL[value] ?? value,
                  },
                  {
                    title: 'Счётчик',
                    dataIndex: 'meterType',
                    width: 180,
                    render: (value: string) => METER_LABEL[value] ?? value,
                  },
                  {
                    title: 'Бак, л',
                    dataIndex: 'tankCapacity',
                    width: 90,
                    align: 'right',
                    render: (value: string | null) => fmt(value),
                  },
                  {
                    title: 'В парке',
                    width: 90,
                    align: 'right',
                    render: (_: unknown, row: VehicleModelRow) => row._count.vehicles,
                  },
                  { title: 'Статус', dataIndex: 'isActive', width: 110, render: activeTag },
                ]}
                formFields={(isEdit) => (
                  <>
                    <Form.Item
                      name="manufacturer"
                      label="Производитель"
                      rules={[{ required: true }]}
                    >
                      <Input placeholder="COBUS" />
                    </Form.Item>
                    <Form.Item name="model" label="Модель" rules={[{ required: true }]}>
                      <Input placeholder="3000" />
                    </Form.Item>
                    <Form.Item name="category" label="Категория" rules={[{ required: true }]}>
                      <Select
                        showSearch
                        optionFilterProp="label"
                        options={Object.values(VehicleCategory).map((value) => ({
                          value,
                          label: CATEGORY_LABEL[value] ?? value,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item
                      name="meterType"
                      label="Тип счётчика"
                      tooltip="У тягачей основная база — моточасы, у автобусов — пробег"
                    >
                      <Select
                        options={Object.values(MeterType).map((value) => ({
                          value,
                          label: METER_LABEL[value] ?? value,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item name="fuelTypeId" label="Вид топлива">
                      <Select
                        allowClear
                        options={(fuelTypes.data ?? []).map((item) => ({
                          value: item.id,
                          label: item.name,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item name="tankCapacity" label="Ёмкость бака, л">
                      <InputNumber min={0} max={100000} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="seats" label="Число мест">
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    {isEdit && (
                      <Form.Item name="isActive" label="Активна" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    )}
                  </>
                )}
              />
            ),
          },
          {
            key: 'departments',
            label: 'Подразделения',
            children: (
              <CrudPanel<DepartmentRow>
                url="/dictionaries/departments"
                queryKey="departments"
                title="Подразделение"
                canManage={canManage}
                description="Подразделения принадлежат активному офису и не видны другим аэропортам."
                columns={[
                  { title: 'Код', dataIndex: 'code', width: 110 },
                  { title: 'Наименование', dataIndex: 'name' },
                  {
                    title: 'Закреплено',
                    width: 200,
                    render: (_: unknown, row: DepartmentRow) =>
                      `${row._count.vehicles} ед. техники, ${row._count.drivers} водителей`,
                  },
                  { title: 'Статус', dataIndex: 'isActive', width: 110, render: activeTag },
                ]}
                formFields={(isEdit) => (
                  <>
                    <Form.Item name="code" label="Код" rules={[{ required: true }]}>
                      <Input disabled={isEdit} placeholder="SST" />
                    </Form.Item>
                    <Form.Item name="name" label="Наименование" rules={[{ required: true }]}>
                      <Input placeholder="Служба спецтранспорта" />
                    </Form.Item>
                    {isEdit && (
                      <Form.Item name="isActive" label="Активно" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    )}
                  </>
                )}
              />
            ),
          },
          {
            key: 'counterparties',
            label: 'Контрагенты',
            children: (
              <CrudPanel<CounterpartyRow>
                url="/dictionaries/counterparties"
                queryKey="counterparties"
                title="Контрагент"
                canManage={canManage}
                description="Поставщики ГСМ и подрядчики по ремонту. Свои у каждого аэропорта."
                columns={[
                  { title: 'Наименование', dataIndex: 'name' },
                  { title: 'ИНН', dataIndex: 'inn', width: 130 },
                  {
                    title: 'Роль',
                    width: 220,
                    render: (_: unknown, row: CounterpartyRow) => (
                      <>
                        {row.isFuelSupplier && <Tag color="blue">поставщик ГСМ</Tag>}
                        {row.isServiceProvider && <Tag color="purple">подрядчик</Tag>}
                      </>
                    ),
                  },
                  { title: 'Телефон', dataIndex: 'contactPhone', width: 160 },
                  { title: 'Статус', dataIndex: 'isActive', width: 110, render: activeTag },
                ]}
                formFields={(isEdit) => (
                  <>
                    <Form.Item name="name" label="Наименование" rules={[{ required: true }]}>
                      <Input placeholder="АО «Узбекнефтепродукт»" />
                    </Form.Item>
                    <Form.Item name="inn" label="ИНН">
                      <Input />
                    </Form.Item>
                    <Form.Item name="isFuelSupplier" valuePropName="checked">
                      <Checkbox>Поставщик ГСМ</Checkbox>
                    </Form.Item>
                    <Form.Item name="isServiceProvider" valuePropName="checked">
                      <Checkbox>Подрядчик по ремонту</Checkbox>
                    </Form.Item>
                    <Form.Item name="contactPhone" label="Телефон">
                      <Input />
                    </Form.Item>
                    <Form.Item name="address" label="Адрес">
                      <Input.TextArea rows={2} />
                    </Form.Item>
                    {isEdit && (
                      <Form.Item name="isActive" label="Активен" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    )}
                  </>
                )}
              />
            ),
          },
          {
            key: 'spare-parts',
            label: 'Запчасти',
            children: (
              <CrudPanel<SparePartRow>
                url="/dictionaries/spare-parts"
                queryKey="spare-parts"
                title="Запчасть"
                canManage={canManage}
                description="Номенклатура общая для всех аэропортов, остатки — свои у каждого склада."
                columns={[
                  { title: 'Код', dataIndex: 'code', width: 150 },
                  { title: 'Наименование', dataIndex: 'name' },
                  { title: 'Ед. изм.', dataIndex: 'unit', width: 100 },
                  { title: 'Каталожный №', dataIndex: 'catalogNumber', width: 160 },
                  { title: 'Статус', dataIndex: 'isActive', width: 110, render: activeTag },
                ]}
                formFields={(isEdit) => (
                  <>
                    <Form.Item name="code" label="Код" rules={[{ required: true }]}>
                      <Input disabled={isEdit} placeholder="FLT-OIL-01" />
                    </Form.Item>
                    <Form.Item name="name" label="Наименование" rules={[{ required: true }]}>
                      <Input placeholder="Фильтр масляный" />
                    </Form.Item>
                    <Form.Item name="unit" label="Единица измерения">
                      <Input placeholder="шт" />
                    </Form.Item>
                    <Form.Item name="catalogNumber" label="Каталожный номер">
                      <Input />
                    </Form.Item>
                    {isEdit && (
                      <Form.Item name="isActive" label="Активна" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    )}
                  </>
                )}
              />
            ),
          },
          {
            key: 'offices',
            label: 'Офисы и аэропорты',
            children: <OfficesPanel />,
          },
          {
            key: 'norms-hint',
            label: 'Нормы расхода',
            children: (
              <>
                <Typography.Paragraph>
                  Нормы задаются на модель техники или на конкретную единицу и версионируются
                  периодом действия. Экран управления нормами ещё не сделан — сейчас они
                  правятся через Swagger либо Prisma Studio.
                </Typography.Paragraph>
                <Typography.Paragraph type="secondary">
                  Это осознанно отложено: нормы утверждаются приказом по предприятию,
                  и форму стоит делать после того, как согласован состав надбавок.
                  Действующие нормы конкретной техники видны в её карточке.
                </Typography.Paragraph>
                <StickyTable
                  size="small"
                  pagination={false}
                  dataSource={dictionaries.data?.vehicleModels.slice(0, 5) ?? []}
                  rowKey="id"
                  rowNumbers
                  columns={[
                    {
                      title: 'Модель',
                      render: (_: unknown, row: { manufacturer: string; model: string }) =>
                        `${row.manufacturer} ${row.model}`,
                    },
                    {
                      title: 'Категория',
                      dataIndex: 'category',
                      render: (value: string) => CATEGORY_LABEL[value] ?? value,
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
    </TableCard>
  );
}
