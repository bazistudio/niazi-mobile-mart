export const VALID_ROUTES = [
  // Dashboard Home
  '/dashboard/shop-admin',
  
  // Sales
  '/dashboard/shop-admin/pos',
  '/dashboard/shop-admin/sales',
  
  // Inventory & Products
  '/dashboard/shop-admin/products',
  '/dashboard/shop-admin/products/new',
  '/dashboard/shop-admin/import',
  '/dashboard/shop-admin/stock',
  
  // People
  '/dashboard/shop-admin/customers',
  '/dashboard/shop-admin/suppliers',
  
  // Operations
  '/dashboard/shop-admin/repairs',
  '/dashboard/shop-admin/expenses',
  
  // Reports
  '/dashboard/shop-admin/history',
  
  // Settings & Profile
  '/dashboard/shop-admin/settings',
  '/dashboard/shop-admin/profile',

  // Operations & Kitchen
  '/dashboard/shop-admin/kds',

  // Marketing
  '/dashboard/shop-admin/marketing',

  // Dev-only
  '/dashboard/shop-admin/audit',

  // Organization
  '/dashboard/organization',
] as const;

export type ValidRoute = typeof VALID_ROUTES[number];

/**
 * Registry checker to see if a route is officially registered
 */
export const isRouteRegistered = (href: string): boolean => {
  // exact match
  if (VALID_ROUTES.includes(href as ValidRoute)) return true;
  
  // dynamic routes or sub-routes can be checked here if needed
  return VALID_ROUTES.some(route => href.startsWith(route));
};
