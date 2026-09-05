export type UserRole =
  | "SUPER_ADMIN"
  | "MULTI_ADMIN"
  | "SHOP_ADMIN"
  | "OWNER"
  | "ADMIN"     // backend default registration role (alias of SHOP_ADMIN)
  | "STAFF";

export interface AuthUser {
  id: string;
  name: string;
  email: string;

  role: UserRole;
  status: "pending" | "active" | "suspended";

  // future multi-tenant support
  organizationId?: string;

  // active shop context
  shopId?: string;

  // optional fine-grained permissions (future upgrade)
  permissions?: string[];

  createdAt?: string;
  updatedAt?: string;
}