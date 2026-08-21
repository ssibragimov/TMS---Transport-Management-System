import { useQuery } from '@tanstack/react-query';
import { Alert, Descriptions, Skeleton, Tag } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import type { ClearanceState } from '@gsm/shared';

import { api } from '@/api/client';

/**
 * Медицинский допуск водителя в форме выдачи путевого листа.
 *
 * Раньше на этом месте стояла галочка «предрейсовый медосмотр пройден»,
 * которую диспетчер ставил себе сам. Теперь здесь заключение врача: кто
 * осматривал, когда, до какого времени действует. Поставить его диспетчер
 * не может — только увидеть.
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
    bloodPressure: string | null;
    temperature: string | null;
    alcoholPpm: string | null;
    notes: string | null;
    doctorName: string | null;
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
  driverId: number | undefined;
  /** Сообщает форме, можно ли выдавать и требуется ли причина обхода. */
  onState?: (clearance: Clearance | null) => void;
}

export function MedicalClearanceCard({ driverId, onState }: Props) {
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: ['driver-medical-clearance', driverId],
    enabled: driverId !== undefined,
    queryFn: async () => {
      const { data } = await api.get<Clearance>(`/drivers/${driverId}/medical-clearance`);
      onState?.(data);
      return data;
    },
  });

  if (query.isLoading) return <Skeleton active paragraph={{ rows: 2 }} />;

  const clearance = query.data;
  if (!clearance) return null;

  const check = clearance.check;

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
            <Descriptions.Item label={t('Врач')}>
              {check.checkedByUser?.fullName ?? check.doctorName ?? (
                <Tag>{t('запись с бумаги')}</Tag>
              )}
            </Descriptions.Item>
            {(check.bloodPressure || check.temperature || check.alcoholPpm !== null) && (
              <Descriptions.Item label={t('Показатели')}>
                {[
                  check.bloodPressure && `АД ${check.bloodPressure}`,
                  check.temperature && `${check.temperature} °C`,
                  check.alcoholPpm !== null && `алкотестер ${check.alcoholPpm} ‰`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Descriptions.Item>
            )}
            {/* Примечание врача при условном допуске — то, ради чего
                диспетчер обязан посмотреть на эту карточку, а не пролистнуть. */}
            {check.notes && (
              <Descriptions.Item label={t('Заключение')}>{check.notes}</Descriptions.Item>
            )}
          </Descriptions>
        ) : (
          t('Водитель не проходил предрейсовый осмотр в здравпункте.')
        )
      }
    />
  );
}
