import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ShopAdminDashboardLayout } from '@/features/dashboard/components/shop-admin/ShopAdminDashboardLayout';
import { ShopAdminDashboard } from '@/features/dashboard/components/shop-admin/ShopAdminDashboard';
import { DashboardRedirectPage } from '@/pages/dashboard/DashboardRedirectPage';
import { StaffDashboardPage } from '@/pages/dashboard/staff/StaffDashboardPage';
import { authRoutes } from './authRoutes';
import { organizationRoutes } from './organizationRoutes';
import { shopAdminCoreRoutes } from './shopAdminRoutes';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { NotFoundPage } from '@/pages/NotFoundPage';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Root redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Public-Only Authentication Routes */}
      {authRoutes}

      {/* Protected Application Routes */}
      <Route element={<ProtectedRoute />}>
        {/* Dashboard Hierarchy */}
        <Route path="/dashboard">
          <Route index element={<DashboardRedirectPage />} />
          {organizationRoutes}
          
          {/* Staff Dashboard */}
          <Route path="staff" element={
            <ShopAdminDashboardLayout>
              <StaffDashboardPage />
            </ShopAdminDashboardLayout>
          } />
        </Route>

        {/* Main Shop Admin Shell Layout Route */}
        <Route path="/dashboard/shop-admin" element={<ShopAdminDashboardLayout />}>
          {shopAdminCoreRoutes}
        </Route>
      </Route>

      {/* Catch-all route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRoutes;

