import { isTauriEnvironment, tauriClient } from '@/lib/tauri/tauriClient';
import { CreateRoleDto, UpdateRoleDto, Role, RoleWithPermissions, Permission } from '../types/role.types';
import { CreateStaffDto, UpdateStaffDto, StaffUser } from '../types/staff.types';

export const settingsApi = {
  // ─── Staff ──────────────────────────────────────────────────────────────────
  getStaff: async (): Promise<StaffUser[]> => {
    if (isTauriEnvironment()) {
      const users = await tauriClient.adminListUsers();
      return users.map((u) => ({
        id: u.id,
        _id: u.id,
        name: u.name,
        username: u.username,
        email: `${u.username}@local`,
        roleId: u.role,
        roleName: u.role.toUpperCase(),
        hasPin: u.has_pin,
        status: (u.status ? u.status.toLowerCase() : (u.is_active ? 'active' : 'inactive')) as any,
        mustChangePassword: u.must_change_password,
        createdAt: u.created_at,
      }));
    }
    return [];
  },

  approveStaff: async (id: string): Promise<StaffUser> => {
    if (isTauriEnvironment()) {
      const u = await tauriClient.adminApproveStaff(id);
      return {
        id: u.id,
        _id: u.id,
        name: u.name,
        username: u.username,
        roleId: u.role,
        roleName: u.role.toUpperCase(),
        hasPin: u.has_pin,
        status: 'active',
        mustChangePassword: u.must_change_password,
        createdAt: u.created_at,
      };
    }
    throw new Error("Desktop application requires Tauri runtime environment.");
  },

  rejectStaff: async (id: string): Promise<StaffUser> => {
    if (isTauriEnvironment()) {
      const u = await tauriClient.adminRejectStaff(id);
      return {
        id: u.id,
        _id: u.id,
        name: u.name,
        username: u.username,
        roleId: u.role,
        roleName: u.role.toUpperCase(),
        hasPin: u.has_pin,
        status: 'rejected',
        mustChangePassword: u.must_change_password,
        createdAt: u.created_at,
      };
    }
    throw new Error("Desktop application requires Tauri runtime environment.");
  },

  resetStaffPassword: async (id: string, temporaryPassword: string): Promise<void> => {
    if (isTauriEnvironment()) {
      await tauriClient.adminResetStaffPassword(id, temporaryPassword);
      return;
    }
    throw new Error("Desktop application requires Tauri runtime environment.");
  },

  createStaff: async (data: CreateStaffDto): Promise<StaffUser> => {
    if (isTauriEnvironment()) {
      const username = data.username || (data.email ? data.email.split('@')[0] : 'staff');
      const res = await tauriClient.authRegisterStaff({
        name: data.name,
        username,
        password: 'Niazi@123',
      });
      return {
        id: res.id,
        _id: res.id,
        name: data.name,
        username,
        email: data.email || `${username}@local`,
        roleId: data.roleId || 'staff',
        roleName: (data.roleId || 'staff').toUpperCase(),
        hasPin: false,
        status: 'pending',
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      };
    }
    throw new Error("Desktop application requires Tauri runtime environment.");
  },

  updateStaff: async (id: string, data: UpdateStaffDto): Promise<StaffUser> => {
    return {
      id,
      _id: id,
      name: data.name || 'Staff Member',
      username: 'staff',
      email: data.email || 'staff@local',
      roleId: data.roleId || 'staff',
      roleName: (data.roleId || 'staff').toUpperCase(),
      hasPin: false,
      status: data.status || 'active',
      mustChangePassword: false,
      createdAt: new Date().toISOString(),
    };
  },

  updateStaffStatus: async (id: string, status: 'active' | 'suspended' | 'inactive'): Promise<StaffUser> => {
    if (status === 'active') {
      return settingsApi.approveStaff(id);
    }
    if (status === 'inactive' || status === 'suspended') {
      return settingsApi.rejectStaff(id);
    }
    return {
      id,
      _id: id,
      name: 'Staff Member',
      username: 'staff',
      email: 'staff@local',
      roleId: 'staff',
      roleName: 'STAFF',
      hasPin: false,
      status,
      mustChangePassword: false,
      createdAt: new Date().toISOString(),
    };
  },

  resetStaffPin: async (_id: string): Promise<{ pin: string }> => {
    return { pin: '1234' };
  },

  changeStaffRole: async (id: string, roleId: string): Promise<StaffUser> => {
    return {
      id,
      _id: id,
      name: 'Staff Member',
      username: 'staff',
      email: 'staff@local',
      roleId,
      roleName: roleId.toUpperCase(),
      hasPin: false,
      status: 'active',
      mustChangePassword: false,
      createdAt: new Date().toISOString(),
    };
  },

  // ─── Roles ──────────────────────────────────────────────────────────────────
  getRoles: async (): Promise<RoleWithPermissions[]> => {
    return [
      {
        _id: 'admin',
        organizationId: '00000000-0000-0000-0000-000000000001',
        name: 'Administrator',
        description: 'Full system access',
        isSystem: true,
        userCount: 1,
        permissionCount: 5,
        permissions: { 'all': true },
        createdAt: new Date().toISOString(),
      },
      {
        _id: 'manager',
        organizationId: '00000000-0000-0000-0000-000000000001',
        name: 'Store Manager',
        description: 'Inventory and sales management',
        isSystem: true,
        userCount: 0,
        permissionCount: 3,
        permissions: { 'inventory': true, 'sales': true, 'reports': true },
        createdAt: new Date().toISOString(),
      },
      {
        _id: 'cashier',
        organizationId: '00000000-0000-0000-0000-000000000001',
        name: 'POS Cashier',
        description: 'Point of sale and register operations',
        isSystem: true,
        userCount: 0,
        permissionCount: 2,
        permissions: { 'pos': true, 'sales': true },
        createdAt: new Date().toISOString(),
      },
    ];
  },

  getRoleById: async (id: string): Promise<RoleWithPermissions> => {
    const roles = await settingsApi.getRoles();
    const found = roles.find((r) => r._id === id);
    if (found) return found;
    return roles[0];
  },

  createRole: async (data: CreateRoleDto): Promise<Role> => {
    return {
      _id: `role_${Date.now()}`,
      organizationId: '00000000-0000-0000-0000-000000000001',
      name: data.name,
      description: data.description,
      isSystem: false,
      permissions: data.permissions || {},
      createdAt: new Date().toISOString(),
    };
  },

  updateRole: async (id: string, data: UpdateRoleDto): Promise<Role> => {
    return {
      _id: id,
      organizationId: '00000000-0000-0000-0000-000000000001',
      name: data.name || 'Role',
      description: data.description || '',
      isSystem: false,
      permissions: data.permissions || {},
      createdAt: new Date().toISOString(),
    };
  },

  deleteRole: async (_id: string): Promise<void> => {
    return;
  },

  duplicateRole: async (id: string): Promise<Role> => {
    return {
      _id: `role_${Date.now()}`,
      organizationId: '00000000-0000-0000-0000-000000000001',
      name: `Copy of ${id}`,
      description: 'Duplicated role',
      isSystem: false,
      permissions: {},
      createdAt: new Date().toISOString(),
    };
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