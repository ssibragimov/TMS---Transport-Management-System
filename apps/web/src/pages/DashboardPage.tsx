import { useQuery } from '@tanstack/react-query';
import { Card, Col, Progress, Row, Statistic, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { ExpiryAlertDto } from '@gsm/shared';

import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { StickyTable } from '@/components/StickyTable';

interface OfficeSummary {
  vehicles: { total: number; active: number };
  drivers: number;
  openWaybills: number;
  tanks: Array<{
    id: number;
    code: string;
    name: string;
    capacity: string;
    currentVolume: string;
  }>;
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const officeId = user?.activeOffice.id;

  const summary = useQuery({
    queryKey: ['office-summary', officeId],
    enabled: Boolean(officeId),
    queryFn: async () => {
      const { data } = await api.get<OfficeSummary>(`/offices/${officeId}/summary`);
      return data;
    },
  });

  const expiring = useQuery({
    queryKey: ['expiring', officeId],
    enabled: Boolean(officeId),
    queryFn: async () => {
      const { data } = await api.get<ExpiryAlertDto[]>('/drivers/expiring', {
        params: { days: 30 },
      });
      return data;
    },
  });

  return (
    <>
      <Typography.Title level={4}>{user?.activeOffice.name}</Typography.Title>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t('dashboard.vehicles')}
              value={summary.data?.vehicles.total ?? 0}
              loading={summary.isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t('dashboard.activeVehicles')}
              value={summary.data?.vehicles.active ?? 0}
              loading={summary.isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t('dashboard.drivers')}
              value={summary.data?.drivers ?? 0}
              loading={summary.isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t('dashboard.openWaybills')}
              value={summary.data?.openWaybills ?? 0}
              loading={summary.isLoading}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          <Card title={t('dashboard.tanks')} loading={summary.isLoading}>
            {summary.data?.tanks.map((tank) => {
              const percent = Math.round(
                (Number(tank.currentVolume) / Number(tank.capacity)) * 100,
              );
              return (
                <div key={tank.id} style={{ marginBottom: 16 }}>
                  <Typography.Text>
                    {tank.code} — {tank.name}
                  </Typography.Text>
                  <Progress
                    percent={percent}
                    // Красный при остатке ниже 15 %: заправлять технику
                    // на утренней смене будет нечем.
                    status={percent < 15 ? 'exception' : 'normal'}
                    format={() => `${Number(tank.currentVolume).toFixed(0)} л`}
                  />
                </div>
              );
            })}
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          {/*
            Виджет истекающих сроков — самый ценный экран системы:
            просроченный допуск на перрон означает недопуск техники к рейсу.
          */}
          <Card title={t('dashboard.expiring')}>
            <StickyTable<ExpiryAlertDto>
              size="small"
              rowKey={(row) => `${row.entityType}-${row.entityId}`}
              loading={expiring.isLoading}
              dataSource={expiring.data ?? []}
              pagination={{ pageSize: 8, hideOnSinglePage: true }}
              columns={[
                { title: 'Сотрудник', dataIndex: 'subjectLabel' },
                { title: 'Документ', dataIndex: 'documentType', width: 160 },
                {
                  title: t('dashboard.daysLeft'),
                  dataIndex: 'daysLeft',
                  width: 130,
                  render: (days: number) =>
                    days < 0 ? (
                      <Tag color="red">{t('dashboard.expired')}</Tag>
                    ) : (
                      <Tag color={days <= 7 ? 'orange' : 'blue'}>{days}</Tag>
                    ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}
