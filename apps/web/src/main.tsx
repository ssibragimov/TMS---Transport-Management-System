import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';

import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { localeDescriptor } from './i18n';
import './i18n';
import './styles.css';

// Плагин кварталов нужен пресету «Квартал» на странице отчётов.
// Локаль dayjs выставляется в i18n и меняется вместе с языком интерфейса.
dayjs.extend(quarterOfYear);

/**
 * Локаль Ant Design обязана следовать за языком: иначе интерфейс переведён,
 * а календари, пагинация и «Нет данных» остаются на языке по умолчанию.
 * Компонент подписан на i18n через useTranslation и перерисовывается сам.
 */
function LocalizedConfigProvider({ children }: { children: ReactNode }) {
  const { i18n: instance } = useTranslation();

  return (
    <ConfigProvider
      locale={localeDescriptor(instance.language).antd}
      theme={{
        token: {
          colorPrimary: '#0b3d6b',
          borderRadius: 6,
        },
      }}
      // По умолчанию antd растягивает (и сжимает) выпадающий список ровно
      // под ширину самого поля — на разных страницах поля разной ширины,
      // и список у длинных названий (водителей, техники, адресов) либо
      // обрезался, либо вариант переносился на две строки. false переключает
      // на «не уже поля, но шире — если нужно под текст»: список больше не
      // скачет по ширине от страницы к странице и не обрезает текст.
      popupMatchSelectWidth={false}
    >
      {children}
    </ConfigProvider>
  );
}

/*
  Обновление приложения. Сайт кеширует себя в браузере (PWA), и без этого
  блока новая версия подхватывалась лишь со второго открытия страницы: пока
  вкладка жива, она показывала старую сборку. Здесь браузер сам проверяет
  наличие новой версии — при открытии, при возвращении на вкладку и раз в
  полчаса, — а найдя её, перезагружает страницу (режим autoUpdate).
*/
const UPDATE_CHECK_MS = 30 * 60_000;

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = (): void => {
      void registration.update().catch(() => undefined);
    };
    window.setInterval(check, UPDATE_CHECK_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Данные учётной системы меняются постоянно, но не ежесекундно.
      // Минута — компромисс между свежестью и нагрузкой на API.
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocalizedConfigProvider>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          {/* BASE_URL совпадает с base из vite.config: при сборке под
              GitHub Pages роутер должен знать про префикс подкаталога. */}
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </LocalizedConfigProvider>
  </StrictMode>,
);
