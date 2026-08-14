-- ═══════════════════════════════════════════════════════════════════════════
--  Ограничения целостности, которые Prisma не умеет описать в schema.prisma.
--  Скрипт идемпотентен.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Приписка техники к офису ─────────────────────────────────────────────
-- У одной единицы техники не может быть двух пересекающихся периодов приписки.
-- Без этого ограничения отчёт за прошлый месяц посчитает технику дважды.
ALTER TABLE public.vehicle_assignments
  DROP CONSTRAINT IF EXISTS vehicle_assignments_no_overlap;
ALTER TABLE public.vehicle_assignments
  ADD CONSTRAINT vehicle_assignments_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    daterange(from_date, COALESCE(to_date, 'infinity'::date), '[]') WITH &&
  );

-- ─── Нормы расхода ────────────────────────────────────────────────────────
-- Норма привязывается ровно к одному уровню: к единице техники ИЛИ к модели.
ALTER TABLE public.fuel_norms DROP CONSTRAINT IF EXISTS fuel_norms_single_scope;
ALTER TABLE public.fuel_norms
  ADD CONSTRAINT fuel_norms_single_scope
  CHECK (num_nonnulls(vehicle_id, model_id) = 1);

ALTER TABLE public.fuel_norms DROP CONSTRAINT IF EXISTS fuel_norms_valid_period;
ALTER TABLE public.fuel_norms
  ADD CONSTRAINT fuel_norms_valid_period
  CHECK (valid_to IS NULL OR valid_to >= valid_from);

ALTER TABLE public.fuel_norms DROP CONSTRAINT IF EXISTS fuel_norms_positive_rate;
ALTER TABLE public.fuel_norms
  ADD CONSTRAINT fuel_norms_positive_rate CHECK (base_rate >= 0);

-- Надбавка — либо процент, либо абсолютная величина, но не обе сразу.
ALTER TABLE public.fuel_norm_adjustments
  DROP CONSTRAINT IF EXISTS fuel_norm_adjustments_single_kind;
ALTER TABLE public.fuel_norm_adjustments
  ADD CONSTRAINT fuel_norm_adjustments_single_kind
  CHECK (num_nonnulls(percent, absolute_per_unit) = 1);

ALTER TABLE public.fuel_norm_adjustments
  DROP CONSTRAINT IF EXISTS fuel_norm_adjustments_season;
ALTER TABLE public.fuel_norm_adjustments
  ADD CONSTRAINT fuel_norm_adjustments_season
  CHECK (
    num_nonnulls(season_from_month, season_to_month) IN (0, 2)
    AND (season_from_month IS NULL OR season_from_month BETWEEN 1 AND 12)
    AND (season_to_month   IS NULL OR season_to_month   BETWEEN 1 AND 12)
  );

-- ─── ГСМ ──────────────────────────────────────────────────────────────────
-- Выдача из собственной ёмкости обязана указывать ёмкость,
-- иначе остаток списывать неоткуда.
ALTER TABLE public.fuel_issues DROP CONSTRAINT IF EXISTS fuel_issues_source_consistency;
ALTER TABLE public.fuel_issues
  ADD CONSTRAINT fuel_issues_source_consistency
  CHECK (
    (source = 'TANK' AND tank_id IS NOT NULL)
    OR (source = 'FUEL_CARD' AND fuel_card_id IS NOT NULL)
    OR source IN ('CASH', 'EXTERNAL')
  );

ALTER TABLE public.fuel_issues DROP CONSTRAINT IF EXISTS fuel_issues_positive_volume;
ALTER TABLE public.fuel_issues
  ADD CONSTRAINT fuel_issues_positive_volume CHECK (volume > 0);

ALTER TABLE public.fuel_receipts DROP CONSTRAINT IF EXISTS fuel_receipts_positive_volume;
ALTER TABLE public.fuel_receipts
  ADD CONSTRAINT fuel_receipts_positive_volume CHECK (volume > 0);

