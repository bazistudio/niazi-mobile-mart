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
import { StorefrontLayout } from '@/features/storefront/components/StorefrontLayout';
import { HomePage } from '@/pages/storefront/HomePage';
import { ProductsPage } from '@/pages/storefront/ProductsPage';
import { AboutPage } from '@/pages/storefront/AboutPage';
import { ContactPage } from '@/pages/storefront/ContactPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Storefront Routes */}
      <Route path="/" element={<StorefrontLayout><HomePage /></StorefrontLayout>} />
      <Route path="/products" element={<StorefrontLayout><ProductsPage /></StorefrontLayout>} />
      <Route path="/about" element={<StorefrontLayout><AboutPage /></StorefrontLayout>} />
      <Route path="/contact" element={<StorefrontLayout><ContactPage /></StorefrontLayout>} />

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

