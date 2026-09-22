#!/bin/sh
# Подготовка базы перед стартом API.
#
# Выполняется при каждом запуске контейнера, поэтому всё здесь обязано быть
# идемпотентным: на free-плане Render контейнер засыпает без запросов и
# поднимается заново, и повторный прогон не должен ничего ломать.
set -e

cd /app/apps/api

echo "==> prisma migrate deploy"
# Именно deploy, а не dev: dev требует интерактивного терминала и способен
# пересоздать базу, что на боевом стенде недопустимо.
npx prisma migrate deploy

echo "==> применение SQL-скриптов (RLS, constraints)"
# Политики RLS и exclusion-constraint'ы Prisma описать не умеет, они живут
# в prisma/sql и переприменяются идемпотентно после каждой миграции.
# В управляемом PostgreSQL обычно нет PostGIS и TimescaleDB, поэтому
# 03_telemetry.sql пропускается через SKIP_SQL.
#
# --transpile-only обязателен здесь: без него ts-node держит в памяти полную
# проверку типов всего проекта (а не только этого файла), и на контейнере
# с 512 МБ RAM (бесплатный план Render) процесс падает с
# "JavaScript heap out of memory" ещё до того, как скрипт вообще начнёт
# работать с базой. Типы уже проверены на этапе сборки (npm run build) —
# перепроверять их ещё раз при каждом запуске контейнера незачем.
npx ts-node --transpile-only --project tsconfig.scripts.json -r tsconfig-paths/register prisma/apply-sql.ts

# Сид — только по явному флагу. Он тяжёлый (демо-история за 30 дней), и гонять
# его на каждом пробуждении контейнера нельзя. Ставится в true на первый
# деплой, после чего убирается из переменных окружения.
if [ "${SEED_ON_START}" = "true" ]; then
  echo "==> заполнение начальными данными"
  npx ts-node --transpile-only --project tsconfig.scripts.json -r tsconfig-paths/register prisma/seed.ts
else
  echo "==> сид пропущен (SEED_ON_START не равен true)"
fi

cd /app

echo "==> запуск API"
exec "$@"
