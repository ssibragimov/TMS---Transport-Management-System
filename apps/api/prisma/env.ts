/**
 * Загрузка .env для скриптов, запускаемых напрямую через ts-node
 * (seed, apply-sql). Nest в рантайме читает конфигурацию сам,
 * а CLI-скрипты идут мимо него.
 *
 * .env лежит в корне монорепозитория: параметры БД общие для api и инфраструктуры.
 */
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const candidates = [
  resolve(__dirname, '../../../.env'), // корень монорепозитория
  resolve(__dirname, '../.env'), // локальный .env приложения
];

for (const path of candidates) {
  if (existsSync(path)) config({ path });
}
