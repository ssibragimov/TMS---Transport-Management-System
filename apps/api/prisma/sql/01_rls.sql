-- ═══════════════════════════════════════════════════════════════════════════
--  Row Level Security — изоляция данных между офисами на уровне СУБД.
--
--  Зачем не только WHERE в коде: одна забытая проверка в одном обработчике
--  открывает данные всех аэропортов. Политика ниже делает такой запрос
--  физически невозможным.
--
--  Как это работает:
--    1. API подключается под ролью gsm_app (НЕ владелец таблиц) — на неё
--       политики действуют. Миграции и seed идут под gsm_owner — он их обходит.
--    2. Перед каждым запросом расширение Prisma выставляет транзакционные
--       переменные app.office_ids и app.bypass_rls (см. rls.extension.ts).
--    3. Политика сверяет office_id строки с этим списком.
--
--  Скрипт идемпотентен: выполняется после каждой миграции.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS app;

-- Список офисов, доступных текущему запросу. Пусто = не видно ничего.
CREATE OR REPLACE FUNCTION app.current_office_ids() RETURNS int[]
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(
    string_to_array(NULLIF(current_setting('app.office_ids', true), ''), ',')::int[],
    ARRAY[]::int[]
  );
$$;

-- Обход политик для суперадминистратора и фоновых задач,
-- которым нужен срез по всей стране.
CREATE OR REPLACE FUNCTION app.rls_bypassed() RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(current_setting('app.bypass_rls', true), 'off') = 'on';
$$;

CREATE OR REPLACE FUNCTION app.office_visible(target_office_id int) RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT app.rls_bypassed() OR target_office_id = ANY (app.current_office_ids());
$$;

/*
 * Область видимости офисов вместе с родительскими.
 *
 * SECURITY DEFINER обязателен. Политика на таблице offices вынуждена смотреть
 * в саму таблицу offices (чтобы показать головной офис над своим аэропортом),
 * а прямой подзапрос в USING приводит к ошибке 42P17 «бесконечная рекурсия
 * в политике». Функция выполняется от владельца схемы, на которого политики
 * не действуют, и рекурсия обрывается.
 *
 * search_path зафиксирован: без него SECURITY DEFINER-функция уязвима
 * к подмене объектов через пользовательскую схему.
 */
CREATE OR REPLACE FUNCTION app.office_scope_with_parents() RETURNS int[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (
      SELECT array_agg(DISTINCT id)
      FROM (
        SELECT unnest(app.current_office_ids()) AS id
        UNION
        SELECT o.parent_id
        FROM public.offices o
        WHERE o.id = ANY (app.current_office_ids())
          AND o.parent_id IS NOT NULL
      ) s
    ),
    ARRAY[]::int[]
  );
$$;

GRANT USAGE ON SCHEMA app TO PUBLIC;

DO $$
DECLARE
  -- Таблицы с собственным office_id.
  direct_tables text[] := ARRAY[
    'departments',
    'counterparties',
    'vehicles',
    'vehicle_assignments',
    'drivers',
    'fuel_tanks',
    'fuel_receipts',
    'fuel_cards',
    'fuel_issues',
    'fuel_norms',
    'fuel_inventories',
    'waybills',
    'work_orders',
    'warehouses',
    'stock_balances',
    'stock_documents',
    'stock_movements',
    'geofences',
    'geofence_events',
    'vehicle_condition_acts',
    'alerts',
    'document_sequences'
  ];

  -- Дочерние таблицы: office_id берётся у родителя.
  -- Формат: {таблица, колонка-ссылка, родительская таблица}
  child_tables text[][] := ARRAY[
    ARRAY['vehicle_documents',      'vehicle_id',  'vehicles'],
    ARRAY['vehicle_photos',         'vehicle_id',  'vehicles'],
    ARRAY['vehicle_meter_readings', 'vehicle_id',  'vehicles'],
    ARRAY['maintenance_plans',      'vehicle_id',  'vehicles'],
    ARRAY['tire_installations',     'vehicle_id',  'vehicles'],
    ARRAY['gps_devices',            'vehicle_id',  'vehicles'],
    ARRAY['technical_inspections',  'vehicle_id',  'vehicles'],
    ARRAY['telemetry_positions',    'vehicle_id',  'vehicles'],
    ARRAY['telemetry_last_positions', 'vehicle_id', 'vehicles'],
    ARRAY['driver_licenses',        'driver_id',   'drivers'],
    ARRAY['driver_permits',         'driver_id',   'drivers'],
    ARRAY['medical_checks',         'driver_id',   'drivers'],
    ARRAY['waybill_tasks',          'waybill_id',  'waybills'],
    ARRAY['work_order_parts',       'work_order_id', 'work_orders']
  ];

  tbl text;
  i int;
  child text;
  fk text;
  parent text;
  predicate text;
