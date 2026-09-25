import {
  ApartmentOutlined,
  BankOutlined,
  LogoutOutlined,
  MailOutlined,
  PhoneOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { CurrentUserDto } from '@gsm/shared';
import { Button, Divider, Space, Typography, theme } from 'antd';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { UserAvatar } from '@/components/UserAvatar';

/**
 * Карточка сотрудника во всплывающем окне над аватаркой в шапке: кто это,
 * как с ним связаться и в каком офисе он сейчас работает. Кнопка выхода
 * отделена чертой — её нельзя нажать случайно, задев контакты.
 */

interface Props {
  user: CurrentUserDto;
  /** Названия ролей через запятую — уже переведённые */
  roleTitle: string;
  onLogout: () => void;
}

function Row({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ color: 'rgba(0,0,0,0.45)', lineHeight: '22px' }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', lineHeight: '16px' }}>
          {label}
        </div>
        <div style={{ wordBreak: 'break-word' }}>{children}</div>
      </div>
    </div>
  );
}

export function UserCard({ user, roleTitle, onLogout }: Props) {
  const { t } = useTranslation();
  const { token } = theme.useToken();

  const empty = <Typography.Text type="secondary">{t('не указан')}</Typography.Text>;

  return (
    <div
      style={{
        width: 320,
        padding: 16,
        background: token.colorBgElevated,
        borderRadius: token.borderRadiusLG,
        boxShadow: token.boxShadowSecondary,
      }}
    >
      <Space size={14} align="start">
        <UserAvatar
          userId={user.id}
          fullName={user.fullName}
          photoKey={user.photoKey}
          size={56}
        />
        <div style={{ minWidth: 0 }}>
          <Typography.Text strong style={{ fontSize: 16 }}>
            {user.fullName}
          </Typography.Text>
          <div>
            <Typography.Text type="secondary">{roleTitle}</Typography.Text>
          </div>
        </div>
      </Space>

      <Divider style={{ margin: '14px 0' }} />

      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Row icon={<MailOutlined />} label={t('Электронная почта')}>
          <Typography.Link href={`mailto:${user.email}`} copyable={{ text: user.email }}>
            {user.email}
          </Typography.Link>
        </Row>
        <Row icon={<PhoneOutlined />} label={t('Основной')}>
          {user.internalNumber ? (
            <Typography.Text strong copyable>
              {user.internalNumber}
            </Typography.Text>
          ) : (
            empty
          )}
        </Row>
        <Row icon={<PhoneOutlined />} label={t('Телефон')}>
          {user.phone ? (
            <Typography.Link href={`tel:${user.phone.replace(/[^\d+]/g, '')}`}>
              {user.phone}
            </Typography.Link>
          ) : (
            empty
          )}
        </Row>
        <Row icon={<ApartmentOutlined />} label={t('Офис')}>
          {user.activeOffice.code} — {user.activeOffice.name}
        </Row>
        {user.activeOffice.organization && (
          <Row icon={<BankOutlined />} label={t('Организация')}>
            {user.activeOffice.organization.name}
          </Row>
        )}
        {user.availableOffices.length > 1 && (
          <Row icon={<TeamOutlined />} label={t('Доступно офисов')}>
            {user.availableOffices.length}
          </Row>
        )}
      </Space>

      <Divider style={{ margin: '14px 0' }} />

      <Button block danger icon={<LogoutOutlined />} onClick={onLogout}>
        {t('Выйти')}
      </Button>
    </div>
  );
}
