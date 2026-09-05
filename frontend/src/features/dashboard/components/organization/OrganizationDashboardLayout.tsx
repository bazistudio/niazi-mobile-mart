'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileSidebar } from '@/components/layout/MobileSidebar';
import { Topbar } from '@/components/layout/Topbar';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { useDashboardShortcuts } from '@/hooks/useDashboardShortcuts';

interface OrganizationDashboardLayoutProps {
  children: React.ReactNode;
}

export const OrganizationDashboardLayout = ({ children }: OrganizationDashboardLayoutProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  
  // Initialize Global Dashboard Shortcuts
  useDashboardShortcuts();

  return (
    <div className="flex flex-1 h-full w-full min-h-0 overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Mobile Sidebar */}
      <MobileSidebar isOpen={mobileMenuOpen} setIsOpen={setMobileMenuOpen} />

      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex w-0 flex-1 flex-col transition-all duration-200">
        {/* Topbar */}
        <Topbar setMobileMenuOpen={setMobileMenuOpen} />

        {/* Dashboard Content Area */}
        <DashboardShell variant="default">
          {children}
        </DashboardShell>
      </div>
    </div>
  );
};

export default OrganizationDashboardLayout;
