// src/lib/react-query/invalidate.ts

import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { AuthUser } from '@/types/auth/auth';

/**
 * Shared helpers to centrally invalidate query namespaces.
 * Accepts user to properly identify which tenant's cache to invalidate.
 */
export const invalidateQueries = {
  customers: (queryClient: QueryClient, user: AuthUser | null) => {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.shop.customers(user?.organizationId, user?.shopId, user?.id)
    });
  },
  
  suppliers: (queryClient: QueryClient, user: AuthUser | null) => {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.shop.suppliers(user?.organizationId, user?.shopId, user?.id)
    });
  },
  
  ledger: (queryClient: QueryClient, user: AuthUser | null, partyType?: string, partyId?: string) => {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.shop.ledger(partyType, partyId, user?.organizationId, user?.shopId, user?.id)
    });
  },
  
  // A broader invalidation that hits all ledger entries for a specific party
  ledgerGeneric: (queryClient: QueryClient, user: AuthUser | null) => {
    // Only pass the namespace up to 'ledger' to invalidate anything inside it
    return queryClient.invalidateQueries({
      queryKey: ['shop', 'ledger', undefined, undefined, user?.organizationId, user?.shopId, user?.id].filter(Boolean)
    });
  }
};
