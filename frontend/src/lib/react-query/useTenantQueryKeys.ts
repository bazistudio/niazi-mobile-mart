// src/lib/react-query/useTenantQueryKeys.ts

import { useAuthStore } from '../auth/core/auth.store';
import { queryKeys } from './queryKeys';
import { useMemo } from 'react';

/**
 * Hook to automatically inject the current user's tenant context 
 * (organizationId, shopId, userId) into the pure queryKeys factory.
 */
export const useTenantQueryKeys = () => {
  const { user } = useAuthStore();

  const orgId = user?.organizationId;
  const shopId = user?.shopId;
  const userId = user?.id;

  return useMemo(() => {
    return {
      dashboard: queryKeys.shop.dashboard(orgId, shopId, userId),
      sales: (dateFilter: string, startDate: string, endDate: string, search: string) => 
        queryKeys.shop.sales(dateFilter, startDate, endDate, search, orgId, shopId, userId),
      customers: queryKeys.shop.customers(orgId, shopId, userId),
      customer: (id: string) => queryKeys.shop.customer(id, orgId, shopId, userId),
      customerSearch: (term: string) => queryKeys.shop.customerSearch(term, orgId, shopId, userId),
      suppliers: queryKeys.shop.suppliers(orgId, shopId, userId),
      ledger: (partyType?: string, partyId?: string) => queryKeys.shop.ledger(partyType, partyId, orgId, shopId, userId),
      orders: queryKeys.shop.orders(orgId, shopId, userId),
      products: queryKeys.shop.products(orgId, shopId, userId),
      stockAlerts: queryKeys.shop.stockAlerts(orgId, shopId, userId),
    };
  }, [orgId, shopId, userId]);
};
