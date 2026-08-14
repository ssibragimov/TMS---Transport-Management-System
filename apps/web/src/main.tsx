import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';

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
    >
      {children}
    </ConfigProvider>
  );
}

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
