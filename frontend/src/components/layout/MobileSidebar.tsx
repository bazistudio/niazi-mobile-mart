'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X, LayoutGrid } from 'lucide-react';
import { shopAdminNavigation } from '../../constants/navigation/shop-admin-navigation';
import { organizationNavigation } from '../../constants/navigation/organization-navigation';
import { usePermissions } from '../../lib/auth/usePermissions';
import { validateRoute } from '../../lib/navigation/route-validator';
import { useOrganizationStore } from '../../store/useOrganizationStore';
import { useAuthStore } from '../../lib/auth/core/auth.store';
import { isMainBranch, NON_MAIN_BRANCH_DEFAULT_HREFS } from '../../constants/branchDefaults';

interface MobileSidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

/**
 * Roles that may reveal additional pages via the "View All Pages" toggle
 * on a non-Main branch. Matches the same set used in Sidebar.tsx.
 */
const BRANCH_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'MULTI_ADMIN',
  'OWNER',
  'ADMIN',
  'SHOP_ADMIN',
  'MANAGER',
]);

export const MobileSidebar = ({ isOpen, setIsOpen }: MobileSidebarProps) => {
  // Mobile drawer navigation (supports all 17 Organization pages)
  const { pathname } = useLocation();
  const { hasPermission } = usePermissions();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Branch-aware navigation filtering state
  const activeShop = useOrganizationStore((s) => s.activeShop);
  const user = useAuthStore((s) => s.user);
  const [showAllPages, setShowAllPages] = useState(false);

  // Reset "View All Pages" state whenever the active branch changes,
  // so stale expanded-navigation state cannot persist across a branch switch.
  const activeBranchId = activeShop?._id ?? null;
  useEffect(() => {
    setShowAllPages(false);
  }, [activeBranchId]);

  const currentNavigation =
    pathname.startsWith('/dashboard/organization')
      ? organizationNavigation
      : shopAdminNavigation;

  // Determine whether branch-default filtering should apply:
  // - Only for shop-admin navigation (not organization dashboard)
  // - Only when the active branch is not the Main Branch
  const applyDefaultFilter =
    !pathname.startsWith('/dashboard/organization') &&
    !isMainBranch(activeBranchId) &&
    !showAllPages;

  // Whether the current user may reveal extra pages via the toggle
  const userRole = (user?.role || '').toUpperCase();
  const canViewAllPages = BRANCH_ADMIN_ROLES.has(userRole);

  // Whether the filter is active (non-Main branch, shop-admin context)
  const filterActive =
    !pathname.startsWith('/dashboard/organization') && !isMainBranch(activeBranchId);

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
                N
              </span>
              <span className="text-base font-bold text-primary tracking-tight">
                Niazi Mobile Mart
              </span>
            </div>

            {/* Navigation links */}
            <nav
              className="mt-2 flex flex-1 flex-col px-3 pb-6 gap-0.5"
              aria-label="Mobile navigation"
            >
              {currentNavigation.map((group, groupIdx) => {
                const permittedItems = (group.items || []).filter((item) => {
                  // Existing permission check — always enforced
                  if (item.permission && !hasPermission(item.permission as any)) return false;
                  // Mobile Inventory is a branch/org management capability — restrict to branch admin/management roles
                  if (item.href === '/dashboard/shop-admin/mobiles' && !BRANCH_ADMIN_ROLES.has(userRole)) return false;
                  // Branch default filter: hide items not in the default set for non-Main branches
                  if (applyDefaultFilter && !NON_MAIN_BRANCH_DEFAULT_HREFS.has(item.href)) return false;
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

              {/* View All Pages toggle — shown only to branch admins on non-Main branches
                  in the shop-admin navigation context. Visibility-only: no permissions
                  are granted and no branch defaults are modified. */}
              {filterActive && canViewAllPages && (
                <div className="mt-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowAllPages((prev) => !prev)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    aria-expanded={showAllPages}
                    aria-label={showAllPages ? 'Show default pages only' : 'View all pages'}
                  >
                    <LayoutGrid className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {showAllPages ? 'Default Pages Only' : 'View All Pages'}
                    </span>
                  </button>
                </div>
              )}
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileSidebar;
