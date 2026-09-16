import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Версия платформы читается из корневого package.json один раз при сборке —
// единый источник правды. Хранить её отдельной строкой ещё и здесь означало
// бы синхронизировать два места руками и рано или поздно получить разъезд.
const rootPackage = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'),
) as { version: string };

export default defineConfig({
  // На GitHub Pages сайт живёт в подкаталоге /<имя-репозитория>/, поэтому пути
  // к ассетам должны быть с префиксом. Задаётся через VITE_BASE только на время
  // такой сборки; локальная разработка и обычный build остаются на корне.
  base: process.env.VITE_BASE ?? '/',
  // Переменные окружения лежат в корне монорепозитория рядом с настройками
  // API. Без этой строки Vite искал бы .env в apps/web, не находил его и
  // молча подставлял значения по умолчанию — VITE_API_URL и ключ карты
  // из корневого файла не доходили бы до приложения вовсе.
  envDir: resolve(__dirname, '../..'),
  define: {
    __APP_VERSION__: JSON.stringify(rootPackage.version),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Общий пакет подключается исходниками, а не сборкой: правка типа
      // или формулы нормы сразу видна в dev-режиме без пересборки.
      '@gsm/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Слушаем на всех интерфейсах. По умолчанию Vite на этой машине занимал
    // только IPv6-loopback (::1), и браузер, резолвящий localhost в 127.0.0.1,
    // получал отказ в соединении. Побочно это открывает dev-сервер в локальной
    // сети — удобно для проверки интерфейса с телефона или планшета.
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
