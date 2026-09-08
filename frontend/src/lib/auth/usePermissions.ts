import { create } from 'zustand';
import { useAuthStore } from './core/auth.store';
import {
  PERMISSIONS,
  PermissionKey,
  PermissionDecision,
  ROLE_PERMISSION_DECISIONS,
  DEFAULT_ROLE_PERMISSIONS,
} from '@/constants/permissions';

export { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, ROLE_PERMISSION_DECISIONS };

interface PermissionsState {
  matrix: Record<string, boolean>;
  setMatrix: (matrix: Record<string, boolean>) => void;
}

export const usePermissionsStore = create<PermissionsState>((set) => ({
  matrix: {},
  setMatrix: (matrix) => set({ matrix }),
}));

export const usePermissions = () => {
  const matrix = usePermissionsStore((state) => state.matrix);
  const user = useAuthStore((state) => state.user);

  const role = user?.role || null;

  const hasPermission = (permission: string): boolean => {
    const currentRole = (role || '').toUpperCase().trim();

    // 1. Admin / Owner / Super Admin / Multi Admin -> full access
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

    // 3. REJECT -> deny regardless of individual or default grants
    if (decision === 'REJECT') {
      return false;
    }

    // 4. INDIVIDUAL -> allow ONLY when an explicit individual grant exists
    if (decision === 'INDIVIDUAL') {
      // Check user access profile permissions
      const userGrants = user?.permissions;
      if (Array.isArray(userGrants) && userGrants.includes(permission)) {
        return true;
      }
      // Check explicit loaded permissions matrix
      if (matrix && matrix[permission] === true) {
        return true;
      }
      return false;
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
  };

  return { hasPermission, role };
};
