import {
  BarChartOutlined,
  CarOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FileTextOutlined,
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
import { Button, Dropdown, Layout, Menu, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/AuthContext';
import { LocaleFlag } from '@/components/LocaleFlag';
import { OfficeLogo } from '@/components/OfficeLogo';
import i18n, { SUPPORTED_LOCALES, localeDescriptor } from '@/i18n';

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
    { key: '/', icon: <DashboardOutlined />, label: t('nav.dashboard') },
    {
      key: '/vehicles',
      icon: <CarOutlined />,
      label: t('nav.vehicles'),
      permission: PERMISSIONS.VEHICLE_READ,
    },
    {
      key: '/drivers',
      icon: <TeamOutlined />,
      label: t('nav.drivers'),
      permission: PERMISSIONS.DRIVER_READ,
    },
    {
      key: '/fuel',
      icon: <ToolOutlined />,
      label: t('nav.fuel'),
      permission: PERMISSIONS.FUEL_READ,
    },
    {
      key: '/waybills',
      icon: <FileTextOutlined />,
      label: t('nav.waybills'),
      permission: PERMISSIONS.WAYBILL_READ,
    },
    {
      key: '/reports',
      icon: <BarChartOutlined />,
      label: t('nav.reports'),
      permission: PERMISSIONS.REPORT_READ,
    },
    {
      key: '/users',
      icon: <SafetyOutlined />,
      label: t('nav.users'),
      permission: PERMISSIONS.USER_READ,
    },
    {
      key: '/admin',
      icon: <DatabaseOutlined />,
      label: t('nav.admin'),
      permission: PERMISSIONS.DICTIONARY_READ,
    },
    {
      key: '/audit',
      icon: <HistoryOutlined />,
      label: t('nav.audit'),
      permission: PERMISSIONS.AUDIT_READ,
    },
  ];

  const menuItems = allItems
    .filter((item) => !item.permission || can(item.permission))
    .map(({ key, icon, label }) => ({ key, icon, label }));

  const changeLocale = (locale: string): void => {
    localStorage.setItem('gsm.locale', locale);
    void i18n.changeLanguage(locale);
  };

  const activeOffice = user?.activeOffice;

  return (
    <Layout style={{ minHeight: '100vh' }}>
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
        {/*
          Логотип аэропорта в свёрнутом виде остаётся единственным
          указанием на офис — поэтому он, а не название, стоит первым.
        */}
        <div className={`gsm-sider-brand${collapsed ? ' gsm-sider-brand--collapsed' : ''}`}>
          <OfficeLogo
            officeId={activeOffice?.id}
            code={activeOffice?.iataCode ?? activeOffice?.code ?? 'ГСМ'}
            size={collapsed ? 32 : 30}
          />
          {!collapsed && (
            <Typography.Text
              ellipsis
              style={{ color: '#fff', fontWeight: 600, letterSpacing: 0.4 }}
              title={activeOffice?.name}
            >
              {activeOffice?.name ?? 'ГСМ · UZ'}
            </Typography.Text>
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>

      <Layout>
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
            <Tooltip title={collapsed ? t('nav.expandMenu') : t('nav.collapseMenu')}>
              <Button
                type="text"
                aria-label={collapsed ? t('nav.expandMenu') : t('nav.collapseMenu')}
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={toggleCollapsed}
              />
            </Tooltip>

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
                    label: t('auth.signOut'),
                    onClick: () => void logout(),
                  },
                ],
              }}
            >
              <Space style={{ cursor: 'pointer' }}>
                <Typography.Text strong>{user?.fullName}</Typography.Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
