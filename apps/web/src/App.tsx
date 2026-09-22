import { Spin } from 'antd';
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from '@/auth/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { AdminPage } from '@/pages/AdminPage';
import { AuditPage } from '@/pages/AuditPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DriversPage } from '@/pages/DriversPage';
import { FuelPage } from '@/pages/FuelPage';
import { LoginPage } from '@/pages/LoginPage';
import { MedicalPage } from '@/pages/MedicalPage';
import { TechnicalPage } from '@/pages/TechnicalPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { StockPage } from '@/pages/StockPage';
import { UsersPage } from '@/pages/UsersPage';
import { VehiclesPage } from '@/pages/VehiclesPage';
import { ViolationsPage } from '@/pages/ViolationsPage';
import { ViolationPrintPage } from '@/pages/violations/ViolationPrintPage';
import { WaybillsPage } from '@/pages/WaybillsPage';
import { WaybillPrintPage } from '@/pages/waybills/WaybillPrintPage';

/**
 * Телеметрия грузится отдельным куском.
 *
 * Библиотека карты весит около двух мегабайт — больше, чем всё остальное
 * приложение вместе взятое. Диспетчер, работающий с путевыми листами,
 * не должен ждать её загрузки на входе в систему.
 */
const TelemetryPage = lazy(() =>
  import('@/pages/TelemetryPage').then((m) => ({ default: m.TelemetryPage })),
);

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/*
        Печатная форма — вне AppLayout: открывается в новой вкладке
        и должна показывать только сам документ, без тёмного сайдбара
        и шапки, которые иначе попали бы в печать вместе с ним.
      */}
      <Route
        path="/waybills/:id/print"
        element={user ? <WaybillPrintPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/violations/:id/print"
        element={user ? <ViolationPrintPage /> : <Navigate to="/login" replace />}
      />

      <Route element={user ? <AppLayout /> : <Navigate to="/login" replace />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/vehicles" element={<VehiclesPage />} />
        <Route path="/drivers" element={<DriversPage />} />
        <Route path="/fuel" element={<FuelPage />} />
        <Route path="/waybills" element={<WaybillsPage />} />
        <Route path="/medical" element={<MedicalPage />} />
        <Route path="/violations" element={<ViolationsPage />} />
        <Route path="/technical" element={<TechnicalPage />} />
        <Route path="/stock" element={<StockPage />} />
        <Route
          path="/telemetry"
          element={
            <Suspense
              fallback={
                <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
                  <Spin size="large" />
                </div>
              }
            >
              <TelemetryPage />
            </Suspense>
          }
        />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/audit" element={<AuditPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