BEGIN
  -- ─── Таблицы с прямым office_id ────────────────────────────────────────
  FOREACH tbl IN ARRAY direct_tables LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      RAISE NOTICE 'RLS: таблица % ещё не создана, пропускаю', tbl;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS office_isolation ON public.%I', tbl);
    EXECUTE format($f$
      CREATE POLICY office_isolation ON public.%I
        USING (app.office_visible(office_id))
        WITH CHECK (app.office_visible(office_id))
    $f$, tbl);
  END LOOP;

  -- ─── Дочерние таблицы ──────────────────────────────────────────────────
  FOR i IN 1 .. array_length(child_tables, 1) LOOP
    child  := child_tables[i][1];
    fk     := child_tables[i][2];
    parent := child_tables[i][3];

    IF to_regclass('public.' || child) IS NULL THEN
      RAISE NOTICE 'RLS: таблица % ещё не создана, пропускаю', child;
      CONTINUE;
    END IF;

    -- Имя дочерней таблицы без схемы: внутри политики оно и так в области
    -- видимости, а схемная квалификация в USING читается хуже.
    predicate := format(
      'EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I AND app.office_visible(p.office_id))',
      parent, child, fk
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', child);
    EXECUTE format('DROP POLICY IF EXISTS office_isolation ON public.%I', child);
    EXECUTE format(
      'CREATE POLICY office_isolation ON public.%I USING (%s) WITH CHECK (%s)',
      child, predicate, predicate
    );
  END LOOP;
END $$;

-- ─── Офисы ────────────────────────────────────────────────────────────────
-- Сам справочник офисов виден только в пределах своей области видимости,
-- иначе пользователь Бухары увидит в выпадающих списках весь Узбекистан.
-- Родительский офис виден всегда — он нужен для отображения иерархии;
-- его подмешивает app.office_scope_with_parents() (см. выше про рекурсию).
--
-- WITH CHECK строже USING намеренно: создание офиса — операция уровня
-- головного офиса, она выполняется под учёткой с bypass_rls либо seed'ом.
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_isolation ON public.offices;
CREATE POLICY office_isolation ON public.offices
  USING (app.rls_bypassed() OR id = ANY (app.office_scope_with_parents()))
  WITH CHECK (app.office_visible(id));

-- ─── Журнал аудита ────────────────────────────────────────────────────────
-- office_id nullable (события входа происходят до выбора офиса),
-- поэтому политика отдельная: свои записи + записи без офиса.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_isolation ON public.audit_logs;
CREATE POLICY office_isolation ON public.audit_logs
  USING (app.rls_bypassed() OR office_id IS NULL OR app.office_visible(office_id))
  WITH CHECK (TRUE);

-- ─── Пользователи ─────────────────────────────────────────────────────────
-- Виден тот, у кого есть доступ хотя бы к одному общему офису.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_isolation ON public.users;
CREATE POLICY office_isolation ON public.users
  USING (
    app.rls_bypassed()
    OR EXISTS (
      SELECT 1 FROM public.user_offices uo
      WHERE uo.user_id = users.id AND app.office_visible(uo.office_id)
    )
  )
  WITH CHECK (TRUE);

-- Справочники (fuel_types, vehicle_models, spare_parts, roles, permissions)
-- Номенклатура ТМЦ (spare_parts) тоже общая: код позиции обязан означать
-- одно и то же в Ташкенте и Бухаре, иначе расход масла по стране не сложить.
-- Разделены по офисам склады, остатки и движения — то, что принадлежит
-- конкретному аэропорту.
-- намеренно общие для всей страны: единая номенклатура — условие
-- сравнимости отчётов между аэропортами. RLS на них не вешаем.
