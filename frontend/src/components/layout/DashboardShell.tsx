'use client';

import React, { ReactNode } from 'react';

interface DashboardShellProps {
  children: ReactNode;
  variant?: 'default' | 'pos' | 'reports';
}

export const DashboardShell = ({ children, variant = 'default' }: DashboardShellProps) => {
  if (variant === 'pos') {
    return (
      <main className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-950 flex flex-col w-full min-h-0">
        {children}
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 transition-colors duration-200">
      <div className="mx-auto max-w-[1800px] py-6 sm:py-8 px-4 sm:px-6 md:px-8" style={{ zoom: 0.8 }}>
        {children}
      </div>
    </main>
  );
};

export default DashboardShell;
