import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Space, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { PERMISSIONS } from '@gsm/shared';

import { api } from '@/api/client';
import { useAuthedImage } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { fmt } from '@/lib/labels';

interface ViolationDetail {
  id: number;
  occurredAt: string;
  fineAmount: string | null;
  description: string | null;
  photoKey: string | null;
  createdAt: string;
  driver: {
    lastName: string;
    firstName: string;
    middleName: string | null;
    personnelNumber: string;
    office: { nameRu: string; address: string | null; phone: string | null };
  };
  vehicle: { garageNumber: string; plateNumber: string | null } | null;
  type: { name: string };
  issuedByUser: { fullName: string } | null;
}

/**
 * Печатная форма нарушения — отдельная страница вне AppLayout, тот же приём,
 * что и у путевого листа (см. WaybillPrintPage): открывается в новой вкладке,
 * «Сохранить как PDF» — штатная функция диалога печати браузера, отдельного
 * рендера под PDF нет и не нужно.
 */
export function ViolationPrintPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { id } = useParams<{ id: string }>();

  const query = useQuery({
    queryKey: ['violation-print', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get<ViolationDetail>(`/violations/${id}`)).data,
  });

  const photoSrc = useAuthedImage(query.data?.photoKey ? `/violations/${id}/photo` : null);

  if (!can(PERMISSIONS.VIOLATION_READ)) {
    return (
      <div style={{ padding: 48 }}>
        <Alert type="error" showIcon message={t('Нет прав на просмотр нарушений')} />
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div style={{ padding: 48 }}>
        <Alert type="error" showIcon message={t('Нарушение не найдено')} />
      </div>
    );
  }

  const v = query.data;
  const driverName = `${v.driver.lastName} ${v.driver.firstName} ${v.driver.middleName ?? ''}`.trim();

  return (
    <div className="vl-print">
      <style>{`
        .vl-print {
          max-width: 860px;
          margin: 0 auto;
          padding: 32px 24px 64px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          color: #1a1a1a;
          background: #fff;
        }
        .vl-toolbar {
          position: sticky;
          top: 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          margin-bottom: 24px;
          border-bottom: 1px solid #eee;
          background: #fff;
        }
        .vl-header { text-align: center; margin-bottom: 24px; }
        .vl-header .office-name { font-size: 15px; font-weight: 600; margin: 0; }
        .vl-header .office-contact { font-size: 12px; color: #666; margin: 2px 0 0; }
        .vl-title {
          text-align: center;
          font-size: 20px;
          font-weight: 700;
          margin: 16px 0 4px;
          letter-spacing: 0.5px;
        }
        .vl-subtitle { text-align: center; font-size: 13px; color: #555; margin-bottom: 20px; }
        .vl-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          margin-bottom: 20px;
          border: 1px solid #999;
          font-size: 13px;
        }
        .vl-grid .cell {
          border-bottom: 1px solid #ccc;
          border-right: 1px solid #ccc;
          padding: 6px 10px;
        }
        .vl-grid .cell:nth-child(2n) { border-right: none; }
        .vl-grid .cell.full { grid-column: 1 / -1; border-right: none; }
        .vl-grid .cell .label { color: #666; font-size: 11px; display: block; }
        .vl-photo { max-width: 100%; max-height: 320px; margin: 0 auto 4px; display: block; border: 1px solid #ccc; }
        .vl-photo-caption { text-align: center; font-size: 11px; color: #999; margin-bottom: 20px; }
        .vl-signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          margin-top: 48px;
        }
        .vl-signature-line {
          margin-top: 40px;
          border-top: 1px solid #333;
          padding-top: 4px;
          font-size: 11px;
          color: #666;
          text-align: center;
        }
        .vl-footer { margin-top: 32px; font-size: 11px; color: #999; text-align: center; }

        @media print {
          .no-print { display: none !important; }
          .vl-print { padding: 0; max-width: none; }
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="vl-toolbar no-print">
        <Typography.Text type="secondary">
          {t('Совет: чтобы сохранить в PDF, в диалоге печати выберите «Сохранить как PDF»')}
        </Typography.Text>
        <Space>
          <Button onClick={() => window.close()}>{t('Закрыть')}</Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
            {t('Печать')}
          </Button>
        </Space>
      </div>

      <div className="vl-header">
        <p className="office-name">{v.driver.office.nameRu}</p>
        <p className="office-contact">
          {[v.driver.office.address, v.driver.office.phone].filter(Boolean).join(' · ') || ' '}
        </p>
      </div>

      <div className="vl-title">{t('Нарушение')} № {v.id}</div>
      <div className="vl-subtitle">{dayjs(v.occurredAt).format('DD.MM.YYYY HH:mm')}</div>

      <div className="vl-grid">
        <div className="cell"><span className="label">{t('Водитель')}</span>{driverName}</div>
        <div className="cell"><span className="label">{t('Табельный номер')}</span>{v.driver.personnelNumber}</div>
        <div className="cell">
          <span className="label">{t('Техника')}</span>
          {v.vehicle ? `${v.vehicle.garageNumber}${v.vehicle.plateNumber ? ` (${v.vehicle.plateNumber})` : ''}` : '—'}
        </div>
        <div className="cell"><span className="label">{t('Вид нарушения')}</span>{v.type.name}</div>
        <div className="cell"><span className="label">{t('Сумма штрафа')}</span>{v.fineAmount ? `${fmt(v.fineAmount)} сум` : '—'}</div>
        <div className="cell"><span className="label">{t('Оформил')}</span>{v.issuedByUser?.fullName ?? '—'}</div>
        {v.description && (
          <div className="cell full"><span className="label">{t('Описание')}</span>{v.description}</div>
        )}
      </div>

      {photoSrc && (
        <>
          <img className="vl-photo" src={photoSrc} alt={t('Фото/вложение')} />
          <div className="vl-photo-caption">
            {t('Загружено')}: {dayjs(v.createdAt).format('DD.MM.YYYY HH:mm')}
          </div>
        </>
      )}

      <div className="vl-signatures">
        <div className="vl-signature-line">{t('Оформил')} ({v.issuedByUser?.fullName ?? '—'})</div>
        <div className="vl-signature-line">{t('Водитель')} ({driverName})</div>
      </div>

      <div className="vl-footer">
        {t('Сформировано')}: {dayjs().format('DD.MM.YYYY HH:mm')}
      </div>
    </div>
  );
}
