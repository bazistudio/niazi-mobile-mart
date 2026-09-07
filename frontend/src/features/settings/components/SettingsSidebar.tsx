import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Settings, Users, Printer, Building2 } from 'lucide-react';

const navItems = [
  { name: 'General', href: '/dashboard/shop-admin/settings', icon: Settings },
  { name: 'Workforce', href: '/dashboard/shop-admin/settings/users', icon: Users },
  { name: 'Printer', href: '/dashboard/shop-admin/settings/printer', icon: Printer },
];

export const SettingsSidebar: React.FC = () => {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <div className="w-56 flex-shrink-0">
      <nav className="flex flex-col gap-0.5" aria-label="Settings navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === '/dashboard/shop-admin/settings'
              ? pathname === item.href
              : pathname?.startsWith(item.href);

          return (
            <Link
              key={item.name}
              to={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary"
                  aria-hidden="true"
                />
              )}
              <Icon
                className={`w-4 h-4 flex-shrink-0 transition-colors duration-fast ${
                  isActive ? 'text-primary' : 'text-text-muted group-hover:text-text-primary'
                }`}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Organization Admin Settings Link */}
      <div className="mt-6 pt-4 border-t border-border">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Enterprise Scope
        </div>
        <Link
          to="/dashboard/organization/settings"
          className="group flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-text-secondary hover:text-primary hover:bg-primary/5 transition-colors"
        >
          <Building2 className="w-4 h-4 text-text-muted group-hover:text-primary shrink-0" />
          <span>Organization Settings</span>
        </Link>
      </div>
    </div>
  );
};
