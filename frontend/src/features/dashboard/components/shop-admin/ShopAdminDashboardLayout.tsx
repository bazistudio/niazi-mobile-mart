import React, { useState } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileSidebar } from '@/components/layout/MobileSidebar';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const pathname = location.pathname;
  
  // Initialize Real-Time Sync Engine for the entire dashboard
  useSyncEngine();
  
  // Initialize Global Dashboard Shortcuts
  useDashboardShortcuts();

  return (
    <div className="flex flex-1 h-full w-full min-h-0 overflow-hidden bg-background relative">
      {/* Terminal Fast PIN Lock Screen Overlay */}
      <LockScreenOverlay />

      {/* Mobile Sidebar */}
      <MobileSidebar isOpen={mobileMenuOpen} setIsOpen={setMobileMenuOpen} />

      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex w-0 flex-1 flex-col transition-all duration-200 min-h-0 overflow-hidden">
        {/* Topbar: Suppressed inside POS to provide an immersive cashier terminal */}
        {!pathname?.includes('/pos') && (
          <Topbar setMobileMenuOpen={setMobileMenuOpen} />
        )}

        {/* Dashboard Content Area */}
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

