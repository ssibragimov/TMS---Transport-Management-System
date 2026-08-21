import { Alert, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/AuthContext';
import { basemapAvailable } from '@/lib/basemap';
import { YANDEX_MAPS_KEY } from '@/lib/yandexMaps';

import { LibreAirportMap } from './LibreAirportMap';
import { PlanMap, type PlanFence, type PlanVehicle } from './PlanMap';
import { YandexAirportMap } from './YandexAirportMap';

/**
 * Выбор подложки под положение техники — три ступени вниз по надёжности.
 *
 * 1. Яндекс.Карты, если задан ключ: лучшее покрытие Ташкента, но нужен
 *    интернет и действующий ключ с ограничением по HTTP Referer.
 * 2. Свой файл тайлов из данных OpenStreetMap: ничего не требует наружу,
 *    поэтому работает в технологической сети аэропорта. Файл в репозитории
 *    не хранится и собирается командой `npm run map:tiles`, — его наличие
 *    проверяется, а не предполагается.
 * 3. Встроенная схема: показывает положение техники относительно перрона
 *    и периметра, когда недоступно вообще ничего.
 *
 * Ступени именно в таком порядке: карта тем полезнее, чем ближе к реальной
 * местности, но раздел обязан открываться и без внешних сервисов.
 */

interface Props {
  fences: PlanFence[];
  vehicles: PlanVehicle[];
  selectedId?: number | null;
  onSelect?: (vehicleId: number) => void;
  height?: number;
  asTrack?: boolean;
  /** Показывать пояснение, почему карта не подложена. */
  explainFallback?: boolean;
}

export function AirportMap({
  fences,
  vehicles,
  selectedId,
  onSelect,
  height,
  asTrack,
  explainFallback = false,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const office = user?.activeOffice;
  const hasCoordinates = office?.latitude != null && office?.longitude != null;

  // null — проверка ещё идёт; до её конца схему не показываем,
  // иначе карта подменялась бы на глазах у пользователя.
  const [tiles, setTiles] = useState<boolean | null>(null);

  // Причина отказа Яндекса. Пока null — пробуем его; как только пришла,
  // спускаемся на ступень ниже и показываем пояснение.
  const [yandexError, setYandexError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void basemapAvailable().then((ok) => {
      if (!cancelled) setTiles(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (YANDEX_MAPS_KEY && hasCoordinates && !yandexError) {
    return (
      <YandexAirportMap
        center={{ lat: office.latitude as number, lon: office.longitude as number }}
        fences={fences}
        vehicles={vehicles}
        selectedId={selectedId}
        onSelect={onSelect}
        height={height}
        asTrack={asTrack}
        onUnavailable={setYandexError}
      />
    );
  }

  const yandexNotice = yandexError && explainFallback && (
    <Alert
      type="warning"
      showIcon
      message={t('Карта Яндекса недоступна — показана резервная')}
      description={<Typography.Text type="secondary">{yandexError}</Typography.Text>}
    />
  );

  if (tiles === null) return <div style={{ height: height ?? 460 }} />;

  if (tiles && hasCoordinates) {
    return (
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {yandexNotice}
        <LibreAirportMap
          center={{ lat: office.latitude as number, lon: office.longitude as number }}
          fences={fences}
          vehicles={vehicles}
          selectedId={selectedId}
          onSelect={onSelect}
          height={height}
          asTrack={asTrack}
        />
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {yandexNotice}
      {explainFallback && !tiles && (
        <Alert
          type="info"
          showIcon
          message={t('Показана схема без картографической подложки')}
          description={
            <Typography.Text type="secondary">
              {t(
                'Файл карты не найден. Соберите его командой npm run map:tiles — она вырезает район аэропорта из открытых данных OpenStreetMap в один файл рядом с приложением.',
              )}
            </Typography.Text>
          }
        />
      )}
      {explainFallback && tiles && !hasCoordinates && (
        <Alert
          type="info"
          showIcon
          message={t('У этого офиса нет своей территории')}
          description={t('Карта аэродрома доступна в офисе аэропорта. Переключите офис в шапке.')}
        />
      )}
      <PlanMap
        fences={fences}
        vehicles={vehicles}
        selectedId={selectedId}
        onSelect={onSelect}
        height={height}
      />
    </Space>
  );
}
