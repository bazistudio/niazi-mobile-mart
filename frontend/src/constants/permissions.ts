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
} as const;

export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const PERMISSION_METADATA: Record<string, { label: string; description?: string }> = {
  [PERMISSIONS.ORG_VIEW]: { label: "View Organization" },
  [PERMISSIONS.ORG_SETTINGS_MANAGE]: { label: "Manage Org Settings" },
  [PERMISSIONS.SHOPS_VIEW_ALL]: { label: "View All Shops" },
  [PERMISSIONS.SHOPS_MANAGE]: { label: "Manage Shops" },
  [PERMISSIONS.POS_USE]: { label: "Use POS System" },
  [PERMISSIONS.INVENTORY_VIEW]: { label: "View Inventory" },
  [PERMISSIONS.INVENTORY_EDIT]: { label: "Edit Inventory" },
  [PERMISSIONS.USERS_VIEW]: { label: "View Users" },
  [PERMISSIONS.USERS_MANAGE]: { label: "Manage Users" },
  // ... can be expanded
};
