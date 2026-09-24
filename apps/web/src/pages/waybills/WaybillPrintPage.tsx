import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Space, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { PERMISSIONS } from '@gsm/shared';

import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { fmt } from '@/lib/labels';

interface PrintData {
  office: {
    nameRu: string;
    nameUz: string;
    code: string;
    address: string | null;
    phone: string | null;
    taskLayout: string;
    taskAddressALocations: boolean;
  };
  printedAt: string;
  normBreakdown: { lines: Array<{ key: string; rate: number; quantity: number; unit: string; litres: number }> } | null;
  waybill: {
    id: number;
    number: string;
    status: string;
    validFrom: string;
    validTo: string;
    odometerStart: string | null;
    odometerEnd: string | null;
    engineHoursStart: string | null;
    engineHoursEnd: string | null;
    distanceKm: string | null;
    engineHours: string | null;
    fuelOpening: string;
    fuelIssued: string;
    fuelConsumed: string | null;
    fuelClosing: string | null;
    fuelNorm: string | null;
    fuelDeviationPct: string | null;
    notes: string | null;
    vehicle: { garageNumber: string; plateNumber: string | null } | null;
    driver: { lastName: string; firstName: string; middleName: string | null; personnelNumber: string } | null;
    tasks: Array<{
      id: number;
      sequence: number;
      fromPoint: string | null;
      flightNumber: string | null;
      aircraftReg: string | null;
      standNumber: string | null;
      toPoint: string | null;
      distanceKm: string | null;
      engineHours: string | null;
    }>;
    fuelIssues: Array<{
      id: number;
      documentNumber: string;
      issuedAt: string;
      volume: string;
      tank: { code: string } | null;
    }>;
  };
}

/**
 * Печатная форма путевого листа — отдельная страница вне AppLayout.
 *
 * Открывается в новой вкладке (см. кнопку «Печать» в WaybillDrawer), поэтому
 * не тянет за собой тёмный сайдбар и шапку: печатать нужно только сам
 * документ. «Скачать PDF» отдельной кнопкой не сделано намеренно — диалог
 * печати браузера уже умеет сохранять как PDF, и это тот же самый макет,
 * без второй реализации вёрстки под другой рендерер.
 */
