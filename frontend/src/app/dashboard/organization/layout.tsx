import React from 'react';
import { OrganizationDashboardLayout } from '@/features/dashboard/components/organization/OrganizationDashboardLayout';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <OrganizationDashboardLayout>
      {children}
    </OrganizationDashboardLayout>
  );
}
