import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { AuthProvider } from './auth/AuthContext';
import './i18n';

// Русская локаль для календарей (неделя с понедельника) и плагин кварталов
// для пресета «Квартал» на странице отчётов.
dayjs.locale('ru');
dayjs.extend(quarterOfYear);

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
    <ConfigProvider
      locale={ruRU}
      theme={{
        token: {
          colorPrimary: '#0b3d6b',
          borderRadius: 6,
        },
      }}
    >
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
    </ConfigProvider>
  </StrictMode>,
);
