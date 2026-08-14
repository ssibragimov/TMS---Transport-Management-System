-- Подготовка УПРАВЛЯЕМОГО PostgreSQL (Neon, Render, Supabase) под этот проект.
--
-- Локально то же самое делает docker/postgres/init/01-init.sh при первом
-- создании тома, но в облаке этот скрипт не выполняется: базу создаёт
-- провайдер. Поэтому здесь то же самое, но без расширений, которых в
-- управляемых инстансах обычно нет (postgis, timescaledb) — блок телеметрии
-- всё равно отключается через SKIP_SQL=03_telemetry.sql.
--
-- Выполнять ОДИН РАЗ, подключившись владельцем базы, ДО первого старта API.
-- Перед запуском заменить ЗАМЕНИТЬ_ПАРОЛЬ на пароль прикладной роли —
-- тот же, что уйдёт в APP_DATABASE_URL.
--
-- Зачем отдельная роль: RLS в PostgreSQL НЕ действует на владельца таблиц и
-- на суперпользователя. Если API подключится тем же пользователем, которым
-- выполнялись миграции, политики будут молча проигнорированы и сотрудник
-- одного аэропорта увидит данные всех. Проверить после старта можно по
-- логу API: строка «RLS активен, соединение под ролью gsm_app».

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gsm_app') THEN
        CREATE ROLE gsm_app LOGIN PASSWORD 'ЗАМЕНИТЬ_ПАРОЛЬ';
    END IF;
END
$$;

-- Имя базы в GRANT нельзя подставить выражением, поэтому собираем команду
-- динамически: у разных провайдеров база называется по-разному.
DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO gsm_app', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO gsm_app;

-- Права на уже существующие объекты...
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gsm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gsm_app;

-- ...и на всё, что Prisma создаст миграциями позже. Владелец подставляется
-- текущим пользователем: именно под ним будут выполняться migrate deploy.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gsm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO gsm_app;
