import { useQuery } from '@tanstack/react-query';
import { Alert, Descriptions, Skeleton, Tag } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { TECHNICAL_CHECKLIST, type ClearanceState } from '@gsm/shared';

import { api } from '@/api/client';

/**
 * Заключение механика в форме выдачи путевого листа.
 *
 * Как и медицинская карточка, показывает, а не спрашивает: галочки
 * «техосмотр пройден» здесь больше нет, потому что подтверждать исправность
 * техники диспетчер не вправе.
 */

interface Clearance {
  state: ClearanceState;
  allowed: boolean;
  overridable: boolean;
  label: string;
  validUntil: string | null;
  check: {
    id: number;
    checkedAt: string;
    result: string;
    checklist: Record<string, boolean> | null;
    odometer: string | null;
    notes: string | null;
    mechanicName: string | null;
    checkedByUser: { id: number; fullName: string } | null;
  } | null;
}

const STATE_TYPE: Record<ClearanceState, 'success' | 'warning' | 'error' | 'info'> = {
  PASSED: 'success',
  CONDITIONAL: 'warning',
  MISSING: 'error',
  EXPIRED: 'error',
  FAILED: 'error',
};

interface Props {
  vehicleId: number | undefined;
  onState?: (clearance: Clearance | null) => void;
}

export function TechnicalClearanceCard({ vehicleId, onState }: Props) {
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: ['vehicle-technical-clearance', vehicleId],
    enabled: vehicleId !== undefined,
    queryFn: async () => {
      const { data } = await api.get<Clearance>(`/vehicles/${vehicleId}/technical-clearance`);
      onState?.(data);
      return data;
    },
  });

  if (query.isLoading) return <Skeleton active paragraph={{ rows: 2 }} />;

  const clearance = query.data;
  if (!clearance) return null;

  const check = clearance.check;
  // Показываем только замечания: перечислять исправные узлы незачем,
  // а вот неотмеченный тормоз должен бросаться в глаза.
  const defects = check?.checklist
    ? TECHNICAL_CHECKLIST.filter((item) => check.checklist?.[item.key] === false)
    : [];

  return (
    <Alert
      type={STATE_TYPE[clearance.state]}
      showIcon
      style={{ marginBottom: 16 }}
      message={clearance.label}
      description={
        check ? (
          <Descriptions size="small" column={1} style={{ marginTop: 4 }}>
            <Descriptions.Item label={t('Осмотр')}>
              {dayjs(check.checkedAt).format('DD.MM.YYYY HH:mm')}
              {clearance.validUntil && (
                <span style={{ opacity: 0.65 }}>
                  {' '}
                  — {t('действует до')} {dayjs(clearance.validUntil).format('HH:mm')}
                </span>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t('Механик')}>
              {check.checkedByUser?.fullName ?? check.mechanicName ?? (
                <Tag>{t('запись с бумаги')}</Tag>
              )}
            </Descriptions.Item>
            {check.odometer && (
              <Descriptions.Item label={t('Одометр при осмотре')}>
                {check.odometer} {t('км')}
              </Descriptions.Item>
            )}
            {defects.length > 0 && (
              <Descriptions.Item label={t('Замечания по узлам')}>
                {defects.map((item) => (
                  <Tag color="red" key={item.key}>
                    {t(item.label)}
                  </Tag>
                ))}
              </Descriptions.Item>
            )}
            {check.notes && (
              <Descriptions.Item label={t('Заключение')}>{check.notes}</Descriptions.Item>
            )}
          </Descriptions>
        ) : (
          t('Техника не проходила предрейсовый контроль технического состояния.')
        )
      }
    />
  );
}
