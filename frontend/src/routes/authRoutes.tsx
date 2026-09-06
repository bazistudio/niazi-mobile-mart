import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import { PublicOnlyRoute } from '@/components/auth/PublicOnlyRoute';
import { LoginPage } from '@/pages/auth/LoginPage';
import { SignupPage } from '@/pages/auth/SignupPage';
import { PendingPage } from '@/pages/auth/PendingPage';
import { RejectedPage } from '@/pages/auth/RejectedPage';
import { SuspendedPage } from '@/pages/auth/SuspendedPage';
import { FirstAdminBootstrapPage } from '@/pages/auth/FirstAdminBootstrapPage';
import { AdminRecoveryPage } from '@/pages/auth/AdminRecoveryPage';

export const authRoutes = (
  <Route path="auth" element={<PublicOnlyRoute />}>
    <Route index element={<Navigate to="/auth/login" replace />} />
    <Route path="login" element={<LoginPage />} />
    <Route path="signup" element={<SignupPage />} />
    <Route path="pending" element={<PendingPage />} />
    <Route path="rejected" element={<RejectedPage />} />
    <Route path="suspended" element={<SuspendedPage />} />
    <Route path="bootstrap" element={<FirstAdminBootstrapPage />} />
    <Route path="recover-admin" element={<AdminRecoveryPage />} />
  </Route>
);
