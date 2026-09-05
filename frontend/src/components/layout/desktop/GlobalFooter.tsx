'use client';

import React from 'react';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { ShieldCheck, Circle, Command, Keyboard } from 'lucide-react';

export const GlobalFooter: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const displayName = (user as any)?.name || (user as any)?.username || 'Shop Admin';
  const role = user?.role || 'SHOP_ADMIN';

  return (
    <footer className="h-7 w-full border-t border-border bg-surface/90 backdrop-blur-xs px-3 sm:px-4 flex items-center justify-between text-[11px] text-text-muted flex-shrink-0 select-none z-10">
      {/* Left: Branding & Status */}
      <div className="flex items-center gap-2.5">
        <span className="font-semibold text-text-secondary flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-success inline-block animate-pulse" />
          TijaratPro POS
        </span>
        <span className="hidden sm:inline text-border">|</span>
        <span className="hidden sm:inline-flex items-center gap-1 text-text-muted">
          <ShieldCheck className="h-3 w-3 text-primary" />
          Ready
        </span>
      </div>

      {/* Center: Essential Keyboard Shortcuts */}
      <div className="hidden lg:flex items-center gap-3 text-[11px] text-text-muted">
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.2 rounded bg-surface-hover border border-border text-[10px] font-mono text-text-secondary">Ctrl+L</kbd> Lock
        </span>
        <span className="text-border">•</span>
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.2 rounded bg-surface-hover border border-border text-[10px] font-mono text-text-secondary">Ctrl+P</kbd> POS
        </span>
        <span className="text-border">•</span>
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.2 rounded bg-surface-hover border border-border text-[10px] font-mono text-text-secondary">Ctrl+D</kbd> Dashboard
        </span>
        <span className="text-border">•</span>
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.2 rounded bg-surface-hover border border-border text-[10px] font-mono text-text-secondary">Ctrl+I</kbd> Inventory
        </span>
      </div>

      {/* Right: Active Cashier & Version */}
      <div className="flex items-center gap-2 text-text-muted">
        <span className="truncate max-w-[120px] sm:max-w-xs">
          Cashier: <strong className="font-medium text-text-secondary">{displayName}</strong>
        </span>
        <span className="hidden md:inline text-border">|</span>
        <span className="hidden md:inline font-mono text-[10px]">v0.1.4</span>
      </div>
    </footer>
  );
};

export default GlobalFooter;
