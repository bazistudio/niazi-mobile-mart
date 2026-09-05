import axiosInstance from '@/lib/api/axios';
import { CreateRoleDto, UpdateRoleDto, Role, RoleWithPermissions, Permission } from '../types/role.types';
import { CreateStaffDto, UpdateStaffDto, StaffUser } from '../types/staff.types';

export const settingsApi = {
  // ─── Staff ──────────────────────────────────────────────────────────────────
  getStaff: async (): Promise<StaffUser[]> => {
    const response = await axiosInstance.get('/api/v1/settings/staff');
    return response.data;
  },

  createStaff: async (data: CreateStaffDto): Promise<StaffUser> => {
    const response = await axiosInstance.post('/api/v1/settings/staff', data);
    return response.data;
  },

  updateStaff: async (id: string, data: UpdateStaffDto): Promise<StaffUser> => {
    const response = await axiosInstance.put(`/api/v1/settings/staff/${id}`, data);
    return response.data;
  },

  updateStaffStatus: async (id: string, status: 'active' | 'suspended' | 'inactive'): Promise<StaffUser> => {
    const response = await axiosInstance.patch(`/api/v1/settings/staff/${id}/status`, { status });
    return response.data;
  },

  resetStaffPin: async (id: string): Promise<{ pin: string }> => {
    const response = await axiosInstance.patch(`/api/v1/settings/staff/${id}/pin`);
    return response.data;
  },

  changeStaffRole: async (id: string, roleId: string): Promise<StaffUser> => {
    const response = await axiosInstance.patch(`/api/v1/settings/staff/${id}/role`, { roleId });
    return response.data;
  },

  // ─── Roles ──────────────────────────────────────────────────────────────────
  getRoles: async (): Promise<RoleWithPermissions[]> => {
    const response = await axiosInstance.get('/api/v1/settings/roles');
    return response.data;
  },

  getRoleById: async (id: string): Promise<RoleWithPermissions> => {
    const response = await axiosInstance.get(`/api/v1/settings/roles/${id}`);
    return response.data;
  },

  createRole: async (data: CreateRoleDto): Promise<Role> => {
    const payload = {
      ...data,
      permissions: Object.entries(data.permissions || {})
        .filter(([_, isEnabled]) => isEnabled)
        .map(([key]) => key),
    };
    const response = await axiosInstance.post('/api/v1/settings/roles', payload);
    return response.data;
  },

  updateRole: async (id: string, data: UpdateRoleDto): Promise<Role> => {
    const payload = {
      ...data,
      ...(data.permissions
        ? {
            permissions: Object.entries(data.permissions)
              .filter(([_, isEnabled]) => isEnabled)
              .map(([key]) => key),
          }
        : {}),
    };
    const response = await axiosInstance.put(`/api/v1/settings/roles/${id}`, payload);
    return response.data;
  },

  deleteRole: async (id: string): Promise<void> => {
    const response = await axiosInstance.delete(`/api/v1/settings/roles/${id}`);
    return response.data;
  },

  duplicateRole: async (id: string): Promise<Role> => {
    const response = await axiosInstance.post(`/api/v1/settings/roles/${id}/duplicate`);
    return response.data;
  },

  // ─── Permissions ────────────────────────────────────────────────────────────
  getPermissions: async (): Promise<Permission[]> => {
    const response = await axiosInstance.get('/api/v1/settings/permissions');
    return response.data;
  },

  getPermissionModules: async (): Promise<string[]> => {
    const response = await axiosInstance.get('/api/v1/settings/permissions/modules');
    return response.data;
  },
};