import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { useDashboardShortcuts } from '@/hooks/useDashboardShortcuts';

interface OrganizationDashboardLayoutProps {
  children?: React.ReactNode;
}

export const OrganizationDashboardLayout = ({ children }: OrganizationDashboardLayoutProps) => {
  // Initialize Global Dashboard Shortcuts
  useDashboardShortcuts();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Permanent Desktop Sidebar (Locked on the left) */}
      <Sidebar />

      {/* Main Column: Topbar locked at top, DashboardShell scrolls underneath */}
      <div className="flex flex-1 flex-col h-screen min-w-0 overflow-hidden">
        {/* Permanent Topbar (Locked at top) */}
        <Topbar />

        {/* Scrollable Content Container (The ONLY container that scrolls on long pages) */}
        <DashboardShell variant="default">
          {children || <Outlet />}
        </DashboardShell>
      </div>
    </div>
  );
};

export default OrganizationDashboardLayout;
