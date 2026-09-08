import { useMemo } from 'react';
import { create } from 'zustand';
import { useAuthStore } from './core/auth.store';
import {
  PERMISSIONS,
  PermissionKey,
  PermissionDecision,
  ROLE_PERMISSION_DECISIONS,
  DEFAULT_ROLE_PERMISSIONS,
} from '@/constants/permissions';
import {
  getRolePermissionGrants,
  onRolePermissionsChange,
  ROLE_PERMISSION_GRANTS_STORAGE_KEY,
} from '@/features/settings/services/settings.api';

export { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, ROLE_PERMISSION_DECISIONS };

/**
 * Pure evaluation function enforcing canonical 6-step RBAC evaluation order:
 * 1. Admin bypass -> ALLOW
 * 2. ADMIN_ONLY -> DENY
 * 3. REJECT -> DENY
 * 4. INDIVIDUAL -> ALLOW if role grant OR user grant exists; else DENY
 * 5. SELECT -> ALLOW by default
 * 6. DENY
 */
export function evaluateRolePermission(
  role: string | null | undefined,
  permission: string,
  roleGrants: Record<string, boolean> = {},
  userGrants?: string[] | Record<string, boolean> | null,
  matrix?: Record<string, boolean> | null
): boolean {
  const currentRole = (role || '').toUpperCase().trim();

  // 1. Admin / Owner / Super Admin / Multi Admin -> full access bypass
  if (
    currentRole === 'SUPER_ADMIN' ||
    currentRole === 'MULTI_ADMIN' ||
    currentRole === 'OWNER' ||
    currentRole === 'ADMIN'
  ) {
    return true;
  }

  // Look up canonical four-state decision for the role
  const roleDecisions = ROLE_PERMISSION_DECISIONS[currentRole];
  const decision: PermissionDecision | undefined = roleDecisions
    ? roleDecisions[permission as PermissionKey]
    : undefined;

  // 2. ADMIN_ONLY -> deny for non-admin roles unconditionally
  if (decision === 'ADMIN_ONLY' || permission.startsWith('org.') || permission.startsWith('shops.')) {
    return false;
  }

  // 3. REJECT -> deny unconditionally regardless of any attempted grant
  if (decision === 'REJECT') {
    return false;
  }

  // 4. INDIVIDUAL -> allow ONLY when an explicit role grant, user grant, or matrix grant exists
  if (decision === 'INDIVIDUAL') {
    // Check role-level grant
    const hasRoleGrant = roleGrants[permission] === true;

    // Check user-level grant (from access profile)
    const hasUserGrant = Array.isArray(userGrants)
      ? userGrants.includes(permission)
      : userGrants && typeof userGrants === 'object'
      ? (userGrants as Record<string, boolean>)[permission] === true
      : false;

    // Check explicit loaded permissions matrix
    const hasMatrixGrant = !!(matrix && matrix[permission] === true);

    return hasRoleGrant || hasUserGrant || hasMatrixGrant;
  }

  // 5. SELECT -> allow when included in role defaults
  if (decision === 'SELECT') {
    // If the matrix has explicitly disabled this default permission, honor it
    if (matrix && matrix[permission] === false) {
      return false;
    }
    return true;
  }

  // 6. Otherwise -> deny
  const rolePerms = DEFAULT_ROLE_PERMISSIONS[currentRole] || [];
  return rolePerms.includes(permission);
}

interface PermissionsState {
  matrix: Record<string, boolean>;
  version: number;
  setMatrix: (matrix: Record<string, boolean>) => void;
  invalidate: () => void;
}

export const usePermissionsStore = create<PermissionsState>((set) => ({
  matrix: {},
  version: 0,
  setMatrix: (matrix) => set({ matrix }),
  invalidate: () => set((state) => ({ version: state.version + 1 })),
}));

// Subscribe to role permissions changes to keep store reactive
if (typeof window !== 'undefined') {
  onRolePermissionsChange(() => {
    usePermissionsStore.getState().invalidate();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === ROLE_PERMISSION_GRANTS_STORAGE_KEY) {
      usePermissionsStore.getState().invalidate();
    }
  });
}

export const usePermissions = () => {
  // Subscribe to store version for immediate reactive re-evaluation
  const version = usePermissionsStore((state) => state.version);
  const matrix = usePermissionsStore((state) => state.matrix);
  const user = useAuthStore((state) => state.user);

  const role = user?.role || null;

  const roleGrants = useMemo(() => {
    if (!role) return {};
    return getRolePermissionGrants(role);
  }, [role, version]);

  const hasPermission = (permission: string): boolean => {
    return evaluateRolePermission(role, permission, roleGrants, user?.permissions, matrix);
  };

  return { hasPermission, role };
};
