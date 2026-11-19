/**
 * Business Accounts API — Phase 1 (org-admin only)
 * Uses httpClient which routes through httpFetch → bearer JWT → backend.
 */

import { httpClient } from '@/lib/http/httpClient';

export type AccountType = 'JAZZCASH' | 'EASYPAISA' | 'BANK';
export type LedgerDirection = 'IN' | 'OUT';

export interface BusinessAccount {
  id: string;
  organization_id: string;
  branch_id: string | null;
  name: string;
  account_type: AccountType;
  account_holder_name: string;
  account_number: string;
  account_number_masked: string;
  iban: string | null;
  bank_name: string | null;
  opening_balance: number;
  currency: string;
  is_active: boolean;
  current_balance: number;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntry {
  id: string;
  account_id: string;
  entry_type: string;
  direction: LedgerDirection;
  amount: number;
  balance_after: number;
  reference_type: string | null;
  reference_number: string | null;
  description: string | null;
  created_at: string;
}

export interface AccountStatement {
  account: BusinessAccount;
  entries: LedgerEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateAccountPayload {
  name: string;
  account_type: AccountType;
  account_holder_name: string;
  account_number: string;
  iban?: string | null;
  bank_name?: string | null;
  opening_balance: number;
  opening_balance_note?: string | null;
}

export const accountsApi = {
  async listAccounts(): Promise<BusinessAccount[]> {
    const data = await httpClient.get<{ accounts: BusinessAccount[] }>('/api/accounts');
    return data.accounts;
  },

  async createAccount(payload: CreateAccountPayload): Promise<BusinessAccount> {
    const data = await httpClient.post<{ account: BusinessAccount }>('/api/accounts', payload);
    return data.account;
  },

  async getStatement(
    accountId: string,
    page = 1,
    pageSize = 20
  ): Promise<AccountStatement> {
    return httpClient.get<AccountStatement>(
      `/api/accounts/${encodeURIComponent(accountId)}/statement?page=${page}&page_size=${pageSize}`
    );
  },
};