export function WaybillPrintPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { id } = useParams<{ id: string }>();

  const query = useQuery({
    queryKey: ['waybill-print', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get<PrintData>(`/waybills/${id}/print`)).data,
  });

  if (!can(PERMISSIONS.WAYBILL_PRINT)) {
    return (
      <div style={{ padding: 48 }}>
        <Alert type="error" showIcon message={t('Нет прав на печать путевых листов')} />
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
        <Alert type="error" showIcon message={t('Путевой лист не найден')} />
      </div>
    );
  }

  const { office, waybill, normBreakdown, printedAt } = query.data;
  const driverName = waybill.driver
    ? `${waybill.driver.lastName} ${waybill.driver.firstName} ${waybill.driver.middleName ?? ''}`.trim()
    : '—';
  // Раскладка идёт с офисом, выпустившим лист (а не с активным офисом текущего
  // пользователя) — печатная форма должна отражать реальность документа.
  const isAddressLayout = office.taskLayout === 'ADDRESS';
  const hasLocationList = office.taskAddressALocations;

  return (
    <div className="wb-print">
      <style>{`
        .wb-print {
          max-width: 860px;
          margin: 0 auto;
          padding: 32px 24px 64px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          color: #1a1a1a;
          background: #fff;
        }
        .wb-toolbar {
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
        .wb-header {
          text-align: center;
          margin-bottom: 24px;
        }
        .wb-header h1 { font-size: 18px; margin: 0 0 4px; }
        .wb-header .office-name { font-size: 15px; font-weight: 600; margin: 0; }
        .wb-header .office-contact { font-size: 12px; color: #666; margin: 2px 0 0; }
        .wb-title {
          text-align: center;
          font-size: 20px;
          font-weight: 700;
          margin: 16px 0 4px;
          letter-spacing: 0.5px;
        }
        .wb-subtitle { text-align: center; font-size: 13px; color: #555; margin-bottom: 20px; }
        table.wb-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 13px;
        }
        table.wb-table th, table.wb-table td {
          border: 1px solid #999;
          padding: 6px 8px;
          text-align: left;
        }
        table.wb-table th { background: #f2f2f2; font-weight: 600; }
        .wb-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          margin-bottom: 20px;
          border: 1px solid #999;
          font-size: 13px;
        }
        .wb-grid .cell {
          border-bottom: 1px solid #ccc;
          border-right: 1px solid #ccc;
          padding: 6px 10px;
        }
        .wb-grid .cell:nth-child(2n) { border-right: none; }
        .wb-grid .cell .label { color: #666; font-size: 11px; display: block; }
        .wb-signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          margin-top: 48px;
        }
        .wb-signature-line {
          margin-top: 40px;
          border-top: 1px solid #333;
          padding-top: 4px;
          font-size: 11px;
          color: #666;
          text-align: center;
        }
        .wb-footer { margin-top: 32px; font-size: 11px; color: #999; text-align: center; }

        @media print {
          .no-print { display: none !important; }
          .wb-print { padding: 0; max-width: none; }
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="wb-toolbar no-print">
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

      <div className="wb-header">
        <p className="office-name">{office.nameRu}</p>
        <p className="office-contact">
          {[office.address, office.phone].filter(Boolean).join(' · ') || ' '}
        </p>
      </div>

      <div className="wb-title">{t('Путевой лист')} № {waybill.number}</div>
      <div className="wb-subtitle">
        {dayjs(waybill.validFrom).format('DD.MM.YYYY HH:mm')} — {dayjs(waybill.validTo).format('DD.MM.YYYY HH:mm')}
      </div>

      <div className="wb-grid">
        <div className="cell"><span className="label">{t('Водитель')}</span>{driverName}</div>
        <div className="cell"><span className="label">{t('Табельный номер')}</span>{waybill.driver?.personnelNumber ?? '—'}</div>
        <div className="cell"><span className="label">{t('Техника')}</span>{waybill.vehicle?.garageNumber ?? '—'} {waybill.vehicle?.plateNumber ? `(${waybill.vehicle.plateNumber})` : ''}</div>
        <div className="cell"><span className="label">{t('Пробег за смену')}</span>{fmt(waybill.distanceKm, 1)} км</div>
        <div className="cell"><span className="label">{t('Одометр')}</span>{fmt(waybill.odometerStart)} → {fmt(waybill.odometerEnd)}</div>
        <div className="cell"><span className="label">{t('Моточасы')}</span>{fmt(waybill.engineHoursStart)} → {fmt(waybill.engineHoursEnd)}</div>
        <div className="cell"><span className="label">{t('Топливо на начало')}</span>{fmt(waybill.fuelOpening, 2)} л</div>
        <div className="cell"><span className="label">{t('Выдано за смену')}</span>{fmt(waybill.fuelIssued, 2)} л</div>
        <div className="cell"><span className="label">{t('Норма, л')}</span>{fmt(waybill.fuelNorm, 2)}</div>
        <div className="cell"><span className="label">{t('Факт, л')}</span>{fmt(waybill.fuelConsumed, 2)}</div>
      </div>

      {waybill.tasks.length > 0 && (
        <>
          <Typography.Title level={5}>{t('Задания')}</Typography.Title>
          <table className="wb-table">
            <thead>
              <tr>
                <th>№</th>
                {isAddressLayout ? (
                  <>
                    <th>{t('Адрес А')}</th>
                    {hasLocationList && <th>{t('Локация')}</th>}
                    <th>{t('Адрес Б')}</th>
                  </>
                ) : (
                  <>
                    <th>{t('Рейс')}</th>
                    <th>{t('Борт')}</th>
                    <th>{t('Стоянка')}</th>
                    <th>{t('Куда')}</th>
                  </>
                )}
                <th>{t('км')}</th>
                <th>{t('мч')}</th>
              </tr>
            </thead>
            <tbody>
              {waybill.tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.sequence}</td>
                  {isAddressLayout ? (
                    <>
                      <td>{task.fromPoint ?? '—'}</td>
                      {hasLocationList && <td>{task.aircraftReg ?? '—'}</td>}
                      <td>{task.toPoint ?? '—'}</td>
                    </>
                  ) : (
                    <>
                      <td>{task.flightNumber ?? '—'}</td>
                      <td>{task.aircraftReg ?? '—'}</td>
                      <td>{task.standNumber ?? '—'}</td>
                      <td>{task.toPoint ?? '—'}</td>
                    </>
                  )}
                  <td>{fmt(task.distanceKm, 1)}</td>
                  <td>{fmt(task.engineHours, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {waybill.fuelIssues.length > 0 && (
        <>
          <Typography.Title level={5}>{t('Заправки по листу')}</Typography.Title>
          <table className="wb-table">
            <thead>
              <tr>
                <th>{t('Документ')}</th>
                <th>{t('Дата')}</th>
                <th>{t('Ёмкость')}</th>
                <th>{t('Объём, л')}</th>
              </tr>
            </thead>
            <tbody>
              {waybill.fuelIssues.map((issue) => (
                <tr key={issue.id}>
                  <td>{issue.documentNumber}</td>
                  <td>{dayjs(issue.issuedAt).format('DD.MM.YYYY HH:mm')}</td>
                  <td>{issue.tank?.code ?? '—'}</td>
                  <td>{fmt(issue.volume, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {normBreakdown?.lines && normBreakdown.lines.length > 0 && (
        <>
          <Typography.Title level={5}>{t('Расшифровка расчёта нормы')}</Typography.Title>
          <table className="wb-table">
            <thead>
              <tr>
                <th>{t('Составляющая')}</th>
                <th>{t('Ставка')}</th>
                <th>{t('Объём')}</th>
                <th>{t('Литров')}</th>
              </tr>
            </thead>
            <tbody>
              {normBreakdown.lines.map((line) => (
                <tr key={line.key}>
                  <td>{line.key}</td>
                  <td>{line.rate}</td>
                  <td>{line.quantity} {line.unit}</td>
                  <td>{line.litres}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {waybill.notes && (
        <Typography.Paragraph>
          <strong>{t('Примечание')}:</strong> {waybill.notes}
        </Typography.Paragraph>
      )}

      <div className="wb-signatures">
        <div className="wb-signature-line">{t('Водитель')} ({driverName})</div>
        <div className="wb-signature-line">{t('Диспетчер')}</div>
      </div>

      <div className="wb-footer">
        {t('Сформировано')}: {dayjs(printedAt).format('DD.MM.YYYY HH:mm')}
      </div>
    </div>
  );
}
