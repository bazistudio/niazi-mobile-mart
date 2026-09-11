import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ShopAdminDashboardLayout } from '@/features/dashboard/components/shop-admin/ShopAdminDashboardLayout';
import { DashboardRedirectPage } from '@/pages/dashboard/DashboardRedirectPage';
import { StaffDashboardPage } from '@/pages/dashboard/staff/StaffDashboardPage';
import { authRoutes } from './authRoutes';
import { organizationRoutes } from './organizationRoutes';
import { shopAdminCoreRoutes } from './shopAdminRoutes';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { isTauriEnvironment } from '@/lib/tauri/tauriClient';

// Lazy-load storefront components so they are split into a separate bundle chunk
// and never loaded or initialized during Tauri desktop startup.
const StorefrontLayout = lazy(() =>
  import('@/features/storefront/components/StorefrontLayout').then((m) => ({ default: m.StorefrontLayout }))
);
const HomePage = lazy(() => import('@/pages/storefront/HomePage').then((m) => ({ default: m.HomePage })));
const ProductsPage = lazy(() => import('@/pages/storefront/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const AboutPage = lazy(() => import('@/pages/storefront/AboutPage').then((m) => ({ default: m.AboutPage })));
const ContactPage = lazy(() => import('@/pages/storefront/ContactPage').then((m) => ({ default: m.ContactPage })));

const isDesktop = isTauriEnvironment() || import.meta.env.VITE_APP_SURFACE === 'desktop';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Root Route Boundary: In Desktop / Tauri mode, default directly to /auth/login or /dashboard */}
      <Route
        path="/"
        element={
          isDesktop ? (
            <Navigate to="/auth/login" replace />
          ) : (
            <Suspense fallback={<div className="min-h-screen bg-[#00383c]" />}>
              <StorefrontLayout>
                <HomePage />
              </StorefrontLayout>
            </Suspense>
          )
        }
      />

      {/* Storefront Routes (Web Mode Only) */}
      {!isDesktop ? (
        <>
          <Route
            path="/products"
            element={
              <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
                <StorefrontLayout>
                  <ProductsPage />
                </StorefrontLayout>
              </Suspense>
            }
          />
          <Route
            path="/about"
            element={
              <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
                <StorefrontLayout>
                  <AboutPage />
                </StorefrontLayout>
              </Suspense>
            }
          />
          <Route
            path="/contact"
            element={
              <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
                <StorefrontLayout>
                  <ContactPage />
                </StorefrontLayout>
              </Suspense>
            }
          />
        </>
      ) : (
        <>
          <Route path="/products" element={<Navigate to="/dashboard/shop-admin/inventory" replace />} />
          <Route path="/about" element={<Navigate to="/dashboard/shop-admin" replace />} />
          <Route path="/contact" element={<Navigate to="/dashboard/shop-admin" replace />} />
        </>
      )}

      {/* Public-Only Authentication Routes */}
      {authRoutes}

      {/* Protected Application Routes */}
      <Route element={<ProtectedRoute />}>
        {/* Dashboard Hierarchy */}
        <Route path="/dashboard">
          <Route index element={<DashboardRedirectPage />} />
          {organizationRoutes}

          {/* Staff Dashboard */}
          <Route
            path="staff"
            element={
              <ShopAdminDashboardLayout>
                <StaffDashboardPage />
              </ShopAdminDashboardLayout>
            }
          />
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
