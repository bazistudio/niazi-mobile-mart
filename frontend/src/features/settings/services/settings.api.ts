import { isTauriEnvironment, tauriClient, StaffRole } from '@/lib/tauri/tauriClient';
import { httpClient } from '@/lib/http/httpClient'; // DEF-08: backend roles API
import { CreateRoleDto, UpdateRoleDto, Role, RoleWithPermissions, Permission } from '../types/role.types';
import { CreateStaffDto, UpdateStaffDto, StaffUser } from '../types/staff.types';
import {
  PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_PERMISSION_DECISIONS,
  PERMISSION_METADATA,
  PermissionKey,
} from '@/constants/permissions';

export function mapRoleIdToStaffRole(roleId: string): StaffRole {
  const r = (roleId || '').toLowerCase().trim();
  if (r === 'admin' || r === 'owner' || r === 'super_admin' || r === 'multi_admin') return 'ADMIN';
  if (r === 'shop_admin' || r === 'branch_admin') return 'SHOP_ADMIN';
  if (r === 'manager') return 'MANAGER';
  if (r === 'accountant') return 'ACCOUNTANT';
  if (r === 'salesman') return 'SALESMAN';
  if (r === 'cashier') return 'CASHIER';
  if (r === 'repair_mechanic' || r === 'mechanic') return 'REPAIR_MECHANIC';
  return 'STAFF';
}

export function mapStaffRoleToDisplay(role: string): { roleId: string; roleName: string } {
  const r = (role || '').toUpperCase().trim();
  switch (r) {
    case 'ADMIN':
    case 'OWNER':
    case 'SUPER_ADMIN':
    case 'MULTI_ADMIN':
      return { roleId: 'admin', roleName: 'Organization Admin' };
    case 'SHOP_ADMIN':
    case 'BRANCH_ADMIN':
      return { roleId: 'shop_admin', roleName: 'Branch Admin' };
    case 'MANAGER':
      return { roleId: 'manager', roleName: 'Manager' };
    case 'ACCOUNTANT':
      return { roleId: 'accountant', roleName: 'Accountant' };
    case 'SALESMAN':
      return { roleId: 'salesman', roleName: 'Salesman' };
    case 'CASHIER':
      return { roleId: 'cashier', roleName: 'Cashier' };
    case 'REPAIR_MECHANIC':
    case 'MECHANIC':
      return { roleId: 'repair_mechanic', roleName: 'Repair Mechanic' };
    default:
      return { roleId: 'staff', roleName: 'Staff' };
  }
}

// ─── Browser Fallback Storage ────────────────────────────────────────────────
export const ROLE_PERMISSION_GRANTS_STORAGE_KEY = 'nmm_role_permission_grants_v1';
const BROWSER_STAFF_STORAGE_KEY = 'nmm_browser_staff_users';
const BROWSER_ROLES_STORAGE_KEY = 'nmm_browser_custom_roles';

type RolePermissionChangeListener = () => void;
const rolePermissionListeners = new Set<RolePermissionChangeListener>();

export function onRolePermissionsChange(listener: RolePermissionChangeListener): () => void {
  rolePermissionListeners.add(listener);
  return () => {
    rolePermissionListeners.delete(listener);
  };
}

function notifyRolePermissionsChange() {
  rolePermissionListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('[RolePermissions] Listener error', e);
    }
  });
}

export function normalizeRoleKey(roleId: string): string {
  return (roleId || '').toLowerCase().trim();
}

