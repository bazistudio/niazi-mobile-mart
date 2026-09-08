import { isTauriEnvironment, tauriClient, StaffRole } from '@/lib/tauri/tauriClient';
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

function getBrowserStaff(): StaffUser[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(BROWSER_STAFF_STORAGE_KEY) : null;
    if (raw) return JSON.parse(raw);
  } catch {}
  const seed: StaffUser[] = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      _id: '00000000-0000-0000-0000-000000000001',
      name: 'System Administrator',
      username: 'admin',
      email: 'admin@local',
      roleId: 'admin',
      roleName: 'Organization Admin',
      hasPin: true,
      status: 'active',
      mustChangePassword: false,
      createdAt: new Date().toISOString(),
    },
  ];
  saveBrowserStaff(seed);
  return seed;
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
    if (isTauriEnvironment()) {
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
          createdAt: u.created_at,
        };
      });
    }
    return getBrowserStaff();
  },

  approveStaff: async (id: string): Promise<StaffUser> => {
    if (isTauriEnvironment()) {
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
        createdAt: u.created_at,
      };
    }
    return settingsApi.updateStaffStatus(id, 'active');
  },

  rejectStaff: async (id: string): Promise<StaffUser> => {
    if (isTauriEnvironment()) {
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
        createdAt: u.created_at,
      };
    }
    return settingsApi.updateStaffStatus(id, 'inactive');
  },

  resetStaffPassword: async (id: string, temporaryPassword: string): Promise<void> => {
    if (isTauriEnvironment()) {
      await tauriClient.adminResetStaffPassword(id, temporaryPassword);
      return;
    }
  },

  createStaff: async (data: CreateStaffDto): Promise<StaffUser> => {
    const rawUsername =
      data.username || (data.email ? data.email.split('@')[0] : data.name.toLowerCase().replace(/\s+/g, ''));
    const username = rawUsername.trim().toLowerCase();
    const roleId = data.roleId || 'staff';
    const targetStaffRole = mapRoleIdToStaffRole(roleId);
    const display = mapStaffRoleToDisplay(targetStaffRole);

    if (isTauriEnvironment()) {
      const effectivePin = data.pin && data.pin.trim().length === 4 ? data.pin.trim() : undefined;
      const res = await tauriClient.adminCreateUser({
        name: data.name.trim(),
        username,
        login_key: effectivePin ? `Niazi@${effectivePin}` : 'Niazi@123',
        pin: effectivePin,
        role: targetStaffRole,
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
        createdAt: res.created_at,
      };
    }

    // Browser development / offline preview fallback
    const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newUser: StaffUser = {
      id,
      _id: id,
      name: data.name.trim(),
      username,
      email: data.email || `${username}@local`,
      phone: data.phone,
      roleId: display.roleId,
      roleName: display.roleName,
      hasPin: !!(data.pin && data.pin.trim().length === 4),
      status: 'active',
      mustChangePassword: false,
      createdAt: new Date().toISOString(),
    };
    const staff = getBrowserStaff();
    staff.push(newUser);
    saveBrowserStaff(staff);
    return newUser;
  },

  updateStaff: async (id: string, data: UpdateStaffDto): Promise<StaffUser> => {
    if (isTauriEnvironment()) {
      const targetRole = data.roleId ? mapRoleIdToStaffRole(data.roleId) : undefined;
      const u = await tauriClient.adminUpdateUser({
        user_id: id,
        name: data.name,
        role: targetRole,
        status: data.status ? (data.status.toUpperCase() as any) : undefined,
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
        createdAt: u.created_at,
      };
    }

    const staff = getBrowserStaff();
    const idx = staff.findIndex((u) => u.id === id || u._id === id);
    if (idx >= 0) {
      const current = staff[idx];
      const display = data.roleId
        ? mapStaffRoleToDisplay(mapRoleIdToStaffRole(data.roleId))
        : { roleId: current.roleId, roleName: current.roleName };
      const updated: StaffUser = {
        ...current,
        name: data.name !== undefined ? data.name : current.name,
        phone: data.phone !== undefined ? data.phone : current.phone,
        email: data.email !== undefined ? data.email : current.email,
        roleId: display.roleId,
        roleName: display.roleName,
        status: data.status !== undefined ? data.status : current.status,
      };
      staff[idx] = updated;
      saveBrowserStaff(staff);
      return updated;
    }
    throw new Error(`User with ID ${id} not found`);
  },

  updateStaffStatus: async (id: string, status: 'active' | 'suspended' | 'inactive'): Promise<StaffUser> => {
    if (isTauriEnvironment()) {
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
        createdAt: u.created_at,
      };
    }
    const staff = getBrowserStaff();
    const idx = staff.findIndex((u) => u.id === id || u._id === id);
    if (idx >= 0) {
      staff[idx].status = status;
      saveBrowserStaff(staff);
      return staff[idx];
    }
    throw new Error(`User with ID ${id} not found`);
  },

  resetStaffPin: async (id: string): Promise<{ pin: string }> => {
    const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
    if (isTauriEnvironment()) {
      await tauriClient.adminResetCredentials({
        user_id: id,
        new_pin: generatedPin,
      });
      return { pin: generatedPin };
    }

    const staff = getBrowserStaff();
    const idx = staff.findIndex((u) => u.id === id || u._id === id);
    if (idx >= 0) {
      staff[idx].hasPin = true;
      saveBrowserStaff(staff);
    }
    return { pin: generatedPin };
  },

  changeStaffRole: async (id: string, roleId: string): Promise<StaffUser> => {
    const targetRole = mapRoleIdToStaffRole(roleId);
    if (isTauriEnvironment()) {
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
        createdAt: u.created_at,
      };
    }

    const staff = getBrowserStaff();
    const idx = staff.findIndex((u) => u.id === id || u._id === id);
    if (idx >= 0) {
      const display = mapStaffRoleToDisplay(targetRole);
      staff[idx].roleId = display.roleId;
      staff[idx].roleName = display.roleName;
      saveBrowserStaff(staff);
      return staff[idx];
    }
    throw new Error(`User with ID ${id} not found`);
  },

  // ─── Roles ──────────────────────────────────────────────────────────────────
  getRoles: async (): Promise<RoleWithPermissions[]> => {
    const custom = getBrowserCustomRoles();
    const canonicalWithPersistedGrants: RoleWithPermissions[] = CANONICAL_ROLES.map((canonical) => {
      const staffRole = mapRoleIdToStaffRole(canonical._id);
      const defaultPerms = buildRolePermissionsMap(staffRole);
      const grants = getRolePermissionGrants(canonical._id);

      const effectivePerms: Record<string, boolean> = { ...defaultPerms };
      for (const [permKey, isGranted] of Object.entries(grants)) {
        if (isGranted) {
          effectivePerms[permKey] = true;
        }
      }

      return {
        ...canonical,
        permissions: effectivePerms,
        permissionCount: Object.values(effectivePerms).filter(Boolean).length,
      };
    });
    return [...canonicalWithPersistedGrants, ...custom];
  },

  getRoleById: async (id: string): Promise<RoleWithPermissions> => {
    const roles = await settingsApi.getRoles();
    const found = roles.find((r) => r._id === id || normalizeRoleKey(r._id) === normalizeRoleKey(id));
    if (found) return found;
    return roles[0];
  },

  createRole: async (data: CreateRoleDto): Promise<Role> => {
    const newRole: RoleWithPermissions = {
      _id: `role_${Date.now()}`,
      organizationId: '00000000-0000-0000-0000-000000000001',
      name: data.name,
      description: data.description,
      isSystem: false,
      userCount: 0,
      permissionCount: Object.keys(data.permissions || {}).length,
      permissions: data.permissions || {},
      createdAt: new Date().toISOString(),
    };
    const custom = getBrowserCustomRoles();
    custom.push(newRole);
    saveBrowserCustomRoles(custom);
    return newRole;
  },

  updateRole: async (id: string, data: UpdateRoleDto): Promise<Role> => {
    const custom = getBrowserCustomRoles();
    const idx = custom.findIndex((r) => r._id === id);
    if (idx >= 0) {
      custom[idx] = {
        ...custom[idx],
        name: data.name || custom[idx].name,
        description: data.description !== undefined ? data.description : custom[idx].description,
        permissions: data.permissions || custom[idx].permissions,
        permissionCount: Object.keys(data.permissions || custom[idx].permissions).length,
      };
      saveBrowserCustomRoles(custom);
      return custom[idx];
    }

    const canonical = CANONICAL_ROLES.find(
      (r) => r._id === id || normalizeRoleKey(r._id) === normalizeRoleKey(id)
    );
    const roleId = canonical ? canonical._id : normalizeRoleKey(id);
    const staffRole = mapRoleIdToStaffRole(roleId);
    const roleDecisions = ROLE_PERMISSION_DECISIONS[staffRole] || {};

    if (data.permissions) {
      // Extract ONLY permissions where decision is INDIVIDUAL
      const individualGrantsToSave: Record<string, boolean> = {};
      for (const [permKey, isEnabled] of Object.entries(data.permissions)) {
        const decision = roleDecisions[permKey as PermissionKey];
        if (decision === 'INDIVIDUAL' && isEnabled === true) {
          individualGrantsToSave[permKey] = true;
        }
      }
      saveRolePermissionGrants(roleId, individualGrantsToSave);
    }

    const defaultPerms = buildRolePermissionsMap(staffRole);
    const grants = getRolePermissionGrants(roleId);
    const effectivePerms: Record<string, boolean> = { ...defaultPerms };
    for (const [permKey, isGranted] of Object.entries(grants)) {
      if (isGranted) {
        effectivePerms[permKey] = true;
      }
    }

    return {
      _id: roleId,
      organizationId: '00000000-0000-0000-0000-000000000001',
      name: data.name || canonical?.name || roleId,
      description: data.description !== undefined ? data.description : canonical?.description || '',
      isSystem: canonical?.isSystem ?? true,
      permissions: effectivePerms,
      createdAt: canonical?.createdAt || '2026-01-01T00:00:00.000Z',
      updatedAt: new Date().toISOString(),
    };
  },

  deleteRole: async (id: string): Promise<void> => {
    const custom = getBrowserCustomRoles().filter((r) => r._id !== id);
    saveBrowserCustomRoles(custom);
  },

  duplicateRole: async (id: string): Promise<Role> => {
    const roles = await settingsApi.getRoles();
    const source = roles.find((r) => r._id === id);
    const newRole: RoleWithPermissions = {
      _id: `role_${Date.now()}`,
      organizationId: '00000000-0000-0000-0000-000000000001',
      name: `Copy of ${source?.name || id}`,
      description: source?.description || 'Duplicated role',
      isSystem: false,
      userCount: 0,
      permissionCount: source?.permissionCount || 0,
      permissions: source ? { ...source.permissions } : {},
      createdAt: new Date().toISOString(),
    };
    const custom = getBrowserCustomRoles();
    custom.push(newRole);
    saveBrowserCustomRoles(custom);
    return newRole;
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