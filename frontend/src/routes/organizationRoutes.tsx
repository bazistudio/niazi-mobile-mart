import React from 'react';
import { Route } from 'react-router-dom';
import { OrganizationDashboardLayout } from '@/features/dashboard/components/organization/OrganizationDashboardLayout';
import { OrganizationDashboardPage } from '@/pages/dashboard/organization/OrganizationDashboardPage';
import { ShopsManagementPage } from '@/pages/dashboard/organization/ShopsManagementPage';
import { StaffManagementPage } from '@/pages/dashboard/organization/StaffManagementPage';
import { OrganizationSettingsPage } from '@/pages/dashboard/organization/OrganizationSettingsPage';
import { AuditLogsPage } from '@/pages/dashboard/organization/AuditLogsPage';

export const organizationRoutes = (
  <Route path="organization" element={<OrganizationDashboardLayout />}>
    <Route index element={<OrganizationDashboardPage />} />
    <Route path="shops" element={<ShopsManagementPage />} />
    <Route path="staff" element={<StaffManagementPage />} />
    <Route path="settings" element={<OrganizationSettingsPage />} />
    <Route path="audit-logs" element={<AuditLogsPage />} />
  </Route>
);
