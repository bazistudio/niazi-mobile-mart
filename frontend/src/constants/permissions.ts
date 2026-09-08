export const PERMISSIONS = {
  // Organization Level
  ORG_VIEW: 'org.view',
  ORG_EDIT: 'org.edit',
  ORG_SETTINGS_MANAGE: 'org.settings.manage',
  ORG_BILLING_MANAGE: 'org.billing.manage',

  // Settings
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',

  // Cross-Shop / All Shops Access
  SHOPS_VIEW_ALL: 'shops.view.all',
  SHOPS_MANAGE: 'shops.manage', // Create, Edit, Delete shops

  // User & Role Management
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage', // Invite, remove, change roles

  // Point of Sale (POS)
  POS_USE: 'pos.use',
  POS_VOID_SALE: 'pos.void_sale',
  POS_APPLY_DISCOUNT: 'pos.apply_discount',

  // Inventory & Products
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_EDIT: 'inventory.edit', // Stock adjustments
  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_MANAGE: 'products.manage', // Add, edit, delete products
  
  // Sales & Purchases
  SALES_VIEW: 'sales.view',
  SALES_MANAGE: 'sales.manage',
  PURCHASES_VIEW: 'purchases.view',
  PURCHASES_MANAGE: 'purchases.manage',

  // Parties (Customers & Suppliers)
  PARTIES_VIEW: 'parties.view',
  PARTIES_MANAGE: 'parties.manage',

  // Finance & Ledger
  FINANCE_VIEW: 'finance.view',
  FINANCE_MANAGE: 'finance.manage',
  EXPENSES_VIEW: 'expenses.view',
  EXPENSES_MANAGE: 'expenses.manage',

  // Reports & Analytics
  REPORTS_VIEW: 'reports.view', // Single shop reports
  REPORTS_VIEW_ALL: 'reports.view.all', // Consolidated cross-shop reports

  // Repairs & Services
  REPAIRS_VIEW: 'repairs.view',
  REPAIRS_MANAGE: 'repairs.manage',
} as const;

export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export type PermissionDecision = 'SELECT' | 'INDIVIDUAL' | 'REJECT' | 'ADMIN_ONLY';

export interface PermissionMetadata {
  key: PermissionKey;
  label: string;
  module: string;
  action: string;
  adminOnly?: boolean;
  description?: string;
}

