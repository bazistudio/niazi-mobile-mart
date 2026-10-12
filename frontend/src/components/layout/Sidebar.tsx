'use client';

import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { shopAdminNavigation } from '../../constants/navigation/shop-admin-navigation';
import { organizationNavigation } from '../../constants/navigation/organization-navigation';
import { validateRoute } from '../../lib/navigation/route-validator';
import { usePermissions } from '../../lib/auth/usePermissions';
import { useOrganizationStore } from '../../store/useOrganizationStore';
import { useAuthStore } from '../../lib/auth/core/auth.store';
import { isMainBranch, NON_MAIN_BRANCH_DEFAULT_HREFS } from '../../constants/branchDefaults';
import { Menu, ChevronLeft, LayoutGrid } from 'lucide-react';

/**
 * Roles that may reveal additional pages via the "View All Pages" toggle
 * on a non-Main branch. This includes org-level admins and branch-level admins.
 * The toggle only changes navigation visibility — it does not grant new
 * permissions or bypass existing frontend route guards or backend authorization.
 */
const BRANCH_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'MULTI_ADMIN',
  'OWNER',
  'ADMIN',
  'SHOP_ADMIN',
  'MANAGER',
]);

export const Sidebar = () => {
  // Active route & permission-based sidebar navigation (supports all 17 Organization pages)
  const { pathname } = useLocation();
  const { hasPermission } = usePermissions();
  const [isCollapsed, setIsCollapsed] = useState(false);

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

  // Whether the filter is active (non-Main branch and toggle not expanded)
  const filterActive =
    !pathname.startsWith('/dashboard/organization') && !isMainBranch(activeBranchId);

  return (
    <aside
      className={`flex flex-col flex-shrink-0 z-30 bg-surface border-r border-border h-screen sticky top-0 overflow-y-auto overflow-x-hidden custom-scrollbar transition-[width] duration-normal ease-standard select-none ${
        isCollapsed ? 'w-[60px]' : 'w-64'
      }`}
    >
      {/* Logo / Header */}
      <div
        className={`flex items-center h-12 flex-shrink-0 border-b border-border sticky top-0 bg-surface z-10 transition-all duration-normal ${
          isCollapsed ? 'justify-center px-0' : 'justify-between px-4'
        }`}
      >
        <div
          className={`flex items-center gap-2 overflow-hidden transition-all duration-normal ${
            isCollapsed ? 'opacity-0 w-0 pointer-events-none' : 'opacity-100 w-auto'
          }`}
          aria-hidden={isCollapsed}
        >
          <span className="w-7 h-7 rounded-md bg-primary text-white flex items-center justify-center font-black flex-shrink-0 text-sm shadow-sm">
            N
          </span>
          <span className="text-base font-bold text-primary whitespace-nowrap tracking-tight">
            Niazi Mobile Mart
          </span>
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <Menu className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col pt-2 pb-4 px-2 gap-0.5" aria-label="Main navigation">
        {currentNavigation.map((group, groupIdx) => {
          const permittedItems = (group.items || []).filter((item) => {
            // Existing permission check — always enforced
            if (item.permission && !hasPermission(item.permission as any)) return false;
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
                    title={isCollapsed ? item.name : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={`group relative flex items-center py-2 text-sm font-medium rounded-md transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    } ${isCollapsed ? 'justify-center px-0 w-full' : 'px-2.5 gap-3'}`}
                  >
                    {/* Active accent bar */}
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary"
                        aria-hidden="true"
                      />
                    )}

                    <Icon
                      className={`flex-shrink-0 transition-colors duration-fast ${
                        isCollapsed ? 'h-5 w-5' : 'h-4 w-4'
                      } ${isActive ? 'text-primary' : 'text-text-muted group-hover:text-text-primary'}`}
                      aria-hidden="true"
                    />

                    {!isCollapsed && (
                      <span className="truncate">{item.name}</span>
                    )}

                    {/* Collapsed tooltip */}
                    {isCollapsed && (
                      <div
                        role="tooltip"
                        className="absolute left-full ml-3 px-2.5 py-1.5 bg-surface text-text-primary text-xs font-semibold rounded-md shadow-dropdown border border-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-fast z-[var(--z-tooltip)] whitespace-nowrap pointer-events-none"
                      >
                        {item.name}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}

        {/* View All Pages toggle — shown only to branch admins on non-Main branches
            in the shop-admin navigation context. Visibility-only: no permissions
            are granted and no branch defaults are modified. */}
        {filterActive && canViewAllPages && !isCollapsed && (
          <div className="mt-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => setShowAllPages((prev) => !prev)}
              className="w-full flex items-center gap-3 px-2.5 py-2 text-sm font-medium rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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

        {/* Collapsed tooltip for View All Pages toggle */}
        {filterActive && canViewAllPages && isCollapsed && (
          <div className="mt-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => setShowAllPages((prev) => !prev)}
              className="group relative flex items-center justify-center py-2 w-full rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              aria-expanded={showAllPages}
              aria-label={showAllPages ? 'Show default pages only' : 'View all pages'}
            >
              <LayoutGrid className="h-5 w-5" aria-hidden="true" />
              <div
                role="tooltip"
                className="absolute left-full ml-3 px-2.5 py-1.5 bg-surface text-text-primary text-xs font-semibold rounded-md shadow-dropdown border border-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-fast z-[var(--z-tooltip)] whitespace-nowrap pointer-events-none"
              >
                {showAllPages ? 'Default Pages Only' : 'View All Pages'}
              </div>
            </button>
          </div>
        )}
      </nav>
    </aside>
  );
};

export default Sidebar;
