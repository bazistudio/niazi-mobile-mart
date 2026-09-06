export type UserRole =
  | "SUPER_ADMIN"
  | "MULTI_ADMIN"
  | "SHOP_ADMIN"
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "CASHIER"
  | "STAFF";

export interface AuthUser {
  id: string;
  name: string;
  username?: string;
  email: string;

  role: UserRole;
  status: "pending" | "active" | "suspended" | "rejected";
  mustChangePassword?: boolean;

  // future multi-tenant support
  organizationId?: string;

  // active shop context
  shopId?: string;

  // optional fine-grained permissions (future upgrade)
  permissions?: string[];

  createdAt?: string;
  updatedAt?: string;
}