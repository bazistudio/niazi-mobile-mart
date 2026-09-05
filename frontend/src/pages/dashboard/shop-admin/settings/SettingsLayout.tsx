import React from 'react';
import { Outlet } from 'react-router-dom';
import { SettingsSidebar } from '@/features/settings/components/SettingsSidebar';

export const SettingsLayout: React.FC = () => {
  return (
    <div className="flex flex-col md:flex-row gap-8 w-full max-w-7xl mx-auto pb-12">
      <SettingsSidebar />
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
};
