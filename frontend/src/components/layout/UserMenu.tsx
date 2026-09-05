'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Settings, LogOut, ChevronDown, Loader2, User as UserIcon } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/core/auth.store';

/** Derive initials from a display name string */
function getInitials(name?: string | null): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const UserMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const logoutAsync = useAuthStore((s) => s.logoutAsync);
  const user = useAuthStore((s) => s.user);

  const displayName = (user as any)?.name || (user as any)?.username || 'Admin';
  const email = (user as any)?.email || '';
  const initials = getInitials(displayName);

  // Click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const menuItemClass =
    'group flex w-full items-center gap-3 px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors duration-fast focus-visible:outline-none focus-visible:bg-surface-hover';

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        id="user-menu-button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 rounded-full p-0.5 pr-2 bg-surface border border-border hover:bg-surface-hover transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        {/* Avatar */}
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0 select-none">
          {initials}
        </div>
        <span className="hidden md:block text-xs font-medium text-text-secondary max-w-[80px] truncate">
          {displayName}
        </span>
        <ChevronDown
          className={`hidden md:block h-3.5 w-3.5 text-text-muted flex-shrink-0 transition-transform duration-fast ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          role="menu"
          aria-labelledby="user-menu-button"
          aria-orientation="vertical"
          className="absolute right-0 mt-2 w-52 origin-top-right rounded-lg bg-surface shadow-dropdown border border-border focus:outline-none z-[var(--z-dropdown)] overflow-hidden"
        >
          {/* User info header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface-hover/30">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0 select-none">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">{displayName}</p>
              {email && (
                <p className="text-xs text-text-muted truncate">{email}</p>
              )}
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1" role="none">
            <Link
              href="/dashboard/shop-admin/profile"
              onClick={() => setIsOpen(false)}
              role="menuitem"
              className={menuItemClass}
            >
              <UserIcon className="h-4 w-4 text-text-muted group-hover:text-primary flex-shrink-0 transition-colors" />
              Your Profile
            </Link>
            <Link
              href="/dashboard/shop-admin/settings"
              onClick={() => setIsOpen(false)}
              role="menuitem"
              className={menuItemClass}
            >
              <Settings className="h-4 w-4 text-text-muted group-hover:text-primary flex-shrink-0 transition-colors" />
              Settings
            </Link>

            <div className="border-t border-border my-1" />

            <button
              type="button"
              role="menuitem"
              disabled={isLoggingOut}
              onClick={async () => {
                if (isLoggingOut) return;
                setIsOpen(false);
                setIsLoggingOut(true);
                await logoutAsync();
              }}
              className="group flex w-full items-center gap-3 px-4 py-2 text-sm text-danger hover:bg-danger/5 transition-colors duration-fast focus-visible:outline-none focus-visible:bg-danger/5 disabled:opacity-disabled"
            >
              {isLoggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
              ) : (
                <LogOut className="h-4 w-4 flex-shrink-0" />
              )}
              {isLoggingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