export function getAllRolePermissionGrants(): Record<string, Record<string, boolean>> {
  try {
    if (typeof window === 'undefined') return {};
    const raw = localStorage.getItem(ROLE_PERMISSION_GRANTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch (err) {
    console.warn('[getAllRolePermissionGrants] Corrupted storage, returning empty', err);
    return {};
  }
}

export function getRolePermissionGrants(roleId: string): Record<string, boolean> {
  const all = getAllRolePermissionGrants();
  const key = normalizeRoleKey(roleId);
  const grants = all[key];
  if (typeof grants !== 'object' || grants === null || Array.isArray(grants)) {
    return {};
  }
  const sanitized: Record<string, boolean> = {};
  for (const [permKey, val] of Object.entries(grants)) {
    if (val === true) {
      sanitized[permKey] = true;
    }
  }
  return sanitized;
}

export function saveRolePermissionGrants(
  roleId: string,
  grants: Record<string, boolean>
): void {
  const staffRole = mapRoleIdToStaffRole(roleId);
  const roleDecisions = ROLE_PERMISSION_DECISIONS[staffRole];
  const allCanonical = new Set<string>(Object.values(PERMISSIONS));

  const validGrantsToSave: Record<string, boolean> = {};

  for (const [permKey, isEnabled] of Object.entries(grants)) {
    // Only process explicit truthy grants; false or absent means revoked
    if (!isEnabled) continue;

    // 1. Verify existence in canonical registry
    if (!allCanonical.has(permKey)) {
      throw new Error(`Permission "${permKey}" does not exist in canonical registry.`);
    }

    // 2. Determine policy state for role
    const decision = roleDecisions ? roleDecisions[permKey as PermissionKey] : undefined;

    // 3. Reject non-INDIVIDUAL persistence
    if (decision === 'ADMIN_ONLY') {
      throw new Error(`Permission "${permKey}" is reserved for administrators.`);
    }
    if (decision === 'REJECT') {
      throw new Error(
        `Permission "${permKey}" cannot be granted to ${roleId} because its policy is REJECT.`
      );
    }
    if (decision === 'SELECT') {
      throw new Error(
        `Permission "${permKey}" is a default SELECT permission and cannot be saved as an individual grant.`
      );
    }
    if (decision !== 'INDIVIDUAL') {
      throw new Error(
        `Permission "${permKey}" does not have an INDIVIDUAL policy for ${roleId}.`
      );
    }

    validGrantsToSave[permKey] = true;
  }

  // Persist to storage
  const all = getAllRolePermissionGrants();
  const key = normalizeRoleKey(roleId);

  if (Object.keys(validGrantsToSave).length === 0) {
    delete all[key];
  } else {
    all[key] = validGrantsToSave;
  }

  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(ROLE_PERMISSION_GRANTS_STORAGE_KEY, JSON.stringify(all));
    }
  } catch (err) {
    console.error('[saveRolePermissionGrants] Failed to write to localStorage', err);
    throw err;
  }

  notifyRolePermissionsChange();
}

const DEFAULT_STAFF_USERS: StaffUser[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    _id: '00000000-0000-0000-0000-000000000001',
    name: 'IMRAN KHAN NIAZI',
    username: 'imran khan',
    email: 'imran khan@local',
    roleId: 'admin',
    roleName: 'Organization Admin',
    hasPin: true,
    status: 'active',
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    _id: '00000000-0000-0000-0000-000000000002',
    name: 'ZAIN ULLAH',
    username: 'zk',
    email: 'zk@local',
    roleId: 'manager',
    roleName: 'Manager',
    hasPin: true,
    status: 'active',
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    _id: '00000000-0000-0000-0000-000000000003',
    name: 'RAJA ABDUL REHMAN',
    username: 'raja',
    email: 'raja@local',
    roleId: 'cashier',
    roleName: 'Cashier',
    hasPin: true,
    status: 'active',
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    _id: '00000000-0000-0000-0000-000000000004',
    name: 'MOHAMMAD BAKHSH CHISHTI',
    username: 'bashi',
    email: 'bashi@local',
    roleId: 'salesman',
    roleName: 'Salesman',
    hasPin: true,
    status: 'active',
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    _id: '00000000-0000-0000-0000-000000000005',
    name: 'NAVEED GUL',
    username: 'gul',
    email: 'gul@local',
    roleId: 'accountant',
    roleName: 'Accountant',
    hasPin: true,
    status: 'active',
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000006',
    _id: '00000000-0000-0000-0000-000000000006',
    name: 'FAIZAN KHAN',
    username: 'faizan',
    email: 'faizan@local',
    roleId: 'repair_mechanic',
    roleName: 'Repair Mechanic',
    hasPin: true,
    status: 'active',
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export function getBrowserStaff(): StaffUser[] {
  let list: StaffUser[] = [];
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(BROWSER_STAFF_STORAGE_KEY) : null;
    if (raw) {
      list = JSON.parse(raw);
    }
  } catch {}

  if (!Array.isArray(list)) list = [];

  // Remove generic placeholders if present
  const fakeNames = new Set(['System Administrator', 'Shop Branch Manager', 'Sales Associate', 'Finance Accountant', 'Repair Specialist']);
  list = list.filter((u) => !fakeNames.has(u.name) && u.username !== 'admin' && u.username !== 'manager' && u.username !== 'cashier' && u.username !== 'salesman' && u.username !== 'accountant' && u.username !== 'mechanic');

  for (const defaultUser of DEFAULT_STAFF_USERS) {
    const exists = list.some(
      (u) => u.id === defaultUser.id || u._id === defaultUser._id || u.username === defaultUser.username || u.name === defaultUser.name
    );
    if (!exists) {
      list.push(defaultUser);
    }
  }

  saveBrowserStaff(list);
  return list;
}