ALTER TABLE public.fuel_tanks DROP CONSTRAINT IF EXISTS fuel_tanks_volume_bounds;
ALTER TABLE public.fuel_tanks
  ADD CONSTRAINT fuel_tanks_volume_bounds
  CHECK (current_volume >= 0 AND current_volume <= capacity);

-- ─── Путевые листы ────────────────────────────────────────────────────────
ALTER TABLE public.waybills DROP CONSTRAINT IF EXISTS waybills_period_order;
ALTER TABLE public.waybills
  ADD CONSTRAINT waybills_period_order CHECK (valid_to > valid_from);

-- Показания на возврат не могут быть меньше показаний на выезд.
-- Замена счётчика оформляется записью vehicle_meter_readings с source=ADJUSTMENT.
ALTER TABLE public.waybills DROP CONSTRAINT IF EXISTS waybills_meter_order;
ALTER TABLE public.waybills
  ADD CONSTRAINT waybills_meter_order
  CHECK (
    (odometer_end IS NULL OR odometer_start IS NULL OR odometer_end >= odometer_start)
    AND (engine_hours_end IS NULL OR engine_hours_start IS NULL OR engine_hours_end >= engine_hours_start)
  );

-- Закрытый путевой лист обязан содержать расчёт.
ALTER TABLE public.waybills DROP CONSTRAINT IF EXISTS waybills_closed_complete;
ALTER TABLE public.waybills
  ADD CONSTRAINT waybills_closed_complete
  CHECK (
    status <> 'CLOSED'
    OR (fuel_consumed IS NOT NULL AND fuel_closing IS NOT NULL AND closed_at IS NOT NULL)
  );

-- ─── Офисы ────────────────────────────────────────────────────────────────
ALTER TABLE public.offices DROP CONSTRAINT IF EXISTS offices_winter_months;
ALTER TABLE public.offices
  ADD CONSTRAINT offices_winter_months
  CHECK (winter_from_month BETWEEN 1 AND 12 AND winter_to_month BETWEEN 1 AND 12);

ALTER TABLE public.offices DROP CONSTRAINT IF EXISTS offices_no_self_parent;
ALTER TABLE public.offices
  ADD CONSTRAINT offices_no_self_parent CHECK (parent_id IS DISTINCT FROM id);

-- ─── Мягкое удаление и уникальность ───────────────────────────────────────
-- Prisma создаёт обычные UNIQUE, из-за чего удалённая запись навсегда
-- занимает свой гаражный/табельный номер. Заменяем на частичные индексы.
DROP INDEX IF EXISTS vehicles_office_id_garage_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_office_garage_active_uq
  ON public.vehicles (office_id, garage_number)
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS drivers_office_id_personnel_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS drivers_office_personnel_active_uq
  ON public.drivers (office_id, personnel_number)
  WHERE deleted_at IS NULL;

-- Один активный госномер на страну — номер не может висеть на двух машинах.
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_plate_active_uq
  ON public.vehicles (plate_number)
  WHERE deleted_at IS NULL AND plate_number IS NOT NULL;

-- Одна позиция на технике занята одной шиной.
CREATE UNIQUE INDEX IF NOT EXISTS tire_position_active_uq
  ON public.tire_installations (vehicle_id, position)
  WHERE removed_at IS NULL;

-- Один активный трекер на единицу техники.
CREATE UNIQUE INDEX IF NOT EXISTS gps_device_active_uq
  ON public.gps_devices (vehicle_id)
  WHERE removed_at IS NULL;

-- Ровно одно главное фото на единицу техники: именно оно попадает в списки.
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_primary_photo_uq
  ON public.vehicle_photos (vehicle_id)
  WHERE is_primary;

-- ─── Поиск ────────────────────────────────────────────────────────────────
-- Триграммные индексы под ILIKE '%...%' в списках.
CREATE INDEX IF NOT EXISTS vehicles_search_trgm
  ON public.vehicles USING gin (
    (garage_number || ' ' || COALESCE(plate_number, '')) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS drivers_search_trgm
  ON public.drivers USING gin (
    (last_name || ' ' || first_name || ' ' || COALESCE(middle_name, '')) gin_trgm_ops
  );
