'use client';

import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../services/settings.api';
import { Permission } from '../types/role.types';

const PERMISSIONS_QUERY_KEY = ['settings', 'permissions'] as const;
const MODULES_QUERY_KEY = ['settings', 'permissions', 'modules'] as const;

export function usePermissions() {
  return useQuery<Permission[], Error>({
    queryKey: PERMISSIONS_QUERY_KEY,
    queryFn: settingsApi.getPermissions,
  });
}

export function usePermissionModules() {
  return useQuery<string[], Error>({
    queryKey: MODULES_QUERY_KEY,
    queryFn: settingsApi.getPermissionModules,
  });
}

export interface GroupedPermissions {
  [module: string]: Permission[];
}

export function useGroupedPermissions(): {
  grouped: GroupedPermissions;
  modules: string[];
  isLoading: boolean;
  error: Error | null;
} {
  const { data: permissions = [], isLoading: permLoading, error: permError } = usePermissions();
  const { data: modules = [], isLoading: modLoading } = usePermissionModules();

  const grouped: GroupedPermissions = {};
  for (const perm of permissions) {
    if (!grouped[perm.module]) {
      grouped[perm.module] = [];
    }
    grouped[perm.module].push(perm);
  }

  // Use modules from API if available, otherwise derive from permissions
  const resolvedModules = modules.length > 0 ? modules : Object.keys(grouped);

  return {
    grouped,
    modules: resolvedModules,
    isLoading: permLoading || modLoading,
    error: permError,
  };
}