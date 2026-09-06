export interface StaffUser {
  id?: string;
  _id: string;
  organizationId?: string;
  name: string;
  phone?: string;
  username?: string;
  email?: string;
  roleId: string;
  roleName?: string;
  pin?: string;
  hasPin: boolean;
  status: 'active' | 'suspended' | 'inactive' | 'pending' | 'rejected';
  mustChangePassword?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────
export interface CreateStaffDto {
  name: string;
  phone?: string;
  username?: string;
  email?: string;
  pin?: string;
  roleId: string;
}

export interface UpdateStaffDto {
  name?: string;
  phone?: string;
  username?: string;
  email?: string;
  roleId?: string;
  status?: 'active' | 'suspended' | 'inactive';
}