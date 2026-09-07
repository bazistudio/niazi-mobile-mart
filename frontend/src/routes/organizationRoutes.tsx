import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { OrganizationDashboardLayout } from '@/features/dashboard/components/organization/OrganizationDashboardLayout';
import { OrganizationDashboardPage } from '@/pages/dashboard/organization/OrganizationDashboardPage';
import { ShopsManagementPage } from '@/pages/dashboard/organization/ShopsManagementPage';
import { StaffManagementPage } from '@/pages/dashboard/organization/StaffManagementPage';
import { OrganizationRolesPage } from '@/pages/dashboard/organization/OrganizationRolesPage';
import { AuditLogsPage } from '@/pages/dashboard/organization/AuditLogsPage';
import { OrganizationReportsPage } from '@/pages/dashboard/organization/OrganizationReportsPage';
import { OrganizationHistoryPage } from '@/pages/dashboard/organization/OrganizationHistoryPage';
import { OrganizationBusinessPage } from '@/pages/dashboard/organization/OrganizationBusinessPage';
import { OrganizationLedgerPage } from '@/pages/dashboard/organization/OrganizationLedgerPage';
import { OrganizationAnalyticsPage } from '@/pages/dashboard/organization/OrganizationAnalyticsPage';
import { OrganizationSocialPage } from '@/pages/dashboard/organization/OrganizationSocialPage';
import { OrganizationProductsPage } from '@/pages/dashboard/organization/OrganizationProductsPage';
import { OrganizationCustomersPage } from '@/pages/dashboard/organization/OrganizationCustomersPage';
import { OrganizationSuppliersPage } from '@/pages/dashboard/organization/OrganizationSuppliersPage';
import { OrganizationPartiesPage } from '@/pages/dashboard/organization/OrganizationPartiesPage';
import { OrganizationProfilePage } from '@/pages/dashboard/organization/OrganizationProfilePage';
import { OrganizationSettingsPage } from '@/pages/dashboard/organization/OrganizationSettingsPage';

export const organizationRoutes = (
  <Route element={<RoleGuard allowedRoles={['SUPER_ADMIN', 'MULTI_ADMIN', 'OWNER', 'ADMIN']} fallbackPath="/dashboard/shop-admin" />}>
    <Route path="organization" element={<OrganizationDashboardLayout />}>
      {/* 1. Dashboard */}
      <Route index element={<OrganizationDashboardPage />} />
      
      {/* 2. Shops */}
      <Route path="shops" element={<ShopsManagementPage />} />
      
      {/* 3. Employees (with legacy staff alias) */}
      <Route path="employees" element={<StaffManagementPage />} />
      <Route path="staff" element={<Navigate to="/dashboard/organization/employees" replace />} />
      
      {/* 4. Audit Log */}
      <Route path="audit-logs" element={<AuditLogsPage />} />
      
      {/* Organization Profile (Moved to Settings) */}
      <Route path="profile" element={<Navigate to="/dashboard/organization/settings?tab=profile" replace />} />
      
      {/* Roles (Consolidated into Settings) */}
      <Route path="roles" element={<Navigate to="/dashboard/organization/settings?tab=roles" replace />} />
      
      {/* 7. Reports */}
      <Route path="reports" element={<OrganizationReportsPage />} />
      
      {/* 8. History */}
      <Route path="history" element={<OrganizationHistoryPage />} />
      
      {/* 9. Business */}
      <Route path="business" element={<OrganizationBusinessPage />} />
      
      {/* 10. Ledger */}
      <Route path="ledger" element={<OrganizationLedgerPage />} />
      
      {/* 11. Analytics */}
      <Route path="analytics" element={<OrganizationAnalyticsPage />} />
      
      {/* 12. Social */}
      <Route path="social" element={<OrganizationSocialPage />} />
      
      {/* 13. Products */}
      <Route path="products" element={<OrganizationProductsPage />} />
      
      {/* 14. Customers */}
      <Route path="customers" element={<OrganizationCustomersPage />} />
      
      {/* 15. Suppliers */}
      <Route path="suppliers" element={<OrganizationSuppliersPage />} />
      
      {/* 16. Parties */}
      <Route path="parties" element={<OrganizationPartiesPage />} />
      
      {/* 17. Settings */}
      <Route path="settings" element={<OrganizationSettingsPage />} />
    </Route>
  </Route>
);

export default organizationRoutes;
