-- ═══════════════════════════════════════════════════════════════════════════
--  Телеметрия: TimescaleDB + PostGIS.
--  Нужно на этапе 8, но выполняется сразу — чтобы не переделывать БД
--  на живой системе, когда трекеры уже начнут слать точки.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Гипертаблица трека ───────────────────────────────────────────────────
-- Одна единица техники присылает точку раз в 10–30 секунд. При 300 машинах
-- в одном аэропорту это ~2,6 млн строк в сутки. Обычная таблица такого
-- не выдержит: партиционирование по времени обязательно.
SELECT create_hypertable(
  'public.telemetry_positions',
  'ts',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE,
  migrate_data => TRUE
);

-- Сжатие старых чанков. Трек недельной давности читают редко,
-- а места он занимает больше всего.
ALTER TABLE public.telemetry_positions SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'vehicle_id',
  timescaledb.compress_orderby = 'ts DESC'
);

SELECT add_compression_policy('public.telemetry_positions', INTERVAL '30 days', if_not_exists => TRUE);

-- Хранение сырого трека — 2 года. Агрегаты живут дольше (см. ниже).
SELECT add_retention_policy('public.telemetry_positions', INTERVAL '2 years', if_not_exists => TRUE);

-- ─── Суточный агрегат по технике ──────────────────────────────────────────
-- Источник для сверки «GPS-пробег ↔ пробег в путевом листе».
-- Считать это по сырым точкам на каждый отчёт слишком дорого.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.telemetry_daily
WITH (timescaledb.continuous) AS
SELECT
  vehicle_id,
  time_bucket(INTERVAL '1 day', ts) AS day,
  count(*)                          AS points,
  max(speed)                        AS max_speed,
  avg(speed) FILTER (WHERE speed > 0) AS avg_moving_speed,
  min(odometer)                     AS odometer_start,
  max(odometer)                     AS odometer_end,
  min(engine_hours)                 AS engine_hours_start,
  max(engine_hours)                 AS engine_hours_end,
  min(fuel_level)                   AS fuel_min,
  max(fuel_level)                   AS fuel_max
FROM public.telemetry_positions
GROUP BY vehicle_id, day
WITH NO DATA;

SELECT add_continuous_aggregate_policy('public.telemetry_daily',
  start_offset => INTERVAL '3 days',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- ─── Геометрия ────────────────────────────────────────────────────────────
-- Prisma не типизирует PostGIS, поэтому колонки добавляем здесь,
-- а работаем с ними через $queryRaw.

-- Полигон геозоны: перрон, стоянка спецтехники, топливный склад, периметр.
ALTER TABLE public.geofences
  ADD COLUMN IF NOT EXISTS area geometry(Polygon, 4326);

CREATE INDEX IF NOT EXISTS geofences_area_gix
  ON public.geofences USING gist (area);

-- Точка позиции — для запросов «кто сейчас внутри геозоны».
ALTER TABLE public.telemetry_positions
  ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326)) STORED;

CREATE INDEX IF NOT EXISTS telemetry_positions_geom_gix
  ON public.telemetry_positions USING gist (geom);

-- ─── События геозон ───────────────────────────────────────────────────────
-- Отдельная таблица: событий на порядки меньше, чем точек,
-- и живут они дольше срока хранения сырого трека.
CREATE TABLE IF NOT EXISTS public.geofence_events (
  id          bigserial PRIMARY KEY,
  office_id   integer     NOT NULL REFERENCES public.offices (id) ON DELETE CASCADE,
  geofence_id integer     NOT NULL REFERENCES public.geofences (id) ON DELETE CASCADE,
  vehicle_id  integer     NOT NULL REFERENCES public.vehicles (id) ON DELETE CASCADE,
  event_type  varchar(16) NOT NULL CHECK (event_type IN ('ENTRY', 'EXIT')),
  occurred_at timestamptz(3) NOT NULL,
  latitude    numeric(10, 7),
  longitude   numeric(10, 7),
  speed       numeric(6, 2),
  created_at  timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geofence_events_office_time_idx
  ON public.geofence_events (office_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS geofence_events_vehicle_time_idx
  ON public.geofence_events (vehicle_id, occurred_at DESC);

ALTER TABLE public.geofence_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_isolation ON public.geofence_events;
CREATE POLICY office_isolation ON public.geofence_events
  USING (app.office_visible(office_id))
  WITH CHECK (app.office_visible(office_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.geofence_events TO PUBLIC;
GRANT USAGE, SELECT ON SEQUENCE public.geofence_events_id_seq TO PUBLIC;
