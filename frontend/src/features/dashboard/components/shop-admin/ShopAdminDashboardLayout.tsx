import React from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { LockScreenOverlay } from '@/components/layout/LockScreenOverlay';
import { GlobalFooter } from '@/components/layout/GlobalFooter';
import { useSyncEngine } from '@/features/realtime-sync/hooks/useSyncEngine';
import { useDashboardShortcuts } from '@/hooks/useDashboardShortcuts';

interface ShopAdminDashboardLayoutProps {
  children?: React.ReactNode;
}

export const ShopAdminDashboardLayout = ({ children }: ShopAdminDashboardLayoutProps) => {
  const location = useLocation();
  const pathname = location.pathname;
  
  // Initialize Real-Time Sync Engine for the entire dashboard
  useSyncEngine();
  
  // Initialize Global Dashboard Shortcuts
  useDashboardShortcuts();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background relative">
      {/* Terminal Fast PIN Lock Screen Overlay */}
      <LockScreenOverlay />

      {/* Permanent Desktop Sidebar (Locked on the left) */}
      <Sidebar />

      {/* Main Content Column */}
      <div className="flex flex-1 flex-col h-screen min-w-0 overflow-hidden">
        {/* Topbar: Locked at top (Suppressed inside POS to provide immersive cashier view) */}
        {!pathname?.includes('/pos') && (
          <Topbar />
        )}

        {/* Scrollable Content Container (The ONLY container that scrolls) */}
        <DashboardShell variant={pathname?.includes('/pos') ? 'pos' : 'default'}>
          {children || <Outlet />}
        </DashboardShell>

        {/* Global Desktop Footer */}
        <GlobalFooter />
      </div>
    </div>
  );
};

export default ShopAdminDashboardLayout;
