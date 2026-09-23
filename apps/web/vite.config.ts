import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
  plugins: [
    react(),
    // Делает сайт устанавливаемым как приложение (иконка на экране планшета,
    // запуск без адресной строки) и кеширует интерфейс service worker'ом —
    // нужно сотрудникам БД, оформляющим нарушения в поле с планшета.
    // API-запросы этот кеш не трогает: перехватываются только файлы сборки
    // (JS/CSS/иконки), поэтому данные всегда идут напрямую к серверу и не
    // могут "протухнуть" или показать чужой офис из кеша.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'ГСМ — учёт спецтранспорта аэропортов',
        short_name: 'ГСМ',
        description: 'Учёт спецтранспорта, топлива и нарушений на территории аэропорта',
        lang: 'ru',
        theme_color: '#0b3d6b',
        background_color: '#0b3d6b',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Долгое нажатие на иконку установленного приложения (Android; на iOS
        // не поддерживается) сразу предлагает открыть экран оформления
        // нарушения — сотруднику БД не нужно сначала попадать в общее меню.
        shortcuts: [
          {
            name: 'Оформить нарушение',
            url: '/field/violations',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        // Каждый деплой меняет содержимое сборки, поэтому старый precache
        // сразу заменяется новым при следующем открытии — без этого
        // сотрудник мог бы неделями работать со старой версией экрана.
        cleanupOutdatedCaches: true,
        // Главный JS-бандл (карта, графики) больше дефолтного лимита 2 МБ —
        // без этого workbox молча не кладёт его в precache вообще, и сайт
        // без сети не откроется.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
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
