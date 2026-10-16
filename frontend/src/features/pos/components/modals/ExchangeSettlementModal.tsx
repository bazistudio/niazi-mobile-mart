'use client';

/**
 * ExchangeSettlementModal — GAP-03
 *
 * Shows an explicit exchange settlement summary before the cashier finalises a
 * product-replacement transaction.  The modal is displayed when the POS session
 * is in `replace` mode and the cashier attempts to check out.
 *
 * exchange difference = replacement value − returned value
 *   • Positive  → customer owes the difference (collect extra payment)
 *   • Negative  → customer is owed the difference (issue refund / credit)
 *   • Zero      → balanced exchange, no cash movement needed
 *
 * BACKEND CONSTRAINT (as of 1.3.41):
 * `completeTransaction` in usePosStore is explicitly blocked when
 * `session.returnedItems.length > 0` (EXCHANGE_BLOCKED_MESSAGE).
 * The only supported exchange path is `processInvoiceReturn`, which requires a
 * linked invoice (`session.linkedInvoiceId`).  If no invoice is linked the
 * cashier must first select one via Invoice Lookup.
 *
 * This modal does NOT submit the transaction — it presents the breakdown and
 * hands control back to the parent via `onConfirm`.  The parent is responsible
 * for dispatching the correct store action.
 */

import React, { useMemo } from 'react';
import { ArrowLeftRight, AlertTriangle, CheckCircle2, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExchangeSettlementSummary {
  /** Total value of items the customer is returning */
  returnedValue: number;
  /** Total value of replacement items being taken */
  replacementValue: number;
  /** replacementValue − returnedValue  (positive → customer pays; negative → refund) */
  exchangeDifference: number;
  /** Whether a linked invoice is available (required for backend settlement) */
  hasLinkedInvoice: boolean;
  /** Invoice identifier shown to the cashier for confirmation */
  linkedInvoiceId?: string;
}

export interface ExchangeSettlementModalProps {
  summary: ExchangeSettlementSummary;
  isProcessing?: boolean;
  hasCustomerAccount?: boolean;
  onConfirm: (options?: { refundMethod?: 'CASH' | 'CREDIT' }) => void;
  onCancel: () => void;
  /** Called when the cashier wants to select/change the linked invoice */
  onSelectInvoice: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format integer rupee amounts without floating-point surprises */
function fmt(amount: number): string {
  return Math.abs(Math.round(amount)).toLocaleString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ExchangeSettlementModal: React.FC<ExchangeSettlementModalProps> = ({
  summary,
  isProcessing = false,
  hasCustomerAccount = false,
  onConfirm,
  onCancel,
  onSelectInvoice,
}) => {
  const { returnedValue, replacementValue, exchangeDifference, hasLinkedInvoice, linkedInvoiceId } = summary;

  const isBalanced   = Math.round(exchangeDifference) === 0;
  const customerPays = exchangeDifference > 0;
  const customerOwed = exchangeDifference < 0;

  const [refundMethod, setRefundMethod] = React.useState<'CASH' | 'CREDIT'>('CASH');

  // The confirm button is only active when there is a linked invoice
  const canConfirm = hasLinkedInvoice && !isProcessing;

  const diffLabel = useMemo(() => {
    if (isBalanced)   return 'Balanced Exchange — No payment needed';
    if (customerPays) return `Customer pays Rs ${fmt(exchangeDifference)} extra`;
    return              `Refund Rs ${fmt(exchangeDifference)} to customer`;
  }, [isBalanced, customerPays, exchangeDifference]);

  const diffColour = isBalanced
    ? 'text-emerald-600 dark:text-emerald-400'
    : customerPays
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-rose-600 dark:text-rose-400';

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* Panel */}
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl shadow-xl flex flex-col gap-0 overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-hover">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">Exchange Settlement</h3>
              <p className="text-xs text-text-muted">Review before confirming</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="p-1.5 rounded-lg hover:bg-border transition-colors text-text-muted disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Value Breakdown ──────────────────────────────────────────── */}
        <div className="px-4 py-4 flex flex-col gap-2.5">

          {/* Returned value */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-text-secondary font-medium">Returned items value</span>
            <span className="font-bold text-warning tabular-nums">
              − Rs {fmt(returnedValue)}
            </span>
          </div>

          {/* Replacement value */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-text-secondary font-medium">Replacement items value</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              + Rs {fmt(replacementValue)}
            </span>
          </div>

          {/* Divider */}
          <div className="border-t border-border/70" />

          {/* Net difference */}
          <div className={`flex justify-between items-center text-base font-black ${diffColour}`}>
            <span className="uppercase tracking-widest text-xs">
              {isBalanced ? 'Net Difference' : customerPays ? 'Amount Due' : 'Refund Due'}
            </span>
            <span className="tabular-nums text-xl">
              {isBalanced
                ? 'Rs 0'
                : `Rs ${fmt(exchangeDifference)}`}
            </span>
          </div>

          {/* Human-readable summary pill */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold
            ${isBalanced
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : customerPays
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{diffLabel}</span>
          </div>
        </div>

        {/* ── Linked Invoice Requirement ───────────────────────────────── */}
        <div className="px-4 pb-4">
          {hasLinkedInvoice ? (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-hover border border-border text-xs">
              <span className="text-text-muted font-medium">Original invoice</span>
              <span className="font-bold text-text-primary truncate max-w-[140px]">{linkedInvoiceId}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20 text-xs text-warning">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  A linked original invoice is required before this exchange can be
                  processed.  Select the invoice first.
                </span>
              </div>
              <button
                type="button"
                onClick={onSelectInvoice}
                className="w-full h-9 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-all"
              >
                Select Original Invoice
              </button>
            </div>
          )}
        </div>

        {/* ── Settlement method note / selection ───────────────────────── */}
        {!isBalanced && hasLinkedInvoice && (
          <div className="px-4 pb-3 flex flex-col gap-2">
            {customerPays ? (
              <p className="text-[11px] text-text-muted leading-relaxed">
                Collect the extra amount from the customer before confirming.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-text-secondary">Refund Settlement Method:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRefundMethod('CASH')}
                    className={`h-8 rounded-lg text-xs font-bold border transition-all ${
                      refundMethod === 'CASH'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-600 dark:text-rose-400'
                        : 'bg-surface border-border text-text-muted hover:bg-surface-hover'
                    }`}
                  >
                    Cash Refund
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundMethod('CREDIT')}
                    disabled={!hasCustomerAccount}
                    title={!hasCustomerAccount ? 'Customer account required for ledger credit' : undefined}
                    className={`h-8 rounded-lg text-xs font-bold border transition-all ${
                      refundMethod === 'CREDIT'
                        ? 'bg-indigo-500/20 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                        : 'bg-surface border-border text-text-muted hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    Account Credit
                  </button>
                </div>
                {!hasCustomerAccount && (
                  <p className="text-[10px] text-text-muted">
                    Walk-in customer: difference will be refunded in Cash.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Action buttons ───────────────────────────────────────────── */}
        {hasLinkedInvoice && (
          <div className="px-4 pb-4 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isProcessing}
              className="flex-1 h-10 rounded-xl border border-border text-text-secondary text-sm font-semibold hover:bg-surface-hover transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm({ refundMethod: customerOwed ? refundMethod : undefined })}
              disabled={!canConfirm}
              className="flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Processing…' : 'Confirm Exchange'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExchangeSettlementModal;