export const PERMISSION_METADATA: Record<PermissionKey, PermissionMetadata> = {
  [PERMISSIONS.ORG_VIEW]: {
    key: PERMISSIONS.ORG_VIEW,
    label: 'View Organization',
    module: 'organization',
    action: 'view',
    adminOnly: true,
    description: 'View organization details and profiles',
  },
  [PERMISSIONS.ORG_EDIT]: {
    key: PERMISSIONS.ORG_EDIT,
    label: 'Edit Organization',
    module: 'organization',
    action: 'edit',
    adminOnly: true,
    description: 'Modify organization profile and information',
  },
  [PERMISSIONS.ORG_SETTINGS_MANAGE]: {
    key: PERMISSIONS.ORG_SETTINGS_MANAGE,
    label: 'Manage Org Settings',
    module: 'organization',
    action: 'manage',
    adminOnly: true,
    description: 'Configure organization-wide operational settings',
  },
  [PERMISSIONS.ORG_BILLING_MANAGE]: {
    key: PERMISSIONS.ORG_BILLING_MANAGE,
    label: 'Manage Org Billing',
    module: 'organization',
    action: 'manage',
    adminOnly: true,
    description: 'Manage subscription plans, invoices, and billing',
  },

  [PERMISSIONS.SETTINGS_VIEW]: {
    key: PERMISSIONS.SETTINGS_VIEW,
    label: 'View Settings',
    module: 'settings',
    action: 'view',
    adminOnly: false,
    description: 'View shop-level preferences and printer configs',
  },
  [PERMISSIONS.SETTINGS_MANAGE]: {
    key: PERMISSIONS.SETTINGS_MANAGE,
    label: 'Manage Settings',
    module: 'settings',
    action: 'manage',
    adminOnly: false,
    description: 'Configure shop parameters and system options',
  },

  [PERMISSIONS.SHOPS_VIEW_ALL]: {
    key: PERMISSIONS.SHOPS_VIEW_ALL,
    label: 'View All Shops',
    module: 'shops',
    action: 'view',
    adminOnly: true,
    description: 'View across all shop branches and locations',
  },
  [PERMISSIONS.SHOPS_MANAGE]: {
    key: PERMISSIONS.SHOPS_MANAGE,
    label: 'Manage Shops',
    module: 'shops',
    action: 'manage',
    adminOnly: true,
    description: 'Create, edit, and deactivate branches',
  },

  [PERMISSIONS.USERS_VIEW]: {
    key: PERMISSIONS.USERS_VIEW,
    label: 'View Users',
    module: 'users',
    action: 'view',
    adminOnly: false,
    description: 'View staff members and credentials status',
  },
  [PERMISSIONS.USERS_MANAGE]: {
    key: PERMISSIONS.USERS_MANAGE,
    label: 'Manage Users',
    module: 'users',
    action: 'manage',
    adminOnly: false,
    description: 'Invite staff, manage roles, and reset PINs',
  },

  [PERMISSIONS.POS_USE]: {
    key: PERMISSIONS.POS_USE,
    label: 'Use POS System',
    module: 'pos',
    action: 'use',
    adminOnly: false,
    description: 'Access terminal checkout and process sales',
  },
  [PERMISSIONS.POS_VOID_SALE]: {
    key: PERMISSIONS.POS_VOID_SALE,
    label: 'Void Sale Invoice',
    module: 'pos',
    action: 'void',
    adminOnly: false,
    description: 'Void completed invoices and return stock',
  },
  [PERMISSIONS.POS_APPLY_DISCOUNT]: {
    key: PERMISSIONS.POS_APPLY_DISCOUNT,
    label: 'Apply POS Discount',
    module: 'pos',
    action: 'discount',
    adminOnly: false,
    description: 'Provide customer order discounts at terminal',
  },

  [PERMISSIONS.INVENTORY_VIEW]: {
    key: PERMISSIONS.INVENTORY_VIEW,
    label: 'View Inventory',
    module: 'inventory',
    action: 'view',
    adminOnly: false,
    description: 'Browse stock balances and alert levels',
  },
  [PERMISSIONS.INVENTORY_EDIT]: {
    key: PERMISSIONS.INVENTORY_EDIT,
    label: 'Edit Inventory',
    module: 'inventory',
    action: 'edit',
    adminOnly: false,
    description: 'Perform stock adjustments and transfers',
  },
  [PERMISSIONS.PRODUCTS_VIEW]: {
    key: PERMISSIONS.PRODUCTS_VIEW,
    label: 'View Products',
    module: 'products',
    action: 'view',
    adminOnly: false,
    description: 'View product catalog and pricing',
  },
  [PERMISSIONS.PRODUCTS_MANAGE]: {
    key: PERMISSIONS.PRODUCTS_MANAGE,
    label: 'Manage Products',
    module: 'products',
    action: 'manage',
    adminOnly: false,
    description: 'Create, update, and categorize products',
  },

  [PERMISSIONS.SALES_VIEW]: {
    key: PERMISSIONS.SALES_VIEW,
    label: 'View Sales',
    module: 'sales',
    action: 'view',
    adminOnly: false,
    description: 'Browse sales order history and receipts',
  },
  [PERMISSIONS.SALES_MANAGE]: {
    key: PERMISSIONS.SALES_MANAGE,
    label: 'Manage Sales',
    module: 'sales',
    action: 'manage',
    adminOnly: false,
    description: 'Edit, refund, or manage customer orders',
  },
  [PERMISSIONS.PURCHASES_VIEW]: {
    key: PERMISSIONS.PURCHASES_VIEW,
    label: 'View Purchases',
    module: 'purchases',
    action: 'view',
    adminOnly: false,
    description: 'Browse vendor purchase orders and incoming bills',
  },
  [PERMISSIONS.PURCHASES_MANAGE]: {
    key: PERMISSIONS.PURCHASES_MANAGE,
    label: 'Manage Purchases',
    module: 'purchases',
    action: 'manage',
    adminOnly: false,
    description: 'Create, update, and finalize vendor purchases',
  },

  [PERMISSIONS.PARTIES_VIEW]: {
    key: PERMISSIONS.PARTIES_VIEW,
    label: 'View Parties',
    module: 'parties',
    action: 'view',
    adminOnly: false,
    description: 'View customer and supplier directory',
  },
  [PERMISSIONS.PARTIES_MANAGE]: {
    key: PERMISSIONS.PARTIES_MANAGE,
    label: 'Manage Parties',
    module: 'parties',
    action: 'manage',
    adminOnly: false,
    description: 'Add and edit customer and supplier accounts',
  },

  [PERMISSIONS.FINANCE_VIEW]: {
    key: PERMISSIONS.FINANCE_VIEW,
    label: 'View Finance & Cash',
    module: 'finance',
    action: 'view',
    adminOnly: false,
    description: 'Inspect cash drawer balances and ledger entries',
  },
  [PERMISSIONS.FINANCE_MANAGE]: {
    key: PERMISSIONS.FINANCE_MANAGE,
    label: 'Manage Finance & Cash',
    module: 'finance',
    action: 'manage',
    adminOnly: false,
    description: 'Process cash movements and ledger settlements',
  },
  [PERMISSIONS.EXPENSES_VIEW]: {
    key: PERMISSIONS.EXPENSES_VIEW,
    label: 'View Expenses',
    module: 'expenses',
    action: 'view',
    adminOnly: false,
    description: 'Browse expense records and petty cash logs',
  },
  [PERMISSIONS.EXPENSES_MANAGE]: {
    key: PERMISSIONS.EXPENSES_MANAGE,
    label: 'Manage Expenses',
    module: 'expenses',
    action: 'manage',
    adminOnly: false,
    description: 'Create, categorize, and approve business expenses',
  },

  [PERMISSIONS.REPORTS_VIEW]: {
    key: PERMISSIONS.REPORTS_VIEW,
    label: 'View Reports',
    module: 'reports',
    action: 'view',
    adminOnly: false,
    description: 'Access branch analytics and summaries',
  },
  [PERMISSIONS.REPORTS_VIEW_ALL]: {
    key: PERMISSIONS.REPORTS_VIEW_ALL,
    label: 'View All Reports',
    module: 'reports',
    action: 'view',
    adminOnly: false,
    description: 'Cross-shop consolidated reporting and intelligence',
  },

  [PERMISSIONS.REPAIRS_VIEW]: {
    key: PERMISSIONS.REPAIRS_VIEW,
    label: 'View Repairs',
    module: 'repairs',
    action: 'view',
    adminOnly: false,
    description: 'View repair orders and workshop statuses',
  },
  [PERMISSIONS.REPAIRS_MANAGE]: {
    key: PERMISSIONS.REPAIRS_MANAGE,
    label: 'Manage Repairs',
    module: 'repairs',
    action: 'manage',
    adminOnly: false,
    description: 'Create, diagnose, and bill service tickets',
  },
};

