// Default Party service wired to the typed Tauri bridge and the signed-in user's
// permissions (same evaluation as the usePermissions hook, without React).

import { useAuthStore } from '@/lib/auth/core/auth.store';
import { evaluateRolePermission, usePermissionsStore } from '@/lib/auth/usePermissions';
import { getRolePermissionGrants } from '@/features/settings/services/settings.api';
import { createPartyService } from './party.service';
import { tauriPartyRepository } from './party.repository';

export function currentUserCan(permission: string): boolean {
  const user = useAuthStore.getState().user;
  const role = user?.role ?? null;
  if (!role) return false;
  return evaluateRolePermission(
    role,
    permission,
    getRolePermissionGrants(role),
    user?.permissions,
    usePermissionsStore.getState().matrix,
  );
}

export const partyService = createPartyService(tauriPartyRepository, currentUserCan);
