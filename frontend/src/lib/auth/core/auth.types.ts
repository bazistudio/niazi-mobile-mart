export type UserRole =
  | "SUPER_ADMIN"
  | "MULTI_ADMIN"
  | "SHOP_ADMIN"
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "ACCOUNTANT"
  | "SALESMAN"
  | "CASHIER"
  | "REPAIR_MECHANIC"
  | "STAFF";

export interface AuthUser {
  id: string;
  name: string;
  email: string;

  role: UserRole;

  organizationId?: string;
  shopId?: string;

  permissions?: string[];
}