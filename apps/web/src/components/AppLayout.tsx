import {
  BarChartOutlined,
  CarOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  FileTextOutlined,
  MedicineBoxOutlined,
  HistoryOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SafetyOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { Permission } from '@gsm/shared';
import { PERMISSIONS } from '@gsm/shared';
import { Dropdown, Layout, Menu, Select, Space, Tag, Tooltip, Typography } from 'antd';

import { HeaderClock } from '@/components/HeaderClock';
import { UserAvatar } from '@/components/UserAvatar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/AuthContext';
import { LocaleFlag } from '@/components/LocaleFlag';
import { OfficeLogo } from '@/components/OfficeLogo';
import i18n, { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, localeDescriptor } from '@/i18n';
import { roleLabel } from '@/lib/labels';

const { Header, Sider, Content } = Layout;

const COLLAPSED_KEY = 'gsm.sidebarCollapsed';

export function AppLayout() {
  const { t } = useTranslation();
  const { user, logout, switchOffice, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Состояние меню запоминается: диспетчер, свернувший меню ради ширины
  // таблицы, не должен разворачивать его заново после каждого входа.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === '1',
  );

  const toggleCollapsed = (): void => {
    setCollapsed((previous) => {
      localStorage.setItem(COLLAPSED_KEY, previous ? '0' : '1');
      return !previous;
    });
  };

  // Разделы, на которые нет прав, из меню убираются: пункт, ведущий
  // на экран «нет прав», только раздражает. Права всё равно проверяются
  // на сервере — меню лишь отражает их.
  const allItems: Array<{
    key: string;
    icon: JSX.Element;
    label: string;
    permission?: Permission;
  }> = [
    { key: '/', icon: <DashboardOutlined />, label: t('Главная') },
    {
      key: '/vehicles',
      icon: <CarOutlined />,
      label: t('Транспорт'),
      permission: PERMISSIONS.VEHICLE_READ,
    },
    {
      key: '/drivers',
      icon: <TeamOutlined />,
      label: t('Водители'),
      permission: PERMISSIONS.DRIVER_READ,
    },
    {
      key: '/fuel',
      icon: <ToolOutlined />,
      label: t('ГСМ'),
      permission: PERMISSIONS.FUEL_READ,
    },
    {
      key: '/waybills',
      icon: <FileTextOutlined />,
      label: t('Путевые листы'),
      permission: PERMISSIONS.WAYBILL_READ,
    },
    {
      key: '/medical',
      icon: <MedicineBoxOutlined />,
      label: t('Здравпункт'),
      permission: PERMISSIONS.DRIVER_READ,
    },
    {
      key: '/technical',
      icon: <ToolOutlined />,
      label: t('Техконтроль'),
      permission: PERMISSIONS.VEHICLE_READ,
    },
    {
      key: '/stock',
      icon: <InboxOutlined />,
      label: t('Склад ТМЦ'),
      permission: PERMISSIONS.STOCK_READ,
    },
    {
      key: '/telemetry',
      icon: <EnvironmentOutlined />,
      label: t('Телеметрия'),
      permission: PERMISSIONS.TELEMETRY_READ,
    },
    {
      key: '/reports',
      icon: <BarChartOutlined />,
      label: t('Отчёты'),
      permission: PERMISSIONS.REPORT_READ,
    },
    {
      key: '/users',
      icon: <SafetyOutlined />,
      label: t('Пользователи'),
      permission: PERMISSIONS.USER_READ,
    },
    {
      key: '/admin',
      icon: <DatabaseOutlined />,
      label: t('Администрирование'),
      permission: PERMISSIONS.DICTIONARY_READ,
    },
    {
      key: '/audit',
      icon: <HistoryOutlined />,
      label: t('Журнал действий'),
      permission: PERMISSIONS.AUDIT_READ,
    },
  ];

  const menuItems = allItems
    .filter((item) => !item.permission || can(item.permission))
    .map(({ key, icon, label }) => ({ key, icon, label }));

  const changeLocale = (locale: string): void => {
    // Запись в localStorage делает выбор «явным»: с этого момента язык
    // из профиля его больше не перебивает (см. AuthContext).
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    void i18n.changeLanguage(locale);
  };

  const activeOffice = user?.activeOffice;

  /*
   * Должность под именем пользователя.
   *
   * Ролей может быть несколько — человек бывает диспетчером и механиком
   * одновременно, — поэтому перечисляем все. Незнакомый код роли выводим
   * как есть: роли заводятся администратором, и подписи для новых в словаре
   * не будет. Перерисовка при смене языка приходит от useTranslation выше,
   * поэтому i18n.language здесь всегда актуален.
   */
  const roleTitle =
    user?.roles?.length
      ? user.roles.map((code) => roleLabel(code, i18n.language)).join(', ')
      : t('Роль не назначена');

  return (
    /*
      Шапка — верхний уровень разметки, а меню лежит под ней.
      Так шапка занимает всю ширину окна и не зависит от того, свёрнуто
      меню или нет: при переключении разделов она остаётся неподвижной.
    */
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        className="gsm-header"
        style={{
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingInline: 16,
          gap: 12,
        }}
      >
        {/*
          Переключатель офиса вынесен в шапку намеренно: пользователь
          должен постоянно видеть, данные какого аэропорта перед ним.
          Ошибка «внёс путевой лист не в тот офис» стоит дорого.
        */}
        <Space size="middle">
          {/* Логотип рядом с названием офиса: связка «эмблема — название»
              читается как одно целое и не теряется при сворачивании меню. */}
          <OfficeLogo
            officeId={activeOffice?.id}
            code={activeOffice?.iataCode ?? activeOffice?.code ?? 'ГСМ'}
            height={40}
            variant="light"
          />

          <Select
            value={user?.activeOffice.id}
            style={{ minWidth: 240 }}
            onChange={(officeId) => void switchOffice(officeId)}
            options={user?.availableOffices.map((office) => ({
              value: office.id,
              label: `${office.code} — ${office.name}`,
            }))}
            disabled={(user?.availableOffices.length ?? 0) < 2}
          />
          <Tag color="blue">{user?.activeOffice.iataCode ?? user?.activeOffice.code}</Tag>
        </Space>

        <Space size="middle">
          <HeaderClock />

          <Select
            value={localeDescriptor(i18n.language).code}
            style={{ width: 140 }}
            onChange={changeLocale}
            optionLabelProp="label"
            options={SUPPORTED_LOCALES.map((locale) => ({
              value: locale.code,
              label: (
                <Space size={8}>
                  <LocaleFlag code={locale.flag} />
                  {locale.label}
                </Space>
              ),
            }))}
          />

          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: t('Выйти'),
                  onClick: () => void logout(),
                },
              ],
            }}
          >
            {/* Фотография рядом с именем: по лицу свою учётку узнают быстрее,
                чем по строке текста, — особенно на общем рабочем месте,
                где за компьютер садятся посменно.

                Должность в подсказке, а не в строке: на общем рабочем месте
                важно с одного взгляда убедиться, под чьими правами работаешь,
                но в шапке для неё нет места. */}
            <Space style={{ cursor: 'pointer' }} size={10}>
              <UserAvatar
                userId={user?.id}
                fullName={user?.fullName}
                photoKey={user?.photoKey}
                size={36}
              />
              {/* Должность строкой под именем, а не подсказкой при наведении:
                  всплывающая подсказка перекрывалась выпадающим меню выхода,
                  которое открывается по тому же наведению. */}
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                <Typography.Text strong>{user?.fullName}</Typography.Text>
                <Typography.Text
                  type="secondary"
                  style={{ fontSize: 12 }}
                  // Ролей может быть несколько; в строку помещается не всё,
                  // поэтому длинный перечень обрезается многоточием.
                  ellipsis={{ tooltip: false }}
                >
                  {roleTitle}
                </Typography.Text>
              </div>
            </Space>
          </Dropdown>
        </Space>
      </Header>

      <Layout>
        <Sider
          className="gsm-sider"
          theme="dark"
          breakpoint="lg"
          collapsedWidth={64}
          width={220}
          collapsed={collapsed}
          onCollapse={(value) => {
            // Срабатывает и при переходе через контрольную точку ширины:
            // сохраняем, чтобы состояние не разошлось с кнопкой.
            localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
            setCollapsed(value);
          }}
        >
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
          />

          {/*
            Кнопка сворачивания прижата к низу меню: список разделов
            растягивается на всю доступную высоту (см. styles.css), поэтому
            кнопка оказывается под ним независимо от числа пунктов.
          */}
          <Tooltip
            title={collapsed ? t('Развернуть меню') : t('Свернуть меню')}
            placement="right"
          >
            <button
              type="button"
              className="gsm-sider-toggle"
              aria-label={collapsed ? t('Развернуть меню') : t('Свернуть меню')}
              onClick={toggleCollapsed}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              {!collapsed && <span>{t('Свернуть меню')}</span>}
            </button>
          </Tooltip>
        </Sider>

        {/* minWidth: 0 обязателен: без него флекс-элемент не даёт широкой
            таблице сжаться, страница уезжает вбок и первые колонки
            оказываются под меню. */}
        <Content style={{ margin: 24, minWidth: 0 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
