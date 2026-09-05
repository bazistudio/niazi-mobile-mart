import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ShopAdminDashboardLayout } from '@/features/dashboard/components/shop-admin/ShopAdminDashboardLayout';
import { ShopAdminDashboard } from '@/features/dashboard/components/shop-admin/ShopAdminDashboard';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Root redirect */}
      <Route path="/" element={<Navigate to="/dashboard/shop-admin" replace />} />

      {/* Main Dashboard Shell Layout Route */}
      <Route path="/dashboard" element={<ShopAdminDashboardLayout />}>
        <Route index element={<Navigate to="/dashboard/shop-admin" replace />} />
        <Route path="shop-admin" element={<ShopAdminDashboard />} />
      </Route>

      {/* Direct route for backwards compatibility / direct deep links */}
      <Route path="/dashboard/shop-admin" element={
        <ShopAdminDashboardLayout>
          <ShopAdminDashboard />
        </ShopAdminDashboardLayout>
      } />

      {/* Catch-all route */}
      <Route path="*" element={<Navigate to="/dashboard/shop-admin" replace />} />
    </Routes>
  );
};

export default AppRoutes;
