import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // На GitHub Pages сайт живёт в подкаталоге /<имя-репозитория>/, поэтому пути
  // к ассетам должны быть с префиксом. Задаётся через VITE_BASE только на время
  // такой сборки; локальная разработка и обычный build остаются на корне.
  base: process.env.VITE_BASE ?? '/',
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
