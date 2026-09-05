import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ledgerApi } from '@/services/ledger.api';
import { useTenantQueryKeys } from '@/lib/react-query/useTenantQueryKeys';

export type PartyType = 'CUSTOMER' | 'SUPPLIER';

export interface SelectedParty {
  id: string;
  type: PartyType;
  name: string;
  balance: number;
  creditLimit?: number;
}

export type LedgerBookTab = 'all' | 'invoices' | 'payments' | 'adjustments';

export function useLedger(initialParty?: SelectedParty | null) {
  const [selectedParty, setSelectedParty] = useState<SelectedParty | null>(initialParty || null);
  const [activeTab, setActiveTab] = useState<LedgerBookTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const keys = useTenantQueryKeys();

  // Sync state with incoming props
  React.useEffect(() => {
    if (initialParty) {
      setSelectedParty(initialParty);
    }
  }, [initialParty?.id, initialParty?.balance, initialParty?.name]);

  // Fetch Ledger data for selected party
  const { data: ledgerResponse, isLoading: isLedgerLoading, refetch: refetchLedger } = useQuery({
    queryKey: keys.ledger(selectedParty?.type, selectedParty?.id),
    queryFn: () => ledgerApi.getPartyLedger(selectedParty!.id, selectedParty!.type),
    enabled: !!selectedParty,
  });

  const timeline = ledgerResponse?.data?.timeline || [];
  const openInvoices = ledgerResponse?.data?.openInvoices || [];
  const allocations = ledgerResponse?.data?.allocations || [];

  const filteredTimeline = useMemo(() => {
    let filtered = timeline;

    if (activeTab === 'invoices') {
      filtered = filtered.filter(t => t.type === 'invoice' || t.type === 'supplier_invoice' || t.type === 'sale');
    } else if (activeTab === 'payments') {
      filtered = filtered.filter(t => t.type === 'payment');
    }

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.transactionId.toLowerCase().includes(lowerQuery) || 
        t.description?.toLowerCase().includes(lowerQuery)
      );
    }

    return filtered;
  }, [timeline, activeTab, searchQuery]);

  return {
    selectedParty,
    setSelectedParty,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    timeline: filteredTimeline,
    rawTimeline: timeline,
    openInvoices,
    allocations,
    isLedgerLoading,
    refetchLedger
  };
}
