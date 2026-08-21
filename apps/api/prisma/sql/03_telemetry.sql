-- ═══════════════════════════════════════════════════════════════════════════
--  Телеметрия: хранение трека.
--
--  Скрипт рассчитан на ОБЫЧНЫЙ PostgreSQL. TimescaleDB и PostGIS есть не в
--  каждой среде: локальная portable-сборка идёт без них, управляемые хостинги
--  дают их не всегда. Раздел, который зависит от расширения, был бы разделом,
--  который у половины установок не работает.
--
--  Поэтому:
--    • трек партиционируется штатным декларативным партиционированием по месяцам;
--    • геозоны хранят полигон в jsonb, вхождение точки считает код;
--    • если расширения всё-таки установлены — включаются как ускорители,
--      без них поведение системы не меняется.
--
--  Скрипт идемпотентен: выполняется после каждой миграции.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Партиционирование трека ──────────────────────────────────────────────
-- Одна единица техники присылает точку раз в 10–30 секунд. При 300 машинах
-- в аэропорту это ~2,6 млн строк в сутки. Обычная таблица такого не выдержит:
-- удаление старого превращается в многочасовой VACUUM, а планировщик перестаёт
-- попадать в индекс. С партициями отсечение месяца — это DROP TABLE.
--
-- Prisma создаёт telemetry_positions обычной таблицей: разбиение она описать
-- не умеет. Пересоздаём её здесь — но только пока она пуста. Живой трек
-- скрипт не тронет: перекладывать миллионы строк молча, посреди применения
-- миграций, недопустимо.
DO $$
DECLARE
  is_partitioned boolean;
  row_count      bigint;
BEGIN
  IF to_regclass('public.telemetry_positions') IS NULL THEN
    RAISE NOTICE 'Телеметрия: таблица ещё не создана, пропускаю';
    RETURN;
  END IF;

  SELECT relkind = 'p' INTO is_partitioned
  FROM pg_class WHERE oid = 'public.telemetry_positions'::regclass;

  IF is_partitioned THEN
    RAISE NOTICE 'Телеметрия: таблица уже разбита на партиции';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.telemetry_positions' INTO row_count;

  IF row_count > 0 THEN
    RAISE WARNING
      'Телеметрия: в telemetry_positions % строк — таблица оставлена обычной. '
      'Разбиение на партиции нужно выполнить отдельно, с переносом данных.',
      row_count;
    RETURN;
  END IF;

  DROP TABLE public.telemetry_positions;

  CREATE TABLE public.telemetry_positions (
    id          bigserial      NOT NULL,
    vehicle_id  integer        NOT NULL,
    device_id   integer,
    ts          timestamptz(3) NOT NULL,

    latitude    numeric(10, 7) NOT NULL,
    longitude   numeric(10, 7) NOT NULL,
    altitude    integer,
    speed       numeric(6, 2),
    heading     smallint,
    satellites  smallint,

    ignition    boolean,
    fuel_level  numeric(10, 2),
    engine_hours numeric(12, 1),
    odometer    numeric(12, 1),
    raw         jsonb,

    PRIMARY KEY (ts, id)
  ) PARTITION BY RANGE (ts);

  -- Все запросы идут «покажи трек машины за период» — индекс ровно под них.
  CREATE INDEX telemetry_positions_vehicle_ts_idx
    ON public.telemetry_positions (vehicle_id, ts DESC);

  RAISE NOTICE 'Телеметрия: telemetry_positions разбита на партиции по месяцам';
END $$;

-- ─── Создание партиций ────────────────────────────────────────────────────
-- Вызывается ниже при каждом применении скриптов и доступна планировщику.
-- Партиции нарезаются с запасом вперёд: вставка в момент, когда партиции
-- на текущий месяц ещё нет, — это отказ приёма данных с трекеров.
CREATE OR REPLACE FUNCTION app.ensure_telemetry_partitions(months_ahead int DEFAULT 3)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  created int := 0;
  i       int;
  start_ts timestamptz;
  end_ts   timestamptz;
  part_name text;
BEGIN
  IF to_regclass('public.telemetry_positions') IS NULL THEN
    RETURN 0;
  END IF;

  IF (SELECT relkind FROM pg_class WHERE oid = 'public.telemetry_positions'::regclass) <> 'p' THEN
    RETURN 0;
  END IF;

  -- Месяц назад тоже нужен: трекер может прислать точки, накопленные
  -- в офлайне, — на стоянке без связи это обычное дело.
  FOR i IN -1 .. months_ahead LOOP
    start_ts := date_trunc('month', now()) + make_interval(months => i);
    end_ts   := start_ts + INTERVAL '1 month';
    part_name := 'telemetry_positions_' || to_char(start_ts, 'YYYY_MM');

    IF to_regclass('public.' || part_name) IS NOT NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'CREATE TABLE public.%I PARTITION OF public.telemetry_positions FOR VALUES FROM (%L) TO (%L)',
      part_name, start_ts, end_ts
    );
    created := created + 1;
  END LOOP;

  -- Партиция по умолчанию — страховка от потери данных при сбитых часах
  -- трекера. Точка с датой 2035 года должна попасть в базу и быть заметной,
  -- а не оборвать приём всей пачки.
  IF to_regclass('public.telemetry_positions_default') IS NULL THEN
    CREATE TABLE public.telemetry_positions_default
      PARTITION OF public.telemetry_positions DEFAULT;
    created := created + 1;
  END IF;

  RETURN created;
END $$;

SELECT app.ensure_telemetry_partitions(3);

-- ─── Права и изоляция ─────────────────────────────────────────────────────
-- Пересоздание таблицы сбросило и гранты, и политику: 01_rls.sql отработал
-- раньше по алфавиту, второй раз за это применение он не запустится.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telemetry_positions TO PUBLIC;
GRANT USAGE, SELECT ON SEQUENCE public.telemetry_positions_id_seq TO PUBLIC;

ALTER TABLE public.telemetry_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_isolation ON public.telemetry_positions;
CREATE POLICY office_isolation ON public.telemetry_positions
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = telemetry_positions.vehicle_id AND app.office_visible(v.office_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = telemetry_positions.vehicle_id AND app.office_visible(v.office_id)
    )
  );

-- ─── Ускорители там, где расширения есть ──────────────────────────────────
-- Ни одна из этих настроек не влияет на поведение системы: без них всё
-- работает так же, только медленнее и занимает больше места.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
    RAISE NOTICE 'Телеметрия: TimescaleDB доступен — сжатие старых партиций можно включить отдельно';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
    CREATE EXTENSION IF NOT EXISTS postgis;

    -- Зеркало полигона для пространственных запросов. Источник истины —
    -- jsonb-колонка area: код читает и пишет только её.
    ALTER TABLE public.geofences
      ADD COLUMN IF NOT EXISTS area_geom geometry(Polygon, 4326);

    CREATE INDEX IF NOT EXISTS geofences_area_gix
      ON public.geofences USING gist (area_geom);

    RAISE NOTICE 'Телеметрия: PostGIS подключён, добавлено зеркало полигона';
  ELSE
    RAISE NOTICE 'Телеметрия: PostGIS недоступен — геометрия считается в коде';
  END IF;
END $$;
