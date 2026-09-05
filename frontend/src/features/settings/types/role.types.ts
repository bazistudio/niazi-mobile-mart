// ─── Permission ───────────────────────────────────────────────────────────────
export interface Permission {
  key: string;
  module: string;
  action: string;
  description?: string;
}

// ─── Role ─────────────────────────────────────────────────────────────────────
export interface Role {
  _id: string;
  organizationId: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: Record<string, boolean>;
  createdAt?: string;
  updatedAt?: string;
}

// ─── RolePermission (backend relationship) ────────────────────────────────────
export interface RolePermission {
  _id: string;
  roleId: string;
  permissionKey: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Role With Expanded Permissions ───────────────────────────────────────────
export interface RoleWithPermissions extends Role {
  permissionCount: number;
  userCount: number;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────
export interface CreateRoleDto {
  name: string;
  description?: string;
  permissions: Record<string, boolean>;
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  permissions?: Record<string, boolean>;
}