/**
 * Ledger REST API client.
 *
 * Replaces the previous Tauri IPC implementation entirely.
 * All calls go through httpClient → real Express REST endpoints.
 *
 * Endpoints used:
 *   GET  /api/v1/customers/:id/ledger   → CustomerStatementDto
 *   POST /api/v1/customers/:id/payments → CustomerPaymentResult
 *   GET  /api/v1/suppliers/:id/ledger   → SupplierStatementDto
 *   POST /api/v1/suppliers/:id/payments → SupplierPaymentResult
 */

import { httpClient } from '@/lib/http/httpClient';

// ─── Statement DTOs (mirrors backend CustomerStatementDto / SupplierStatementDto) ──

export interface LedgerStatementEntry {
  id: string;
  date: string;
  reference_number: string | null;
  description: string;
  entry_type: string;          // 'SALE' | 'PAYMENT' | 'ADJUSTMENT' | 'PURCHASE' | …
  debit: number;
  credit: number;
  balance: number;
  branch_id?: string | null;
  branch_name?: string | null;
  branch_code?: string | null;
}

export interface CustomerStatementDto {
  customer_id: string;
  customer_name: string;
  customer_code: string;
  phone: string;
  credit_limit: number;
  current_balance: number;
  entries: LedgerStatementEntry[];
}

export interface SupplierStatementDto {
  supplier_id: string;
  supplier_name: string;
  supplier_code: string;
  phone: string;
  credit_limit: number;
  current_balance: number;
  entries: LedgerStatementEntry[];
}

// ─── Legacy adapter types (used by LedgerBook / useLedger hook) ──────────────

export interface LedgerTimelineEntry {
  id: string;
  transactionId: string;
  type: 'payment' | 'invoice' | 'supplier_invoice' | 'sale' | 'opening_balance';
  amount: number;
  runningBalance: number;
  timestamp: number;
  description: string;
  entry_type: string;
  debit: number;
  credit: number;
  debitAccount: string;
  creditAccount: string;
  branch_id?: string | null;
  branch_name?: string | null;
  branch_code?: string | null;
}

export interface PartyLedgerResponse {
  success: boolean;
  message: string;
  data: {
    timeline: LedgerTimelineEntry[];
    allocations: unknown[];
    openInvoices: unknown[];
    statement: CustomerStatementDto | SupplierStatementDto | null;
  };
}

// ─── Opening Balance DTO (mirrors backend SetOpeningBalanceDto / SetOpeningBalanceResult) ─

export type OpeningBalanceDirection = 'debit' | 'credit';

export interface SetOpeningBalancePayload {
  amount: number;                        // positive integer, whole PKR rupees
  direction: OpeningBalanceDirection;    // 'debit' = customer owes shop; 'credit' = shop owes customer
  balance_as_of: string;                 // ISO-8601 YYYY-MM-DD, must not be in the future
  notes: string;                         // required, non-empty explanation
  reference_number?: string | null;      // optional legacy customer code / reference
}

export interface SetOpeningBalanceResult {
  entry_id: string;
  balance_after: number;
  direction: OpeningBalanceDirection;
  amount: number;
  balance_as_of: string;
}

