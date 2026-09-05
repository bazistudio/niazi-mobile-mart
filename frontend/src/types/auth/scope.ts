import { UserRole } from "./auth";

export interface ShopScope {
  organizationId: string;
  shopId: string;
}

export interface AccessScope {
  role: UserRole;

  organizationId?: string;
  shopId?: string;

  isGlobal: boolean;
}