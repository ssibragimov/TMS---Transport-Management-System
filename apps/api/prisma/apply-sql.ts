/**
 * Применяет SQL-скрипты из prisma/sql после миграций Prisma.
 *
 * Почему не обычные миграции Prisma: политики RLS, exclusion-constraint'ы,
 * гипертаблицы TimescaleDB и колонки PostGIS Prisma не умеет описать в схеме,
 * а вручную дописанные migration.sql затираются при каждом `migrate dev`.
 * Поэтому они живут отдельно и переприменяются идемпотентно после каждой миграции.
 *
 * Подключается напрямую через pg, а не через Prisma: нужен простой протокол
 * запросов, который допускает несколько инструкций и DO-блоки в одном файле.
 *
 * Запуск: npm run db:apply-sql -w @gsm/api
 */

import './env';

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const SQL_DIR = join(__dirname, 'sql');

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL не задан. Скопируйте .env.example в .env.');
  }

  // Подключаемся владельцем схемы: политики RLS на него не действуют,
  // а прав прикладной роли на DDL не хватит.
  const client = new Client({ connectionString });
  await client.connect();

  // Не в каждой среде есть PostGIS и TimescaleDB: локальная portable-сборка
  // PostgreSQL идёт без них. Такие скрипты пропускаются явно, чтобы отсутствие
  // расширения не выглядело как поломка миграции.
  // Пример: SKIP_SQL=03_telemetry.sql
  const skip = new Set(
    (process.env.SKIP_SQL ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const all = readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();
  const files = all.filter((f) => !skip.has(f));

  for (const skipped of all.filter((f) => skip.has(f))) {
    console.warn(`  → ${skipped} ... пропущен (SKIP_SQL)`);
  }

  if (files.length === 0) {
    console.warn('В prisma/sql нет ни одного .sql-файла к выполнению');
    return;
  }

  try {
    for (const file of files) {
      const sql = readFileSync(join(SQL_DIR, file), 'utf8');
      process.stdout.write(`  → ${file} ... `);
      try {
        await client.query(sql);
        process.stdout.write('ok\n');
      } catch (error) {
        process.stdout.write('ОШИБКА\n');
        throw new Error(
          `Скрипт ${file} не выполнился: ${(error as Error).message}`,
          { cause: error },
        );
      }
    }
    console.log(`\nПрименено скриптов: ${files.length}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