export interface RecordPaymentPayload {
  partyId: string;
  partyType: 'CUSTOMER' | 'SUPPLIER';
  amount: number;
  method: string;
  notes?: string;
  idempotencyKey?: string;
  branchId?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapCustomerEntry(entry: LedgerStatementEntry): LedgerTimelineEntry {
  const isPayment       = entry.entry_type === 'PAYMENT';
  const isOpeningBalance = entry.entry_type === 'OPENING_BALANCE';

  let type: LedgerTimelineEntry['type'];
  let amount: number;
  let debitAccount: string;
  let creditAccount: string;

  if (isOpeningBalance) {
    // Debit opening balance: customer owes shop (debit > 0)
    // Credit opening balance: shop owes customer (credit > 0)
    type          = 'opening_balance';
    amount        = entry.debit || entry.credit;   // exactly one is non-zero
    debitAccount  = entry.debit > 0 ? 'receivable' : 'advance';
    creditAccount = entry.debit > 0 ? 'opening_equity' : 'receivable';
  } else if (isPayment) {
    type          = 'payment';
    amount        = entry.credit;
    debitAccount  = 'cash';
    creditAccount = 'receivable';
  } else {
    type          = 'invoice';
    amount        = entry.debit;
    debitAccount  = 'receivable';
    creditAccount = 'sales';
  }

  return {
    id: entry.id,
    transactionId: entry.reference_number || entry.id,
    type,
    amount,
    runningBalance: entry.balance,
    timestamp: new Date(entry.date).getTime() || Date.now(),
    description: entry.description,
    entry_type: entry.entry_type,
    debit: entry.debit,
    credit: entry.credit,
    debitAccount,
    creditAccount,
    branch_id: entry.branch_id ?? null,
    branch_name: entry.branch_name ?? null,
    branch_code: entry.branch_code ?? null,
  };
}

function mapSupplierEntry(entry: LedgerStatementEntry): LedgerTimelineEntry {
  const isPayment = entry.entry_type === 'PAYMENT';
  return {
    id: entry.id,
    transactionId: entry.reference_number || entry.id,
    type: isPayment ? 'payment' : 'supplier_invoice',
    amount: isPayment ? entry.debit : entry.credit,
    runningBalance: entry.balance,
    timestamp: new Date(entry.date).getTime() || Date.now(),
    description: entry.description,
    entry_type: entry.entry_type,
    debit: entry.debit,
    credit: entry.credit,
    debitAccount: isPayment ? 'payable' : 'purchases',
    creditAccount: isPayment ? 'cash' : 'payable',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const ledgerApi = {
  /**
   * Fetch the full ledger statement for a customer or supplier.
   * Returns a PartyLedgerResponse with timeline + raw statement for summary cards.
   * Optionally filtered by branchId when specified by caller (e.g. Org Admin).
   */
  getPartyLedger: async (
    partyId: string,
    partyType: 'CUSTOMER' | 'SUPPLIER',
    branchId?: string | null
  ): Promise<PartyLedgerResponse> => {
    try {
      const branchParam = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
      if (partyType === 'CUSTOMER') {
        const statement = await httpClient.get<CustomerStatementDto>(
          `/api/v1/customers/${encodeURIComponent(partyId)}/ledger${branchParam}`
        );
        return {
          success: true,
          message: 'Customer ledger loaded',
          data: {
            timeline: (statement.entries || []).map(mapCustomerEntry),
            allocations: [],
            openInvoices: [],
            statement,
          },
        };
      } else {
        const statement = await httpClient.get<SupplierStatementDto>(
          `/api/v1/suppliers/${encodeURIComponent(partyId)}/ledger${branchParam}`
        );
        return {
          success: true,
          message: 'Supplier ledger loaded',
          data: {
            timeline: (statement.entries || []).map(mapSupplierEntry),
            allocations: [],
            openInvoices: [],
            statement,
          },
        };
      }
    } catch (err: unknown) {
      console.error('[ledgerApi.getPartyLedger] Error:', err);
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed to load ledger',
        data: { timeline: [], allocations: [], openInvoices: [], statement: null },
      };
    }
  },

  /** Shorthand helpers */
  getCustomerLedger: (customerId: string, branchId?: string | null) =>
    ledgerApi.getPartyLedger(customerId, 'CUSTOMER', branchId),
  getSupplierLedger: (supplierId: string, branchId?: string | null) =>
    ledgerApi.getPartyLedger(supplierId, 'SUPPLIER', branchId),

  /**
   * Record a customer receivable payment or supplier payable payout.
   * Calls POST /api/v1/customers/:id/payments or POST /api/v1/suppliers/:id/payments.
   */
  recordPayment: async (
    payload: RecordPaymentPayload
  ): Promise<{ success: boolean; data: { paymentId: string; newBalance: number; receiptNumber?: string } }> => {
    const body: Record<string, any> = {
      amount: Math.round(payload.amount),
      payment_method: payload.method?.toUpperCase() || 'CASH',
      notes: payload.notes || null,
      reference_number: payload.idempotencyKey || null,
      branch_id: payload.branchId ?? null,
    };

    if (payload.partyType === 'CUSTOMER') {
      const res = await httpClient.post<{ payment_id: string; reference_number: string; new_balance: number }>(
        `/api/v1/customers/${encodeURIComponent(payload.partyId)}/payments`,
        body
      );
      return {
        success: true,
        data: {
          paymentId: res.payment_id,
          receiptNumber: res.reference_number,
          newBalance: res.new_balance,
        },
      };
    } else {
      const res = await httpClient.post<{ payment_id: string; reference_number: string; new_balance: number }>(
        `/api/v1/suppliers/${encodeURIComponent(payload.partyId)}/payments`,
        body
      );
      return {
        success: true,
        data: {
          paymentId: res.payment_id,
          receiptNumber: res.reference_number,
          newBalance: res.new_balance,
        },
      };
    }
  },

  /** Alias kept for backward compat with supplier payment calls */
  recordPayout: (payload: RecordPaymentPayload) =>
    ledgerApi.recordPayment({ ...payload, partyType: 'SUPPLIER' }),

  /**
   * Set the opening balance for a customer with no prior ledger activity.
   * Organization-admin only.  Calls POST /api/v1/customers/:id/opening-balance.
   * Returns SetOpeningBalanceResult on success; throws on validation/auth/conflict error.
   */
  setCustomerOpeningBalance: async (
    customerId: string,
    payload: SetOpeningBalancePayload
  ): Promise<SetOpeningBalanceResult> => {
    return httpClient.post<SetOpeningBalanceResult>(
      `/api/v1/customers/${encodeURIComponent(customerId)}/opening-balance`,
      {
        amount:           Math.round(payload.amount),
        direction:        payload.direction,
        balance_as_of:    payload.balance_as_of,
        notes:            payload.notes,
        reference_number: payload.reference_number ?? null,
      }
    );
  },
};
