// src/lib/react-query/queryKeys.ts
//
// Niazi Mobile Mart - Domain Query Keys
// Pure, deterministic query keys for offline-first desktop ERP.
// Zero dynamic tenant/shop/user injection.

export const queryKeys = {
  organization: {
    dashboard: ['organization', 'dashboard'] as const,
  },
  branches: {
    all: ['branches'] as const,
    detail: (id: string) => ['branches', id] as const,
  },
  categories: {
    all: ['categories'] as const,
  },
  brands: {
    all: ['brands'] as const,
  },
  products: {
    all: ['products'] as const,
    detail: (id: string) => ['products', id] as const,
  },
  inventory: {
    all: ['inventory'] as const,
    stockAlerts: ['inventory', 'stock-alerts'] as const,
  },
  dashboard: ['dashboard'] as const,
  sales: (dateFilter?: string, startDate?: string, endDate?: string, search?: string) =>
    ['sales', dateFilter, startDate, endDate, search] as const,
  customers: {
    all: ['customers'] as const,
    detail: (id: string) => ['customers', id] as const,
    search: (term: string) => ['customers', 'search', term] as const,
  },
  suppliers: {
    all: ['suppliers'] as const,
    detail: (id: string) => ['suppliers', id] as const,
  },
  ledger: (partyType?: string, partyId?: string) =>
    ['ledger', partyType, partyId] as const,
  orders: ['orders'] as const,
  ordersToday: ['orders', 'today'] as const,
};
