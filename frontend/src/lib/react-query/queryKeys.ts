// src/lib/react-query/queryKeys.ts

export const queryKeys = {
  // --- Shop Level Namespaces ---
  shop: {
    dashboard: (orgId?: string, shopId?: string, userId?: string) =>
      ['shop', 'dashboard', orgId, shopId, userId] as const,
      
    sales: (dateFilter: string, startDate: string, endDate: string, search: string, orgId?: string, shopId?: string, userId?: string) =>
      ['shop', 'sales', dateFilter, startDate, endDate, search, orgId, shopId, userId] as const,

    customers: (orgId?: string, shopId?: string, userId?: string) =>
      ['shop', 'customers', orgId, shopId, userId] as const,

    customer: (id: string, orgId?: string, shopId?: string, userId?: string) =>
      ['shop', 'customer', id, orgId, shopId, userId] as const,

    customerSearch: (term: string, orgId?: string, shopId?: string, userId?: string) =>
      ['shop', 'customers', 'search', term, orgId, shopId, userId] as const,

    suppliers: (orgId?: string, shopId?: string, userId?: string) =>
      ['shop', 'suppliers', orgId, shopId, userId] as const,

    ledger: (partyType?: string, partyId?: string, orgId?: string, shopId?: string, userId?: string) =>
      ['shop', 'ledger', partyType, partyId, orgId, shopId, userId] as const,

    orders: (orgId?: string, shopId?: string, userId?: string) =>
      ['shop', 'orders', orgId, shopId, userId] as const,

    products: (orgId?: string, shopId?: string, userId?: string) =>
      ['shop', 'products', orgId, shopId, userId] as const,

    stockAlerts: (orgId?: string, shopId?: string, userId?: string) =>
      ['shop', 'stock-alerts', orgId, shopId, userId] as const,
  },
  
  // --- Admin Level Namespaces ---
  admin: {
    dashboardStats: () => ['admin', 'dashboard-stats'] as const,
    activeTenants: () => ['admin', 'active-tenants'] as const,
    pendingTenants: () => ['admin', 'pending-tenants'] as const,
    suspendedTenants: () => ['admin', 'suspended-tenants'] as const,
    pendingUsers: () => ['admin', 'pending-users'] as const,
    pendingOrgAdmins: () => ['admin', 'pending-org-admins'] as const,
    tenantDetail: (tenantId: string) => ['admin', 'tenant', tenantId] as const,
  }
};
