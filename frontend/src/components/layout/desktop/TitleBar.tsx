import React from 'react';
import { WindowControls } from './WindowControls';
import { DesktopMenus } from './DesktopMenus';
import { useAuthStore } from '@/lib/auth/core/auth.store';

type TitleBarProps = {
  onMenuAction: (action: string) => void;
};

export const TitleBar = ({ onMenuAction }: TitleBarProps) => {
  const { user, isHydrated, isAuthenticated } = useAuthStore();

  let title = 'Setup Required';
  let branch = '';
  
  if (!isHydrated) {
    title = 'Loading Shop...';
  } else if (isAuthenticated && user) {
    const shopName = (user as any).shopName || (user as any).organizationName || 'My Shop';
    title = `🏪 ${shopName}`;
    branch = '📍 Main Branch';
  }

  return (
    <div 
      className="h-9 flex items-center justify-between bg-[#111111] border-b border-white/5 select-none text-gray-300 relative z-[9999]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center h-full">
        <div className="px-3 flex items-center h-full font-bold text-gray-500 tracking-wider text-xs">
          ≡
        </div>

        {/* Menus */}
        <DesktopMenus onAction={onMenuAction} />
      </div>

      {/* Dynamic Window Title */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[13px] font-medium tracking-wide pointer-events-none flex items-center gap-3">
        <span className="text-gray-300">{title}</span>
        {branch && <span className="text-gray-500 text-[11px]">{branch}</span>}
      </div>

      {/* Window Controls (Minimize, Maximize, Close) */}
      <WindowControls />
    </div>
  );
};
