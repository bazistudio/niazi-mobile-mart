import React from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { RoleList } from '@/features/settings/components/RoleList';
import { useRoles } from '@/features/settings/hooks/useRoles';
import { ShieldCheck } from 'lucide-react';

export function OrganizationRolesPage() {
  const { data: roles = [], isLoading } = useRoles();

  return (
    <OrganizationPageShell
      title="Roles & Permissions"
      description="Manage organization roles and permissions across all branches."
      badge="Role Management"
    >
      {/* Role list with full create / edit / duplicate / delete capability */}
      <RoleList roles={roles} isLoading={isLoading} />

      {/* Informational note about branch-level permission overrides */}
      {!isLoading && roles.length > 0 && (
        <div className="bg-white dark:bg-gray-800/90 rounded-xl p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex items-start gap-3 mt-2">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5">
              Branch-level permission overrides
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Individual permission overrides for branch staff are managed per-branch under{' '}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Shop Admin → Settings → Roles
              </span>
              . Role definitions created here apply organization-wide as the baseline.
            </p>
          </div>
        </div>
      )}
    </OrganizationPageShell>
  );
}

export default OrganizationRolesPage;