// ─── CANONICAL FOUR-STATE ROLE DECISION MATRIX ──────────────────────────────
export const ROLE_PERMISSION_DECISIONS: Record<string, Record<PermissionKey, PermissionDecision>> = {
  OWNER: Object.fromEntries(Object.values(PERMISSIONS).map(p => [p, 'SELECT'])) as Record<PermissionKey, PermissionDecision>,
  ADMIN: Object.fromEntries(Object.values(PERMISSIONS).map(p => [p, 'SELECT'])) as Record<PermissionKey, PermissionDecision>,
  SUPER_ADMIN: Object.fromEntries(Object.values(PERMISSIONS).map(p => [p, 'SELECT'])) as Record<PermissionKey, PermissionDecision>,
  MULTI_ADMIN: Object.fromEntries(Object.values(PERMISSIONS).map(p => [p, 'SELECT'])) as Record<PermissionKey, PermissionDecision>,

  SHOP_ADMIN: {
    [PERMISSIONS.ORG_VIEW]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_EDIT]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_SETTINGS_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_BILLING_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.SHOPS_VIEW_ALL]: 'ADMIN_ONLY',
    [PERMISSIONS.SHOPS_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.REPORTS_VIEW_ALL]: 'REJECT',
    [PERMISSIONS.SETTINGS_MANAGE]: 'REJECT',
    [PERMISSIONS.USERS_VIEW]: 'INDIVIDUAL',
    [PERMISSIONS.USERS_MANAGE]: 'INDIVIDUAL',
    [PERMISSIONS.POS_USE]: 'SELECT',
    [PERMISSIONS.POS_VOID_SALE]: 'SELECT',
    [PERMISSIONS.POS_APPLY_DISCOUNT]: 'SELECT',
    [PERMISSIONS.INVENTORY_VIEW]: 'SELECT',
    [PERMISSIONS.INVENTORY_EDIT]: 'SELECT',
    [PERMISSIONS.PRODUCTS_VIEW]: 'SELECT',
    [PERMISSIONS.PRODUCTS_MANAGE]: 'SELECT',
    [PERMISSIONS.SALES_VIEW]: 'SELECT',
    [PERMISSIONS.SALES_MANAGE]: 'SELECT',
    [PERMISSIONS.PURCHASES_VIEW]: 'SELECT',
    [PERMISSIONS.PURCHASES_MANAGE]: 'SELECT',
    [PERMISSIONS.PARTIES_VIEW]: 'SELECT',
    [PERMISSIONS.PARTIES_MANAGE]: 'SELECT',
    [PERMISSIONS.FINANCE_VIEW]: 'SELECT',
    [PERMISSIONS.FINANCE_MANAGE]: 'SELECT',
    [PERMISSIONS.EXPENSES_VIEW]: 'SELECT',
    [PERMISSIONS.EXPENSES_MANAGE]: 'SELECT',
    [PERMISSIONS.REPORTS_VIEW]: 'SELECT',
    [PERMISSIONS.REPAIRS_VIEW]: 'SELECT',
    [PERMISSIONS.REPAIRS_MANAGE]: 'SELECT',
    [PERMISSIONS.SETTINGS_VIEW]: 'SELECT',
  },

  MANAGER: {
    [PERMISSIONS.ORG_VIEW]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_EDIT]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_SETTINGS_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_BILLING_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.SHOPS_VIEW_ALL]: 'ADMIN_ONLY',
    [PERMISSIONS.SHOPS_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.REPORTS_VIEW_ALL]: 'REJECT',
    [PERMISSIONS.SETTINGS_MANAGE]: 'REJECT',
    [PERMISSIONS.USERS_MANAGE]: 'REJECT',
    // Default / SELECT:
    [PERMISSIONS.PRODUCTS_VIEW]: 'SELECT',
    [PERMISSIONS.INVENTORY_VIEW]: 'SELECT',
    [PERMISSIONS.SALES_VIEW]: 'SELECT',
    [PERMISSIONS.PURCHASES_VIEW]: 'SELECT',
    [PERMISSIONS.PARTIES_VIEW]: 'SELECT',
    [PERMISSIONS.REPORTS_VIEW]: 'SELECT',
    [PERMISSIONS.REPAIRS_VIEW]: 'SELECT',
    // INDIVIDUAL:
    [PERMISSIONS.POS_USE]: 'INDIVIDUAL',
    [PERMISSIONS.POS_VOID_SALE]: 'INDIVIDUAL',
    [PERMISSIONS.POS_APPLY_DISCOUNT]: 'INDIVIDUAL',
    [PERMISSIONS.PRODUCTS_MANAGE]: 'INDIVIDUAL',
    [PERMISSIONS.INVENTORY_EDIT]: 'INDIVIDUAL',
    [PERMISSIONS.SALES_MANAGE]: 'INDIVIDUAL',
    [PERMISSIONS.PURCHASES_MANAGE]: 'INDIVIDUAL',
    [PERMISSIONS.PARTIES_MANAGE]: 'INDIVIDUAL',
    [PERMISSIONS.FINANCE_VIEW]: 'INDIVIDUAL',
    [PERMISSIONS.FINANCE_MANAGE]: 'INDIVIDUAL',
    [PERMISSIONS.EXPENSES_VIEW]: 'INDIVIDUAL',
    [PERMISSIONS.EXPENSES_MANAGE]: 'INDIVIDUAL',
    [PERMISSIONS.REPAIRS_MANAGE]: 'INDIVIDUAL',
    [PERMISSIONS.SETTINGS_VIEW]: 'INDIVIDUAL',
    [PERMISSIONS.USERS_VIEW]: 'INDIVIDUAL',
  },

  ACCOUNTANT: {
    [PERMISSIONS.ORG_VIEW]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_EDIT]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_SETTINGS_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_BILLING_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.SHOPS_VIEW_ALL]: 'ADMIN_ONLY',
    [PERMISSIONS.SHOPS_MANAGE]: 'ADMIN_ONLY',
    // REJECT:
    [PERMISSIONS.PRODUCTS_MANAGE]: 'REJECT',
    [PERMISSIONS.INVENTORY_EDIT]: 'REJECT',
    [PERMISSIONS.SALES_MANAGE]: 'REJECT',
    [PERMISSIONS.REPORTS_VIEW_ALL]: 'REJECT',
    [PERMISSIONS.REPAIRS_VIEW]: 'REJECT',
    [PERMISSIONS.REPAIRS_MANAGE]: 'REJECT',
    [PERMISSIONS.SETTINGS_VIEW]: 'REJECT',
    [PERMISSIONS.SETTINGS_MANAGE]: 'REJECT',
    [PERMISSIONS.USERS_VIEW]: 'REJECT',
    [PERMISSIONS.USERS_MANAGE]: 'REJECT',
    // Default / SELECT:
    [PERMISSIONS.PRODUCTS_VIEW]: 'SELECT',
    [PERMISSIONS.INVENTORY_VIEW]: 'SELECT',
    [PERMISSIONS.SALES_VIEW]: 'SELECT',
    [PERMISSIONS.PURCHASES_VIEW]: 'SELECT',
    [PERMISSIONS.PARTIES_VIEW]: 'SELECT',
    [PERMISSIONS.EXPENSES_VIEW]: 'SELECT',
    // INDIVIDUAL:
    [PERMISSIONS.POS_USE]: 'INDIVIDUAL',
    [PERMISSIONS.POS_VOID_SALE]: 'INDIVIDUAL',
    [PERMISSIONS.POS_APPLY_DISCOUNT]: 'INDIVIDUAL',
    [PERMISSIONS.PURCHASES_MANAGE]: 'INDIVIDUAL',
    [PERMISSIONS.PARTIES_MANAGE]: 'INDIVIDUAL',
    [PERMISSIONS.FINANCE_VIEW]: 'INDIVIDUAL',
    [PERMISSIONS.FINANCE_MANAGE]: 'INDIVIDUAL',
    [PERMISSIONS.EXPENSES_MANAGE]: 'INDIVIDUAL',
    [PERMISSIONS.REPORTS_VIEW]: 'INDIVIDUAL',
  },

  CASHIER: {
    [PERMISSIONS.ORG_VIEW]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_EDIT]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_SETTINGS_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_BILLING_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.SHOPS_VIEW_ALL]: 'ADMIN_ONLY',
    [PERMISSIONS.SHOPS_MANAGE]: 'ADMIN_ONLY',
    // SELECT:
    [PERMISSIONS.POS_USE]: 'SELECT',
    [PERMISSIONS.PRODUCTS_VIEW]: 'SELECT',
    [PERMISSIONS.SALES_VIEW]: 'SELECT',
    [PERMISSIONS.PARTIES_VIEW]: 'SELECT',
    // INDIVIDUAL:
    [PERMISSIONS.POS_VOID_SALE]: 'INDIVIDUAL',
    [PERMISSIONS.POS_APPLY_DISCOUNT]: 'INDIVIDUAL',
    // REJECT:
    [PERMISSIONS.PRODUCTS_MANAGE]: 'REJECT',
    [PERMISSIONS.INVENTORY_VIEW]: 'REJECT',
    [PERMISSIONS.INVENTORY_EDIT]: 'REJECT',
    [PERMISSIONS.SALES_MANAGE]: 'REJECT',
    [PERMISSIONS.PURCHASES_VIEW]: 'REJECT',
    [PERMISSIONS.PURCHASES_MANAGE]: 'REJECT',
    [PERMISSIONS.PARTIES_MANAGE]: 'REJECT',
    [PERMISSIONS.FINANCE_VIEW]: 'REJECT',
    [PERMISSIONS.FINANCE_MANAGE]: 'REJECT',
    [PERMISSIONS.EXPENSES_VIEW]: 'REJECT',
    [PERMISSIONS.EXPENSES_MANAGE]: 'REJECT',
    [PERMISSIONS.REPORTS_VIEW]: 'REJECT',
    [PERMISSIONS.REPORTS_VIEW_ALL]: 'REJECT',
    [PERMISSIONS.REPAIRS_VIEW]: 'REJECT',
    [PERMISSIONS.REPAIRS_MANAGE]: 'REJECT',
    [PERMISSIONS.SETTINGS_VIEW]: 'REJECT',
    [PERMISSIONS.SETTINGS_MANAGE]: 'REJECT',
    [PERMISSIONS.USERS_VIEW]: 'REJECT',
    [PERMISSIONS.USERS_MANAGE]: 'REJECT',
  },

  SALESMAN: {
    [PERMISSIONS.ORG_VIEW]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_EDIT]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_SETTINGS_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_BILLING_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.SHOPS_VIEW_ALL]: 'ADMIN_ONLY',
    [PERMISSIONS.SHOPS_MANAGE]: 'ADMIN_ONLY',
    // SELECT:
    [PERMISSIONS.POS_USE]: 'SELECT',
    [PERMISSIONS.PRODUCTS_VIEW]: 'SELECT',
    [PERMISSIONS.SALES_VIEW]: 'SELECT',
    [PERMISSIONS.PARTIES_VIEW]: 'SELECT',
    // INDIVIDUAL:
    [PERMISSIONS.POS_VOID_SALE]: 'INDIVIDUAL',
    [PERMISSIONS.POS_APPLY_DISCOUNT]: 'INDIVIDUAL',
    // REJECT:
    [PERMISSIONS.PRODUCTS_MANAGE]: 'REJECT',
    [PERMISSIONS.INVENTORY_VIEW]: 'REJECT',
    [PERMISSIONS.INVENTORY_EDIT]: 'REJECT',
    [PERMISSIONS.SALES_MANAGE]: 'REJECT',
    [PERMISSIONS.PURCHASES_VIEW]: 'REJECT',
    [PERMISSIONS.PURCHASES_MANAGE]: 'REJECT',
    [PERMISSIONS.PARTIES_MANAGE]: 'REJECT',
    [PERMISSIONS.FINANCE_VIEW]: 'REJECT',
    [PERMISSIONS.FINANCE_MANAGE]: 'REJECT',
    [PERMISSIONS.EXPENSES_VIEW]: 'REJECT',
    [PERMISSIONS.EXPENSES_MANAGE]: 'REJECT',
    [PERMISSIONS.REPORTS_VIEW]: 'REJECT',
    [PERMISSIONS.REPORTS_VIEW_ALL]: 'REJECT',
    [PERMISSIONS.REPAIRS_VIEW]: 'REJECT',
    [PERMISSIONS.REPAIRS_MANAGE]: 'REJECT',
    [PERMISSIONS.SETTINGS_VIEW]: 'REJECT',
    [PERMISSIONS.SETTINGS_MANAGE]: 'REJECT',
    [PERMISSIONS.USERS_VIEW]: 'REJECT',
    [PERMISSIONS.USERS_MANAGE]: 'REJECT',
  },

  REPAIR_MECHANIC: {
    [PERMISSIONS.ORG_VIEW]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_EDIT]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_SETTINGS_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_BILLING_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.SHOPS_VIEW_ALL]: 'ADMIN_ONLY',
    [PERMISSIONS.SHOPS_MANAGE]: 'ADMIN_ONLY',
    // SELECT:
    [PERMISSIONS.REPAIRS_VIEW]: 'SELECT',
    [PERMISSIONS.REPAIRS_MANAGE]: 'SELECT',
    [PERMISSIONS.PARTIES_VIEW]: 'SELECT',
    [PERMISSIONS.PRODUCTS_VIEW]: 'SELECT',
    // INDIVIDUAL:
    [PERMISSIONS.POS_USE]: 'INDIVIDUAL',
    [PERMISSIONS.INVENTORY_VIEW]: 'INDIVIDUAL',
    // REJECT:
    [PERMISSIONS.PRODUCTS_MANAGE]: 'REJECT',
    [PERMISSIONS.INVENTORY_EDIT]: 'REJECT',
    [PERMISSIONS.SALES_VIEW]: 'REJECT',
    [PERMISSIONS.SALES_MANAGE]: 'REJECT',
    [PERMISSIONS.POS_VOID_SALE]: 'REJECT',
    [PERMISSIONS.POS_APPLY_DISCOUNT]: 'REJECT',
    [PERMISSIONS.PURCHASES_VIEW]: 'REJECT',
    [PERMISSIONS.PURCHASES_MANAGE]: 'REJECT',
    [PERMISSIONS.PARTIES_MANAGE]: 'REJECT',
    [PERMISSIONS.FINANCE_VIEW]: 'REJECT',
    [PERMISSIONS.FINANCE_MANAGE]: 'REJECT',
    [PERMISSIONS.EXPENSES_VIEW]: 'REJECT',
    [PERMISSIONS.EXPENSES_MANAGE]: 'REJECT',
    [PERMISSIONS.REPORTS_VIEW]: 'REJECT',
    [PERMISSIONS.REPORTS_VIEW_ALL]: 'REJECT',
    [PERMISSIONS.SETTINGS_VIEW]: 'REJECT',
    [PERMISSIONS.SETTINGS_MANAGE]: 'REJECT',
    [PERMISSIONS.USERS_VIEW]: 'REJECT',
    [PERMISSIONS.USERS_MANAGE]: 'REJECT',
  },

  STAFF: {
    [PERMISSIONS.ORG_VIEW]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_EDIT]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_SETTINGS_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.ORG_BILLING_MANAGE]: 'ADMIN_ONLY',
    [PERMISSIONS.SHOPS_VIEW_ALL]: 'ADMIN_ONLY',
    [PERMISSIONS.SHOPS_MANAGE]: 'ADMIN_ONLY',
    // SELECT:
    [PERMISSIONS.POS_USE]: 'SELECT',
    [PERMISSIONS.PRODUCTS_VIEW]: 'SELECT',
    [PERMISSIONS.INVENTORY_VIEW]: 'SELECT',
    // INDIVIDUAL:
    [PERMISSIONS.POS_APPLY_DISCOUNT]: 'INDIVIDUAL',
    // REJECT:
    [PERMISSIONS.PRODUCTS_MANAGE]: 'REJECT',
    [PERMISSIONS.INVENTORY_EDIT]: 'REJECT',
    [PERMISSIONS.SALES_VIEW]: 'REJECT',
    [PERMISSIONS.SALES_MANAGE]: 'REJECT',
    [PERMISSIONS.POS_VOID_SALE]: 'REJECT',
    [PERMISSIONS.PURCHASES_VIEW]: 'REJECT',
    [PERMISSIONS.PURCHASES_MANAGE]: 'REJECT',
    [PERMISSIONS.PARTIES_VIEW]: 'REJECT',
    [PERMISSIONS.PARTIES_MANAGE]: 'REJECT',
    [PERMISSIONS.FINANCE_VIEW]: 'REJECT',
    [PERMISSIONS.FINANCE_MANAGE]: 'REJECT',
    [PERMISSIONS.EXPENSES_VIEW]: 'REJECT',
    [PERMISSIONS.EXPENSES_MANAGE]: 'REJECT',
    [PERMISSIONS.REPORTS_VIEW]: 'REJECT',
    [PERMISSIONS.REPORTS_VIEW_ALL]: 'REJECT',
    [PERMISSIONS.REPAIRS_VIEW]: 'REJECT',
    [PERMISSIONS.REPAIRS_MANAGE]: 'REJECT',
    [PERMISSIONS.SETTINGS_VIEW]: 'REJECT',
    [PERMISSIONS.SETTINGS_MANAGE]: 'REJECT',
    [PERMISSIONS.USERS_VIEW]: 'REJECT',
    [PERMISSIONS.USERS_MANAGE]: 'REJECT',
  },
};

// ─── DERIVED DEFAULT ROLE PERMISSIONS (Single Source of Truth from SELECT) ──
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = Object.fromEntries(
  Object.entries(ROLE_PERMISSION_DECISIONS).map(([role, decisions]) => [
    role,
    Object.entries(decisions)
      .filter(([_, decision]) => decision === 'SELECT')
      .map(([perm]) => perm),
  ])
);
