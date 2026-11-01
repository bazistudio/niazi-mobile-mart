/**
 * NIAZI MOBILE MART — SHARED PAYMENT DOMAIN ENGINE
 * Module: payment.types.ts
 *
 * Pure, framework-agnostic types for payment validation, allocation,
 * customer advance management, credit limit control, integer safety,
 * source-attributed multi-component refund allocations, and tender-line conservation.
 * Independent of Express, PostgreSQL, React, or Tauri.
 */

export type CanonicalPaymentMethod =
  | 'CASH'
  | 'CARD'
  | 'BANK_TRANSFER'
  | 'EASYPAISA'
  | 'JAZZCASH'
  | 'OTHER';

export const CANONICAL_PAYMENT_METHODS: readonly CanonicalPaymentMethod[] = [
  'CASH',
  'CARD',
  'BANK_TRANSFER',
  'EASYPAISA',
  'JAZZCASH',
  'OTHER',
] as const;

export interface TenderInputLine {
  method: CanonicalPaymentMethod;
  amount: number; // Integer minor unit: whole PKR
  referenceNumber?: string | null;
  notes?: string | null;
}

export interface PaymentAllocationRequest {
  invoiceTotal: number;
  tenders: readonly TenderInputLine[];
  customerId: string | null;
  previousCustomerBalance: number; // Positive = customer owes money (debit); Negative = customer holds advance credit
  customerCreditLimit?: number | null; // 0 = no credit allowed; >0 = credit limit; null/undefined treated as 0
}

export interface PaymentAllocationResult {
  // 1. Authoritative Accounting Summary
  readonly invoiceTotal: number;
  readonly existingAdvanceApplied: number;

  // 2. Tender Inflow Breakdowns
  readonly cashTenderReceived: number;
  readonly nonCashTenderReceived: number;
  readonly actualTenderReceived: number;

  // 3. Allocations
  readonly tenderAppliedToInvoice: number;
  readonly invoiceAllocated: number; // existingAdvanceApplied + tenderAppliedToInvoice

  // 4. Overpayment / Settlement
  readonly previousBalanceSettled: number;
  readonly customerAdvanceCreated: number;

  // 5. Outflow & Balances
  readonly changeReturned: number;
  readonly creditAllocated: number; // Unpaid invoice due
  readonly projectedCustomerBalance: number; // previousCustomerBalance + invoiceTotal - actualTenderReceived
  readonly projectedOutstanding: number; // max(0, projectedCustomerBalance)
  readonly remainingAdvanceBalance: number; // max(0, -projectedCustomerBalance)

  // 6. Enums & Drawer
  readonly paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
  readonly cashToDrawer: number; // cashTenderReceived - changeReturned

  // 7. Persisted Tender Records (Genuine new tender lines only; never fakes customer advance as tender)
  readonly persistedTenders: readonly {
    readonly method: CanonicalPaymentMethod;
    readonly amount: number;
    readonly referenceNumber: string | null;
    readonly notes: string | null;
  }[];
}

/**
 * Breakdown of original tenders by line on the sale being refunded.
 * Line order reflects the exact chronological receipt order of tender payments.
 */
export interface OriginalTenderLine {
  id?: string; // Stable tender line identity; defaults deterministically to line index if omitted
  method: CanonicalPaymentMethod;
  amount: number;
}

/**
 * Prior cumulative refunds recorded on this invoice across each component and tender source.
 */
export interface PriorRefundComponents {
  unpaidCreditCancelled?: number;
  advanceRestored?: number;
  cashRefunded?: number;
  digitalRefundedByMethod?: Partial<Record<CanonicalPaymentMethod, number>>;
  customerCreditIssued?: number; // Aggregate total credit issued for reconciliation

  // Source-level prior allocations (by tender line id or method)
  directRefundByLine?: Record<string, number>;
  customerCreditByLine?: Record<string, number>;
}

/**
 * Explicit requested refund payout components.
 * Supports a single refund consisting of multiple independently allocated components.
 */
export interface RequestedRefundPayout {
  cashAmount?: number;
  digitalPayouts?: Partial<Record<CanonicalPaymentMethod, number>>;
  customerCreditAmount?: number;
}

export interface RefundAllocationRequest {
  refundAmount: number; // Total requested return merchandise value to refund
  originalInvoiceTotal: number;
  originalTenders: readonly OriginalTenderLine[];
  originalAdvanceApplied: number;
  originalCreditAllocated: number; // Unpaid invoice debt from original sale
  priorRefunds?: PriorRefundComponents;
  requestedPayout?: RequestedRefundPayout;
}

/**
 * Result of source-level refund allocation for a specific tender line.
 */
export interface TenderLineRefundAllocation {
  readonly lineId: string;
  readonly method: CanonicalPaymentMethod;
  readonly originalAmount: number;
  readonly priorDirectRefunded: number;
  readonly priorCreditFunded: number;
  readonly currentDirectRefunded: number;
  readonly currentCreditFunded: number;
  readonly remainingEligibleAmount: number;
}

export interface RefundAllocationResult {
  readonly requestedRefundAmount: number;

  // Independent Allocation Components
  readonly unpaidInvoiceCreditCancelled: number;
  readonly existingAdvanceRestored: number;
  readonly cashRefunded: number;
  readonly digitalRefundedByMethod: Readonly<Partial<Record<CanonicalPaymentMethod, number>>>;
  readonly customerCreditIssued: number;

  // Source-level tender line allocations (FIFO order)
  readonly tenderLineAllocations: readonly TenderLineRefundAllocation[];

  // Total Verification
  readonly totalRefundAllocated: number;
  readonly remainingEligibleInvoiceBalance: number;
}
