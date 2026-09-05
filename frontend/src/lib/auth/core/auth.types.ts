export type UserRole = "SUPER_ADMIN" | "MULTI_ADMIN" | "SHOP_ADMIN" | "OWNER" | "ADMIN" | "STAFF";

export interface AuthUser {
  id: string;
  name: string;
  email: string;

  role: UserRole;

  organizationId?: string;
  shopId?: string;

  permissions?: string[];
}