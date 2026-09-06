'use client';

import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { shopAdminNavigation } from '../../constants/navigation/shop-admin-navigation';
import { organizationNavigation } from '../../constants/navigation/organization-navigation';
import { validateRoute } from '../../lib/navigation/route-validator';
import { usePermissions } from '../../lib/auth/usePermissions';
import { Menu, ChevronLeft } from 'lucide-react';

export const Sidebar = () => {
  const { pathname } = useLocation();
  const { hasPermission } = usePermissions();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const currentNavigation =
    pathname.startsWith('/dashboard/organization')
      ? organizationNavigation
      : shopAdminNavigation;

  return (
    <div
      className={`hidden lg:flex lg:flex-col flex-shrink-0 z-[var(--z-fixed)] bg-surface border-r border-border h-full min-h-screen overflow-y-auto overflow-x-hidden custom-scrollbar transition-[width] duration-normal ease-standard ${
        isCollapsed ? 'lg:w-[60px]' : 'lg:w-64'
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
            if (item.permission && !hasPermission(item.permission as any)) return false;
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
      </nav>
    </div>
  );
};

export default Sidebar;
