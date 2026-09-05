'use client';

import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { shopAdminNavigation } from '../../constants/navigation/shop-admin-navigation';
import { organizationNavigation } from '../../constants/navigation/organization-navigation';
import { usePermissions } from '../../lib/auth/usePermissions';
import { validateRoute } from '../../lib/navigation/route-validator';

interface MobileSidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const MobileSidebar = ({ isOpen, setIsOpen }: MobileSidebarProps) => {
  const { pathname } = useLocation();
  const { hasPermission } = usePermissions();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const currentNavigation =
    pathname.startsWith('/dashboard/organization')
      ? organizationNavigation
      : shopAdminNavigation;

  // Focus close button when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => closeButtonRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard: close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen]);

  // Prevent body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <div
      className={`relative z-[var(--z-modal)] lg:hidden`}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
    >
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-overlay backdrop-blur-sm transition-opacity duration-normal ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer panel */}
      <div
        className={`fixed inset-0 flex transition-transform duration-normal ease-standard ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="relative mr-16 flex w-full max-w-xs flex-1">
          {/* Close button (outside panel, top-right) */}
          <div className="absolute left-full top-0 flex w-16 justify-center pt-4">
            <button
              ref={closeButtonRef}
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 backdrop-blur-sm border border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              onClick={() => setIsOpen(false)}
            >
              <span className="sr-only">Close sidebar</span>
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Sidebar content */}
          <div className="flex grow flex-col overflow-y-auto bg-surface shadow-modal custom-scrollbar">
            {/* Logo */}
            <div className="flex h-12 shrink-0 items-center gap-2.5 px-5 border-b border-border sticky top-0 bg-surface z-10">
              <span className="w-7 h-7 rounded-md bg-primary text-white flex items-center justify-center font-black text-sm shadow-sm flex-shrink-0">
                T
              </span>
              <span className="text-base font-bold text-primary tracking-tight">
                TijaratPro
              </span>
            </div>

            {/* Navigation links */}
            <nav
              className="mt-2 flex flex-1 flex-col px-3 pb-6 gap-0.5"
              aria-label="Mobile navigation"
            >
              {currentNavigation.map((group, groupIdx) => {
                const permittedItems = (group.items || []).filter((item) => {
                  if (item.permission && !hasPermission(item.permission as any))
                    return false;
                  return true;
                });

                if (permittedItems.length === 0) return null;

                return (
                  <div key={`group-${groupIdx}`} className="flex flex-col gap-0.5">
                    {permittedItems.map((item) => {
                      validateRoute(item.href, item.name);
                      const isActive =
                        item.href === '/dashboard/shop-admin' ||
                        item.href === '/dashboard/organization'
                          ? pathname === item.href
                          : pathname.startsWith(item.href);
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.name}
                          to={item.href}
                          onClick={() => setIsOpen(false)}
                          aria-current={isActive ? 'page' : undefined}
                          className={`group relative flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                          }`}
                        >
                          {/* Active bar */}
                          {isActive && (
                            <span
                              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary"
                              aria-hidden="true"
                            />
                          )}
                          <Icon
                            className={`flex-shrink-0 h-4 w-4 transition-colors duration-fast ${
                              isActive
                                ? 'text-primary'
                                : 'text-text-muted group-hover:text-text-primary'
                            }`}
                            aria-hidden="true"
                          />
                          <span className="truncate">{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileSidebar;
