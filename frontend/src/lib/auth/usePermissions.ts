import { create } from 'zustand';
import { useAuthStore } from './core/auth.store';
import { PERMISSIONS } from '@/constants/permissions';

interface PermissionsState {
  matrix: Record<string, boolean>;
  setMatrix: (matrix: Record<string, boolean>) => void;
}

export const usePermissionsStore = create<PermissionsState>((set) => ({
  matrix: {},
  setMatrix: (matrix) => set({ matrix })
}));

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: Object.values(PERMISSIONS),
  ADMIN: Object.values(PERMISSIONS),
  SUPER_ADMIN: Object.values(PERMISSIONS),
  MULTI_ADMIN: Object.values(PERMISSIONS),
  
  // ─── 2. Branch Admin (Full Assigned Branch Administration) ──────────────
  SHOP_ADMIN: [
    PERMISSIONS.POS_USE,
    PERMISSIONS.POS_VOID_SALE,
    PERMISSIONS.POS_APPLY_DISCOUNT,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_EDIT,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_MANAGE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_MANAGE,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.PURCHASES_MANAGE,
    PERMISSIONS.PARTIES_VIEW,
    PERMISSIONS.PARTIES_MANAGE,
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.FINANCE_MANAGE,
    PERMISSIONS.EXPENSES_VIEW,
    PERMISSIONS.EXPENSES_MANAGE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.REPAIRS_VIEW,
    PERMISSIONS.REPAIRS_MANAGE,
    PERMISSIONS.SETTINGS_VIEW,
  ],

  // ─── 3. Manager (Operational Branch Management) ─────────────────────────
  MANAGER: [
    PERMISSIONS.POS_USE,
    PERMISSIONS.POS_VOID_SALE,
    PERMISSIONS.POS_APPLY_DISCOUNT,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_EDIT,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_MANAGE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_MANAGE,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.PURCHASES_MANAGE,
    PERMISSIONS.PARTIES_VIEW,
    PERMISSIONS.PARTIES_MANAGE,
    PERMISSIONS.EXPENSES_VIEW,
    PERMISSIONS.EXPENSES_MANAGE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.REPAIRS_VIEW,
    PERMISSIONS.REPAIRS_MANAGE,
  ],

  // ─── 4. Accountant (Financial & Ledger Focus) ───────────────────────────
  ACCOUNTANT: [
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.FINANCE_MANAGE,
    PERMISSIONS.EXPENSES_VIEW,
    PERMISSIONS.EXPENSES_MANAGE,
    PERMISSIONS.PARTIES_VIEW,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],

  // ─── 5. Salesman / Cashier (POS & Sales Focus) ──────────────────────────
  SALESMAN: [
    PERMISSIONS.POS_USE,
    PERMISSIONS.POS_APPLY_DISCOUNT,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.PARTIES_VIEW,
  ],
  CASHIER: [
    PERMISSIONS.POS_USE,
    PERMISSIONS.POS_APPLY_DISCOUNT,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.PARTIES_VIEW,
  ],

  // ─── 6. Repair Mechanic (Repairs / Service Focus) ───────────────────────
  REPAIR_MECHANIC: [
    PERMISSIONS.REPAIRS_VIEW,
    PERMISSIONS.REPAIRS_MANAGE,
    PERMISSIONS.PARTIES_VIEW,
  ],

  // ─── Base Staff ─────────────────────────────────────────────────────────
  STAFF: [
    PERMISSIONS.POS_USE,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
  ],
};

export const usePermissions = () => {
  const matrix = usePermissionsStore(state => state.matrix);
  const user = useAuthStore(state => state.user);
  
  const role = user?.role || null;

  const hasPermission = (permission: string) => {
    const currentRole = role as string;
    // SuperAdmin, MultiAdmin and Org Owner bypass checks
    if (currentRole === 'SUPER_ADMIN' || currentRole === 'MULTI_ADMIN' || currentRole === 'OWNER') return true;

    // Evaluate against explicitly loaded matrix if populated
    if (Object.keys(matrix).length > 0) {
      return matrix[permission] === true;
    }
    
    // Default fallback based on role
    const rolePerms = DEFAULT_ROLE_PERMISSIONS[currentRole] || [];
    return rolePerms.includes(permission);
  };

  return { hasPermission, role };
};

