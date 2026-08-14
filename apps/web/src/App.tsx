import { Spin } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from '@/auth/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { AdminPage } from '@/pages/AdminPage';
import { AuditPage } from '@/pages/AuditPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DriversPage } from '@/pages/DriversPage';
import { FuelPage } from '@/pages/FuelPage';
import { LoginPage } from '@/pages/LoginPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { UsersPage } from '@/pages/UsersPage';
import { VehiclesPage } from '@/pages/VehiclesPage';
import { WaybillsPage } from '@/pages/WaybillsPage';

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

      <Route element={user ? <AppLayout /> : <Navigate to="/login" replace />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/vehicles" element={<VehiclesPage />} />
        <Route path="/drivers" element={<DriversPage />} />
        <Route path="/fuel" element={<FuelPage />} />
        <Route path="/waybills" element={<WaybillsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/audit" element={<AuditPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
