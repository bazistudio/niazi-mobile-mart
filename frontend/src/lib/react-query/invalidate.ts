// src/lib/react-query/invalidate.ts
//
// Shared helpers to centrally invalidate query namespaces.

import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

export const invalidateQueries = {
  customers: (queryClient: QueryClient, _user?: any) => {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.customers.all,
    });
  },

  suppliers: (queryClient: QueryClient, _user?: any) => {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.suppliers.all,
    });
  },

  ledger: (queryClient: QueryClient, _user?: any, partyType?: string, partyId?: string) => {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.ledger(partyType, partyId),
    });
  },

  ledgerGeneric: (queryClient: QueryClient, _user?: any) => {
    return queryClient.invalidateQueries({
      queryKey: ['ledger'],
    });
  },
};
