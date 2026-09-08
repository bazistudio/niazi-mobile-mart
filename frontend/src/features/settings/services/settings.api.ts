import { isTauriEnvironment, tauriClient, StaffRole } from '@/lib/tauri/tauriClient';
import { CreateRoleDto, UpdateRoleDto, Role, RoleWithPermissions, Permission } from '../types/role.types';
import { CreateStaffDto, UpdateStaffDto, StaffUser } from '../types/staff.types';

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
const BROWSER_STAFF_STORAGE_KEY = 'nmm_browser_staff_users';
const BROWSER_ROLES_STORAGE_KEY = 'nmm_browser_custom_roles';

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

const CANONICAL_ROLES: RoleWithPermissions[] = [
  {
    _id: 'admin',
    organizationId: '00000000-0000-0000-0000-000000000001',
    name: 'Organization Admin',
    description: 'Full unrestricted organization & multi-branch access',
    isSystem: true,
    userCount: 1,
    permissionCount: 30,
    permissions: { all: true },
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'shop_admin',
    organizationId: '00000000-0000-0000-0000-000000000001',
    name: 'Branch Admin',
    description: 'Full assigned-branch management and administration',
    isSystem: true,
    userCount: 0,
    permissionCount: 22,
    permissions: {
      pos: true,
      inventory: true,
      sales: true,
      purchases: true,
      finance: true,
      reports: true,
      settings: true,
    },
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'manager',
    organizationId: '00000000-0000-0000-0000-000000000001',
    name: 'Manager',
    description: 'Day-to-day branch operations, stock, and sales management',
    isSystem: true,
    userCount: 0,
    permissionCount: 18,
    permissions: { pos: true, inventory: true, sales: true, purchases: true, reports: true },
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'accountant',
    organizationId: '00000000-0000-0000-0000-000000000001',
    name: 'Accountant',
    description: 'Financial records, ledgers, expenses, and business reports',
    isSystem: true,
    userCount: 0,
    permissionCount: 8,
    permissions: { finance: true, expenses: true, reports: true, parties: true },
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'salesman',
    organizationId: '00000000-0000-0000-0000-000000000001',
    name: 'Salesman',
    description: 'Point of sale, customer billing, and register operations',
    isSystem: true,
    userCount: 0,
    permissionCount: 5,
    permissions: { pos: true, sales: true, parties: true },
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'repair_mechanic',
    organizationId: '00000000-0000-0000-0000-000000000001',
    name: 'Repair Mechanic',
    description: 'Device repair tracking, service ticketing, and parts scope',
    isSystem: true,
    userCount: 0,
    permissionCount: 3,
    permissions: { repairs: true, parties: true },
    createdAt: new Date().toISOString(),
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
      if (status === 'active') return settingsApi.approveStaff(id);
      if (status === 'inactive' || status === 'suspended') return settingsApi.rejectStaff(id);
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
    return [...CANONICAL_ROLES, ...custom];
  },

  getRoleById: async (id: string): Promise<RoleWithPermissions> => {
    const roles = await settingsApi.getRoles();
    const found = roles.find((r) => r._id === id);
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
    const canonical = CANONICAL_ROLES.find((r) => r._id === id);
    return {
      _id: id,
      organizationId: '00000000-0000-0000-0000-000000000001',
      name: data.name || canonical?.name || 'Role',
      description: data.description !== undefined ? data.description : canonical?.description || '',
      isSystem: canonical?.isSystem ?? false,
      permissions: data.permissions || canonical?.permissions || {},
      createdAt: new Date().toISOString(),
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
    return [
      { key: 'pos:operate', module: 'pos', action: 'operate', description: 'Operate POS' },
      { key: 'inventory:view', module: 'inventory', action: 'view', description: 'View Inventory' },
      { key: 'inventory:adjust', module: 'inventory', action: 'adjust', description: 'Adjust Stock' },
      { key: 'reports:view', module: 'reports', action: 'view', description: 'View Reports' },
      { key: 'settings:manage', module: 'settings', action: 'manage', description: 'Manage Settings' },
    ];
  },

  getPermissionModules: async (): Promise<string[]> => {
    return ['pos', 'inventory', 'sales', 'reports', 'settings'];
  },
};