function saveBrowserStaff(users: StaffUser[]) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(BROWSER_STAFF_STORAGE_KEY, JSON.stringify(users));
    }
  } catch {}
}

function getBrowserCustomRoles(): RoleWithPermissions[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(BROWSER_ROLES_STORAGE_KEY) : null;
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveBrowserCustomRoles(roles: RoleWithPermissions[]) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(BROWSER_ROLES_STORAGE_KEY, JSON.stringify(roles));
    }
  } catch {}
}

function buildRolePermissionsMap(roleKey: string): Record<string, boolean> {
  const decisions = ROLE_PERMISSION_DECISIONS[roleKey] || {};
  const map: Record<string, boolean> = {};
  for (const [permKey, decision] of Object.entries(decisions)) {
    map[permKey] = decision === 'SELECT';
  }
  return map;
}

const CANONICAL_ROLES: RoleWithPermissions[] = [
  {
    _id: 'admin',
    organizationId: '00000000-0000-0000-0000-000000000001',
    name: 'Organization Admin',
    description: 'Full unrestricted organization & multi-branch access',
    isSystem: true,
    userCount: 1,
    permissionCount: Object.values(PERMISSIONS).length,
    permissions: buildRolePermissionsMap('ADMIN'),
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'shop_admin',
    organizationId: '00000000-0000-0000-0000-000000000001',
    name: 'Branch Admin',
    description: 'Full assigned-branch management and administration',
    isSystem: true,
    userCount: 0,
    permissionCount: DEFAULT_ROLE_PERMISSIONS.SHOP_ADMIN?.length || 0,
    permissions: buildRolePermissionsMap('SHOP_ADMIN'),
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'manager',
    organizationId: '00000000-0000-0000-0000-000000000001',
    name: 'Manager',
    description: 'Day-to-day branch operations, stock, and sales management',
    isSystem: true,
    userCount: 0,
    permissionCount: DEFAULT_ROLE_PERMISSIONS.MANAGER?.length || 0,
    permissions: buildRolePermissionsMap('MANAGER'),
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'accountant',
    organizationId: '00000000-0000-0000-0000-000000000001',
    name: 'Accountant',
    description: 'Financial control, ledgers, expenses, purchase bills and financial reporting',
    isSystem: true,
    userCount: 0,
    permissionCount: DEFAULT_ROLE_PERMISSIONS.ACCOUNTANT?.length || 0,
    permissions: buildRolePermissionsMap('ACCOUNTANT'),
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'salesman',
    organizationId: '00000000-0000-0000-0000-000000000001',
    name: 'Salesman',
    description: 'Point of sale, customer billing, and register operations',
    isSystem: true,
    userCount: 0,
    permissionCount: DEFAULT_ROLE_PERMISSIONS.SALESMAN?.length || 0,
    permissions: buildRolePermissionsMap('SALESMAN'),
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'cashier',
    organizationId: '00000000-0000-0000-0000-000000000001',
    name: 'Cashier',
    description: 'Cash checkout, invoice issuing, and customer transactions',
    isSystem: true,
    userCount: 0,
    permissionCount: DEFAULT_ROLE_PERMISSIONS.CASHIER?.length || 0,
    permissions: buildRolePermissionsMap('CASHIER'),
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'repair_mechanic',
    organizationId: '00000000-0000-0000-0000-000000000001',
    name: 'Repair Mechanic',
    description: 'Device repair tracking, service ticketing, and parts scope',
    isSystem: true,
    userCount: 0,
    permissionCount: DEFAULT_ROLE_PERMISSIONS.REPAIR_MECHANIC?.length || 0,
    permissions: buildRolePermissionsMap('REPAIR_MECHANIC'),
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'staff',
    organizationId: '00000000-0000-0000-0000-000000000001',
    name: 'Staff',
    description: 'General store staff with basic catalog and terminal access',
    isSystem: true,
    userCount: 0,
    permissionCount: DEFAULT_ROLE_PERMISSIONS.STAFF?.length || 0,
    permissions: buildRolePermissionsMap('STAFF'),
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];


export const settingsApi = {
  // ─── Staff ──────────────────────────────────────────────────────────────────
  getStaff: async (): Promise<StaffUser[]> => {
    const users = await tauriClient.adminListUsers();
    return users.map((u) => {
      const display = mapStaffRoleToDisplay(u.role);
      return {
        id: u.id,
        _id: u.id,
        name: u.name,
        username: u.username,
        email: `${u.username}@local`,
        roleId: display.roleId,
        roleName: display.roleName,
        hasPin: u.has_pin,
        status: (u.status ? u.status.toLowerCase() : (u.is_active ? 'active' : 'inactive')) as any,
        mustChangePassword: u.must_change_password,
        branchId: u.branch_id ?? undefined,
        createdAt: u.created_at,
      };
    });
  },

  approveStaff: async (id: string): Promise<StaffUser> => {
    const u = await tauriClient.adminApproveStaff(id);
    const display = mapStaffRoleToDisplay(u.role);
    return {
      id: u.id,
      _id: u.id,
      name: u.name,
      username: u.username,
      email: `${u.username}@local`,
      roleId: display.roleId,
      roleName: display.roleName,
      hasPin: u.has_pin,
      status: 'active',
      mustChangePassword: u.must_change_password,
      branchId: u.branch_id ?? undefined,
      createdAt: u.created_at,
    };
  },

  rejectStaff: async (id: string): Promise<StaffUser> => {
    const u = await tauriClient.adminRejectStaff(id);
    const display = mapStaffRoleToDisplay(u.role);
    return {
      id: u.id,
      _id: u.id,
      name: u.name,
      username: u.username,
      email: `${u.username}@local`,
      roleId: display.roleId,
      roleName: display.roleName,
      hasPin: u.has_pin,
      status: 'rejected',
      mustChangePassword: u.must_change_password,
      branchId: u.branch_id ?? undefined,
      createdAt: u.created_at,
    };
  },

  resetStaffPassword: async (id: string, temporaryPassword: string): Promise<void> => {
    await tauriClient.adminResetStaffPassword(id, temporaryPassword);
  },

  createStaff: async (data: CreateStaffDto): Promise<StaffUser> => {
    const rawUsername =
      data.username || (data.email ? data.email.split('@')[0] : data.name.toLowerCase().replace(/\s+/g, ''));
    const username = rawUsername.trim().toLowerCase();
    const roleId = data.roleId || 'staff';
    const targetStaffRole = mapRoleIdToStaffRole(roleId);
    const effectivePin = data.pin && data.pin.trim().length === 4 ? data.pin.trim() : undefined;
    const effectivePassword = effectivePin ? `Niazi@${effectivePin}` : 'Niazi@123';

    const res = await tauriClient.adminCreateUser({
      name: data.name.trim(),
      username,
      password: effectivePassword,
      login_key: effectivePassword,
      pin: effectivePin,
      role: targetStaffRole,
      branch_id: data.branchId ? data.branchId.trim() : null,
    });
    const resDisplay = mapStaffRoleToDisplay(res.role);
    return {
      id: res.id,
      _id: res.id,
      name: res.name,
      username: res.username,
      email: data.email || `${res.username}@local`,
      phone: data.phone,
      roleId: resDisplay.roleId,
      roleName: resDisplay.roleName,
      hasPin: res.has_pin,
      status: (res.status ? res.status.toLowerCase() : (res.is_active ? 'active' : 'inactive')) as any,
      mustChangePassword: res.must_change_password,
      branchId: res.branch_id ?? undefined,
      createdAt: res.created_at,
    };
  },

  updateStaff: async (id: string, data: UpdateStaffDto): Promise<StaffUser> => {
    const targetRole = data.roleId ? mapRoleIdToStaffRole(data.roleId) : undefined;
    const cleanBranchId = data.branchId !== undefined
      ? (data.branchId && data.branchId.trim() ? data.branchId.trim() : null)
      : undefined;

    const u = await tauriClient.adminUpdateUser({
      user_id: id,
      name: data.name,
      role: targetRole,
      status: data.status ? (data.status.toUpperCase() as any) : undefined,
      branch_id: cleanBranchId,
    });
    const display = mapStaffRoleToDisplay(u.role);
    return {
      id: u.id,
      _id: u.id,
      name: u.name,
      username: u.username,
      email: data.email || `${u.username}@local`,
      phone: data.phone,
      roleId: display.roleId,
      roleName: display.roleName,
      hasPin: u.has_pin,
      status: (u.status ? u.status.toLowerCase() : (u.is_active ? 'active' : 'inactive')) as any,
      mustChangePassword: u.must_change_password,
      branchId: u.branch_id ?? undefined,
      createdAt: u.created_at,
    };
  },

  updateStaffStatus: async (id: string, status: 'active' | 'suspended' | 'inactive'): Promise<StaffUser> => {
    const isActivating = status === 'active';
    const u = await tauriClient.adminUpdateUser({
      user_id: id,
      status: isActivating ? ('ACTIVE' as any) : ('DISABLED' as any),
      is_active: isActivating,
    });
    const display = mapStaffRoleToDisplay(u.role);
    return {
      id: u.id,
      _id: u.id,
      name: u.name,
      username: u.username,
      email: `${u.username}@local`,
      roleId: display.roleId,
      roleName: display.roleName,
      hasPin: u.has_pin,
      status: (u.status ? u.status.toLowerCase() : (u.is_active ? 'active' : 'inactive')) as any,
      mustChangePassword: u.must_change_password,
      branchId: u.branch_id ?? undefined,
      createdAt: u.created_at,
    };
  },

  suspendStaff: async (id: string): Promise<StaffUser> => {
    return settingsApi.updateStaffStatus(id, 'suspended');
  },

  reactivateStaff: async (id: string): Promise<StaffUser> => {
    return settingsApi.updateStaffStatus(id, 'active');
  },

  changeStaffPin: async (id: string, pin: string): Promise<void> => {
    await tauriClient.adminResetCredentials({
      user_id: id,
      new_pin: pin,
    });
  },

  verifyAdminPassword: async (password: string): Promise<void> => {
    if (isTauriEnvironment()) {
      await tauriClient.adminVerifyPassword(password);
      return;
    }
  },

  deleteStaff: async (id: string): Promise<void> => {
    await tauriClient.adminDeleteUser(id);
  },

  changeStaffRole: async (id: string, roleId: string): Promise<StaffUser> => {
    const targetRole = mapRoleIdToStaffRole(roleId);
    const u = await tauriClient.adminUpdateUser({
      user_id: id,
      role: targetRole,
    });
    const display = mapStaffRoleToDisplay(u.role);
    return {
      id: u.id,
      _id: u.id,
      name: u.name,
      username: u.username,
      email: `${u.username}@local`,
      roleId: display.roleId,
      roleName: display.roleName,
      hasPin: u.has_pin,
      status: (u.status ? u.status.toLowerCase() : (u.is_active ? 'active' : 'inactive')) as any,
      mustChangePassword: u.must_change_password,
      branchId: u.branch_id ?? undefined,
      createdAt: u.created_at,
    };
  },

  // ─── Roles ──────────────────────────────────────────────────────────────────
  // DEF-08: All role CRUD now calls the backend HTTP API (/api/v1/roles).
  // The backend persists canonical role permission overrides in role_permission_grants
  // and custom roles in custom_roles (migration 028). localStorage role storage is no
  // longer authoritative — getBrowserCustomRoles() is kept only as a graceful fallback
  // for the transitional period while the DB table may not yet be migrated.

  getRoles: async (): Promise<RoleWithPermissions[]> => {
    try {
      // DEF-08: primary path — fetch from backend
      const backendRoles = await httpClient.get<RoleWithPermissions[]>('/api/v1/roles');
      return backendRoles;
    } catch (backendErr) {
      // Fallback: build local list from CANONICAL_ROLES + localStorage custom roles.
      // This path is used during initial deployment before migration 028 has run,
      // or in offline/network-error scenarios. It is intentionally read-only.
      console.warn('[settingsApi.getRoles] Backend unavailable, using local fallback. DEF-08 not fully active:', backendErr);
      const custom = getBrowserCustomRoles();
      const canonicalWithPersistedGrants: RoleWithPermissions[] = CANONICAL_ROLES.map((canonical) => {
        const staffRole = mapRoleIdToStaffRole(canonical._id);
        const defaultPerms = buildRolePermissionsMap(staffRole);
        const grants = getRolePermissionGrants(canonical._id);
        const effectivePerms: Record<string, boolean> = { ...defaultPerms };
        for (const [permKey, isGranted] of Object.entries(grants)) {
          if (isGranted) effectivePerms[permKey] = true;
        }
        return { ...canonical, permissions: effectivePerms, permissionCount: Object.values(effectivePerms).filter(Boolean).length };
      });
      return [...canonicalWithPersistedGrants, ...custom];
    }
  },

  getRoleById: async (id: string): Promise<RoleWithPermissions> => {
    try {
      return await httpClient.get<RoleWithPermissions>(`/api/v1/roles/${encodeURIComponent(id)}`);
    } catch {
      // Fallback to local list
      const roles = await settingsApi.getRoles();
      const found = roles.find((r) => r._id === id || normalizeRoleKey(r._id) === normalizeRoleKey(id));
      if (found) return found;
      return roles[0];
    }
  },

  createRole: async (data: CreateRoleDto): Promise<Role> => {
    // DEF-08: persist to backend; do NOT write to localStorage as primary storage.
    return await httpClient.post<Role>('/api/v1/roles', data);
  },

  updateRole: async (id: string, data: UpdateRoleDto): Promise<Role> => {
    // DEF-08: persist to backend; do NOT write to localStorage as primary storage.
    return await httpClient.put<Role>(`/api/v1/roles/${encodeURIComponent(id)}`, data);
  },

  deleteRole: async (id: string): Promise<void> => {
    // DEF-08: delete from backend; do NOT rely on localStorage as primary storage.
    await httpClient.delete<void>(`/api/v1/roles/${encodeURIComponent(id)}`);
  },

  duplicateRole: async (id: string): Promise<Role> => {
    // DEF-08: fetch source from backend, then create via backend
    const source = await settingsApi.getRoleById(id);
    const newData: CreateRoleDto = {
      name: `Copy of ${source?.name || id}`,
      description: source?.description || 'Duplicated role',
      permissions: source ? { ...source.permissions } : {},
    };
    return await httpClient.post<Role>('/api/v1/roles', newData);
  },

  // ─── Permissions ────────────────────────────────────────────────────────────
  getPermissions: async (): Promise<Permission[]> => {
    return Object.values(PERMISSION_METADATA).map((meta) => ({
      key: meta.key,
      module: meta.module,
      action: meta.action,
      label: meta.label,
      description: meta.description,
      adminOnly: meta.adminOnly,
    }));
  },

  getPermissionModules: async (): Promise<string[]> => {
    const modules = new Set(Object.values(PERMISSION_METADATA).map((m) => m.module));
    return Array.from(modules);
  },
};
