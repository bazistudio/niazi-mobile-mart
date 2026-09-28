// Parties API adapter (Phase 1.1).
//
// Previously a stub that returned fake data and stored nothing. It now delegates to the
// Party service (permissions, rules) → typed Tauri bridge → local SQLite + sync outbox.
// The response envelopes are kept so existing screens (PartiesTab, PartyFormDrawer,
// PartyProfile, LedgerDashboard) work unchanged.

import { partyService } from '@/features/parties/services/partyService.instance';
import type { PartyFormInput, PartyView } from '@/features/parties/domain/party.domain';

export type { PartyView };

export const partyApi = {
  getParties: async (page = 1, limit = 100): Promise<{
    success: boolean;
    data: PartyView[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(1000, Math.max(1, Math.floor(limit)));
    const data = await partyService.list({ limit: safeLimit, offset: (safePage - 1) * safeLimit });
    // The local list query does not return a total count; report what is known.
    const total = (safePage - 1) * safeLimit + data.length;
    return {
      success: true,
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: data.length === safeLimit ? safePage + 1 : safePage,
      },
    };
  },

  addParty: async (partyData: PartyFormInput): Promise<{ success: boolean; data: PartyView; message: string }> => {
    const data = await partyService.create(partyData);
    return { success: true, data, message: 'Party added' };
  },

  updateParty: async (
    id: string,
    partyData: PartyFormInput,
  ): Promise<{ success: boolean; data: PartyView; message: string }> => {
    const data = await partyService.update(id, partyData);
    return { success: true, data, message: 'Party updated' };
  },

  /** Parties are never deleted (roles carry financial history); this deactivates. */
  deleteParty: async (id: string): Promise<{ success: boolean; message: string }> => {
    await partyService.setActive(id, false);
    return { success: true, message: 'Party deactivated' };
  },

  getPartyDetail: async (id: string): Promise<{ success: boolean; data: PartyView }> => {
    const data = await partyService.get(id);
    return { success: true, data };
  },

  /**
   * Party profile data. The unified party ledger is not built yet (payments & ledger phase):
   * `ledger` is empty and balances come from the existing customer/supplier ledgers.
   */
  getPartyLedger: async (id: string): Promise<{
    success: boolean;
    data: {
      party: PartyView;
      ledger: any[];
      currentBalance: number;
      receivable: number;
      payable: number;
    };
  }> => {
    const party = await partyService.get(id);
    return {
      success: true,
      data: {
        party,
        ledger: [],
        currentBalance: party.currentBalance,
        receivable: party.receivable,
        payable: party.payable,
      },
    };
  },
};
