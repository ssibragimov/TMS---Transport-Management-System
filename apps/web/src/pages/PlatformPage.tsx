import { Tabs, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@gsm/shared';

import { useAuth } from '@/auth/AuthContext';
import { TableCard } from '@/components/TableCard';

import { OfficesPanel } from './admin/OfficesPanel';
import { OrganizationsPanel } from './platform/OrganizationsPanel';
import { PlatformAdminsPanel } from './platform/PlatformAdminsPanel';

/**
 * Управление платформой — только для суперадминистратора: организации,
 * их офисы и люди с полным доступом. Администратор офиса сюда не попадает
 * и управляет данными только своего офиса (раздел «Администрирование»).
 */
export function PlatformPage() {
  const { t } = useTranslation();
  const { can } = useAuth();

  if (!can(PERMISSIONS.PLATFORM_MANAGE)) {
    return (
      <Typography.Text type="danger">
        {t('Нет прав на управление платформой')}
      </Typography.Text>
    );
  }

  return (
    <TableCard title={t('Платформа')}>
      <Tabs
        items={[
          {
            key: 'organizations',
            label: t('Организации'),
            children: <OrganizationsPanel />,
          },
          { key: 'offices', label: t('Офисы'), children: <OfficesPanel /> },
          {
            key: 'super-admins',
            label: t('Суперадминистраторы'),
            children: <PlatformAdminsPanel />,
          },
        ]}
      />
    </TableCard>
  );
}
