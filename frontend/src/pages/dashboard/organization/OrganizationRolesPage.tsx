import React from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { ShieldCheck, KeyRound, UserCheck, Network, Grid3X3, Clock } from 'lucide-react';

export function OrganizationRolesPage() {
  const sections = [
    {
      icon: ShieldCheck,
      title: 'Organization Roles',
      description: 'Define multi-branch role definitions, supervisory privileges, and hierarchy tiers.',
      status: 'Coming soon',
    },
    {
      icon: KeyRound,
      title: 'Permissions',
      description: 'Configure granular permission sets across POS, inventory, finance, and settings.',
      status: 'Coming soon',
    },
    {
      icon: UserCheck,
      title: 'Role Assignments',
      description: 'Delegate cross-branch roles to organization managers and branch supervisors.',
      status: 'Coming soon',
    },
    {
      icon: Network,
      title: 'Branch Access',
      description: 'Define shop-level boundary constraints and branch access scopes for staff members.',
      status: 'Coming soon',
    },
    {
      icon: Grid3X3,
      title: 'Permission Matrix',
      description: 'Comprehensive role-vs-permission matrix for centralized compliance auditing.',
      status: 'Coming soon',
    },
  ];

  return (
    <OrganizationPageShell
      title="Roles & Permissions"
      description="Manage organization roles and permissions across all branches."
      badge="Coming soon"
    >
      {/* Sections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {sections.map((sec) => {
          const Icon = sec.icon;
          return (
            <div
              key={sec.title}
              className="bg-white dark:bg-gray-800/90 rounded-xl p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    {sec.status}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {sec.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                  {sec.description}
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-gray-100 dark:border-gray-700/60 flex items-center gap-2 text-xs text-gray-400">
                <Clock className="w-3.5 h-3.5" />
                <span>Planned for upcoming security phase</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Empty State Banner */}
      <div className="bg-white dark:bg-gray-800/90 rounded-xl p-8 border border-gray-200/80 dark:border-gray-700/80 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 mx-auto flex items-center justify-center text-primary mb-3">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Organization Role Controls
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto mt-1 leading-relaxed">
          Organization-level role templates and cross-branch permission matrices will appear here once the role management service is connected.
        </p>
      </div>
    </OrganizationPageShell>
  );
}

export default OrganizationRolesPage;
