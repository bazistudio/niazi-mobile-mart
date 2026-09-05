/**
 * Central Permission Registry for TijaratPro
 *
 * This file defines all granular permissions available within the organization and shop contexts.
 * It serves as the single source of truth for permission keys, modules, and actions.
 *
 * Architecture:
 * - Permission collection (DB) = global permission library (seeded from PERMISSION_REGISTRY)
 * - RolePermission collection (DB) = primary role-permission relationship
 * - Role.permissions[] = synchronized cache for fast permission resolution
 *
 * Backward Compatibility:
 * - Existing PERMISSIONS, PRESET_ROLES, DEFAULT_ROLE_PERMISSIONS are preserved
 * - Old RoleMatrix system is untouched
 */

// =========================================================
// SECTION 1: NEW GRANULAR PERMISSION SYSTEM (Phase 1+)
// =========================================================

/**
 * All permission modules supported by the system.
 * Future modules can be added here.
 */
const MODULES = [
  'dashboard',
  'pos',
  'products',
  'inventory',
  'customers',
  'suppliers',
  'repairs',
  'ledger',
  'reports',
  'settings',
  'backup',
];

/**
 * All permission actions supported by the system.
 * Future actions can be added here.
 */
const ACTIONS = [
  'view',
  'create',
  'update',
  'delete',
  'export',
  'approve',
];

/**
 * Defines which actions are applicable to each module.
 * Not all modules support all actions (e.g., dashboard only has 'view').
 */
const MODULE_ACTIONS = {
  dashboard: ['view'],
  pos: ['view', 'create', 'update', 'delete', 'approve'],
  products: ['view', 'create', 'update', 'delete', 'export'],
  inventory: ['view', 'create', 'update', 'delete', 'export'],
  customers: ['view', 'create', 'update', 'delete', 'export'],
  suppliers: ['view', 'create', 'update', 'delete', 'export'],
  repairs: ['view', 'create', 'update', 'delete', 'export'],
  ledger: ['view', 'create', 'update', 'delete', 'export', 'approve'],
  reports: ['view', 'export'],
  settings: ['view', 'update'],
  backup: ['view', 'create', 'delete'],
};

/**
 * Generates the full permission registry from MODULE_ACTIONS.
 * Each entry has: { key, module, action, description }
 *
 * Example: { key: 'products.create', module: 'products', action: 'create', description: 'Create access to products' }
 */
const PERMISSION_REGISTRY = [];
for (const [module, actions] of Object.entries(MODULE_ACTIONS)) {
  for (const action of actions) {
    PERMISSION_REGISTRY.push({
      key: `${module}.${action}`,
      module,
      action,
      description: `${action.charAt(0).toUpperCase() + action.slice(1)} access to ${module}`,
    });
  }
}

/**
 * Default role templates for Single Shop accounts.
 * Each organization receives its own role copies from these templates.
 * System roles cannot be deleted later.
 *
 * NOTE: These are definitions only — not DB documents.
 * They are materialized per-organization by roleService when needed.
 */
const DEFAULT_ROLE_TEMPLATES = [
  {
    name: 'Shop Owner',
    description: 'Full system access with all permissions',
    isSystem: true,
    permissions: PERMISSION_REGISTRY.map((p) => p.key), // All permissions
  },
  {
    name: 'Manager',
    description: 'Shop manager with broad operational access',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'pos.view', 'pos.create', 'pos.update', 'pos.approve',
      'products.view', 'products.create', 'products.update',
      'inventory.view', 'inventory.create', 'inventory.update',
      'customers.view', 'customers.create', 'customers.update',
      'suppliers.view', 'suppliers.create', 'suppliers.update',
      'repairs.view', 'repairs.create', 'repairs.update',
      'ledger.view', 'ledger.create', 'ledger.update',
      'reports.view', 'reports.export',
      'settings.view',
    ],
  },
  {
    name: 'Cashier',
    description: 'POS and sales focused role',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'pos.view', 'pos.create', 'pos.update',
      'products.view',
      'customers.view', 'customers.create',
      'reports.view',
    ],
  },
  {
    name: 'Sales Man',
    description: 'Sales and customer management role',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'pos.view', 'pos.create',
      'products.view',
      'customers.view', 'customers.create', 'customers.update',
      'reports.view',
    ],
  },
  {
    name: 'Repair Technician',
    description: 'Repair job management role',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'repairs.view', 'repairs.create', 'repairs.update',
      'products.view',
      'customers.view',
    ],
  },
  {
    name: 'Accountant',
    description: 'Finance and ledger management role',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'ledger.view', 'ledger.create', 'ledger.update', 'ledger.approve',
      'reports.view', 'reports.export',
    ],
  },
];

// =========================================================
// SECTION 2: LEGACY PERMISSION SYSTEM (Preserved for backward compatibility)
// =========================================================

const PERMISSIONS = {
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
};

// Preset Roles (for UI convenience and defaults)
const PRESET_ROLES = {
  OWNER: 'OWNER', // Automatically gets all permissions
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  STAFF: 'STAFF',
};

const DEFAULT_ROLE_PERMISSIONS = {
  [PRESET_ROLES.OWNER]: Object.values(PERMISSIONS),
  [PRESET_ROLES.ADMIN]: [
    PERMISSIONS.ORG_VIEW,
    PERMISSIONS.SHOPS_VIEW_ALL,
    PERMISSIONS.SHOPS_MANAGE,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_MANAGE,
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
    PERMISSIONS.REPORTS_VIEW_ALL,
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.SETTINGS_MANAGE,
  ],
  [PRESET_ROLES.MANAGER]: [
    PERMISSIONS.USERS_VIEW,
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
    PERMISSIONS.EXPENSES_VIEW,
    PERMISSIONS.EXPENSES_MANAGE,
    PERMISSIONS.REPORTS_VIEW,
  ],
  [PRESET_ROLES.CASHIER]: [
    PERMISSIONS.POS_USE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PARTIES_VIEW,
  ],
  [PRESET_ROLES.STAFF]: [
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
  ],
};

// =========================================================
// SECTION 3: EXPORTS
// =========================================================

module.exports = {
  // New granular permission system
  MODULES,
  ACTIONS,
  MODULE_ACTIONS,
  PERMISSION_REGISTRY,
  DEFAULT_ROLE_TEMPLATES,

  // Legacy permission system (preserved for backward compatibility)
  PERMISSIONS,
  PRESET_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
};