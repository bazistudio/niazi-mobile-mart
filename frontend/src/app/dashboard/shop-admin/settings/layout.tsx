import React from 'react';
import { SettingsSidebar } from '@/features/settings/components/SettingsSidebar';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row gap-8 w-full max-w-7xl mx-auto pb-12">
      <SettingsSidebar />
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}
