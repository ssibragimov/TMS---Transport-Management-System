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

/*
 * Журнал путевых листов — самый открываемый экран системы.
 *
 * Запрос у него один: «последние листы этого офиса», то есть фильтр по
 * office_id с сортировкой по дате начала. Индекс (office_id, status,
 * valid_from) для него не годится: status стоит между колонками и рвёт
 * порядок, поэтому планировщик читал таблицу целиком — тридцать тысяч строк
 * ради двадцати пяти на экране. На месячном объёме это 39 мс и незаметно,
 * а при пятилетнем хранении превратится в секунды на каждое открытие.
 *
 * Индекс частичный: удалённые листы в журнале не показываются, и держать
 * их в индексе незачем. Prisma частичные индексы описывать не умеет —
 * отсюда и место в этом файле.
 */
CREATE INDEX IF NOT EXISTS waybills_office_recent_idx
  ON public.waybills (office_id, valid_from DESC)
  WHERE deleted_at IS NULL;

-- ─── Склад ТМЦ ────────────────────────────────────────────────────────────
/*
 * Остаток не может уйти в минус.
 *
 * Проверка есть и в сервисе, с понятным сообщением («на складе 12 л»),
 * но здесь она стоит как последний рубеж: списание идёт из нескольких мест
 * (выдача, перемещение, списание, наряд-заказ), и одна забытая проверка
 * означает отрицательный остаток, который потом никто не объяснит.
 */
ALTER TABLE public.stock_balances DROP CONSTRAINT IF EXISTS stock_balances_non_negative;
ALTER TABLE public.stock_balances
  ADD CONSTRAINT stock_balances_non_negative CHECK (quantity >= 0);

-- Движение с нулевым количеством — всегда ошибка ввода: документ проведён,
-- в журнале строка есть, а остаток не изменился.
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_nonzero;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_nonzero CHECK (quantity <> 0);

-- Знак количества обязан соответствовать типу движения. Без этой проверки
-- ошибка в знаке даёт приход вместо расхода — остаток растёт, ценности уходят.
-- Корректировка по инвентаризации исключена: она принимает оба знака.
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_sign;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_sign CHECK (
    (type IN ('RECEIPT', 'RETURN', 'USED_RETURN', 'TRANSFER_IN') AND quantity > 0)
    OR (type IN ('ISSUE', 'WRITE_OFF', 'TRANSFER_OUT') AND quantity < 0)
    OR type = 'INVENTORY_ADJ'
  );

-- Выдача обязана называть получателя: водителя из картотеки либо сотрудника.
-- Документ без получателя не отвечает на главный вопрос кладовщика — «кому».
ALTER TABLE public.stock_documents DROP CONSTRAINT IF EXISTS stock_documents_recipient;
ALTER TABLE public.stock_documents
  ADD CONSTRAINT stock_documents_recipient CHECK (
    kind <> 'ISSUE'
    OR recipient_driver_id IS NOT NULL
    OR recipient_user_id IS NOT NULL
  );

-- Перемещению нужен склад-приёмник, и он обязан отличаться от склада-отправителя.
ALTER TABLE public.stock_documents DROP CONSTRAINT IF EXISTS stock_documents_transfer_target;
ALTER TABLE public.stock_documents
  ADD CONSTRAINT stock_documents_transfer_target CHECK (
    kind <> 'TRANSFER'
    OR (target_warehouse_id IS NOT NULL AND target_warehouse_id <> warehouse_id)
  );

-- Списание без причины — это и есть недостача, оформленная документом.
ALTER TABLE public.stock_documents DROP CONSTRAINT IF EXISTS stock_documents_write_off_reason;
ALTER TABLE public.stock_documents
  ADD CONSTRAINT stock_documents_write_off_reason CHECK (
    kind <> 'WRITE_OFF' OR (reason IS NOT NULL AND length(btrim(reason)) >= 5)
  );

-- Код склада уникален в пределах офиса, но удалённый склад не должен
-- занимать свой код навсегда — отсюда частичный индекс.
DROP INDEX IF EXISTS warehouses_office_id_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_office_code_active_uq
  ON public.warehouses (office_id, code)
  WHERE deleted_at IS NULL;

-- Поиск по номенклатуре: кладовщик ищет «масл», «аккум», «фильтр воздуш».
CREATE INDEX IF NOT EXISTS spare_parts_search_trgm
  ON public.spare_parts USING gin (
    (name || ' ' || code || ' ' || COALESCE(catalog_number, '')) gin_trgm_ops
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

-- Служебный внутренний номер НЕ уникален: один аппарат стоит в диспетчерской
-- на всю смену, и номер закреплён сразу за несколькими сотрудниками.
-- Индекс уникальности существовал в ранних сборках — снимаем его явно,
-- иначе на уже развёрнутых базах он останется и продолжит отклонять вторую
-- запись с тем же номером.
DROP INDEX IF EXISTS users_internal_number_active_uq;

-- Ровно четыре цифры. Проверка в СУБД, а не только в DTO: номер приходит
-- ещё и из seed'а, который валидацию Nest не проходит.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_internal_number_format;
ALTER TABLE public.users
  ADD CONSTRAINT users_internal_number_format
  CHECK (internal_number IS NULL OR internal_number ~ '^[0-9]{4}$');

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
