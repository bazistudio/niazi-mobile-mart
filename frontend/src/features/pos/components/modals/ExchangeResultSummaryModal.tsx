'use client';

/**
 * ExchangeResultSummaryModal — F-04 fix
 *
 * Displays the server-authoritative exchange result after a successful
 * processExchange() call.  All amounts shown here come from the backend
 * ExchangeResultDto — they are never client-calculated estimates.
 *
 * The modal is dismissed by the operator and has no submit action,
 * preventing any accidental duplicate transaction.
 */

import React from 'react';
import { CheckCircle2, ArrowLeftRight, X } from 'lucide-react';
import type { ExchangeResultDto } from '@/lib/tauri/tauriClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return Math.abs(Math.round(amount)).toLocaleString();
}

function settlementLabel(type: ExchangeResultDto['settlement_type']): string {
  switch (type) {
    case 'POSITIVE_COLLECTION': return 'Customer paid extra';
    case 'NEGATIVE_REFUND':     return 'Refund issued to customer';
    case 'BALANCED_ZERO':       return 'Balanced exchange — no payment';
    default:                    return 'Exchange settled';
  }
}

function refundMethodLabel(method: string | null | undefined): string {
  switch (method) {
    case 'CASH':   return 'Cash refund';
    case 'CREDIT': return 'Account credit';
    default:       return method ?? '—';
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExchangeResultSummaryModalProps {
  result: ExchangeResultDto;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ExchangeResultSummaryModal: React.FC<ExchangeResultSummaryModalProps> = ({
  result,
  onClose,
}) => {
  const invoiceNumber =
    result.replacement_sale?.sale?.invoice_number ?? null;
  const difference    = result.difference;
  const isPositive    = result.settlement_type === 'POSITIVE_COLLECTION';
  const isNegative    = result.settlement_type === 'NEGATIVE_REFUND';
  const isBalanced    = result.settlement_type === 'BALANCED_ZERO';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl shadow-xl flex flex-col gap-0 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-hover">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">Exchange Confirmed</h3>
              <p className="text-xs text-text-muted">Server-confirmed result</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-border transition-colors text-text-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success Banner */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Exchange successfully recorded by the server</span>
          </div>
        </div>

        {/* Detail Rows */}
        <div className="px-4 py-4 flex flex-col gap-2.5">

          {/* Replacement Invoice */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-text-secondary font-medium">Replacement invoice</span>
            <span className="font-bold text-text-primary tabular-nums">
              {invoiceNumber ?? '—'}
            </span>
          </div>

          {/* Net Difference */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-text-secondary font-medium">Net difference</span>
            <span className={`font-bold tabular-nums ${
              isBalanced  ? 'text-text-primary'
              : isPositive ? 'text-amber-600 dark:text-amber-400'
              :               'text-rose-600 dark:text-rose-400'
            }`}>
              {isBalanced
                ? 'Rs 0'
                : `${isPositive ? '+' : '−'} Rs ${fmt(difference)}`}
            </span>
          </div>

          {/* Settlement Type */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-text-secondary font-medium">Settlement</span>
            <span className="font-semibold text-text-primary text-right max-w-[160px]">
              {settlementLabel(result.settlement_type)}
            </span>
          </div>

          {/* Refund method (only when refund was issued) */}
          {isNegative && result.refund_method && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-text-secondary font-medium">Refund via</span>
              <span className="font-semibold text-text-primary">
                {refundMethodLabel(result.refund_method)}
              </span>
            </div>
          )}

          {/* Cash refunded */}
          {result.cash_refunded != null && result.cash_refunded > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-text-secondary font-medium">Cash refunded</span>
              <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                Rs {fmt(result.cash_refunded)}
              </span>
            </div>
          )}

          {/* Customer balance after (only when applicable and returned) */}
          {result.customer_balance_after != null && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-text-secondary font-medium">Customer balance</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                Rs {fmt(result.customer_balance_after)}
              </span>
            </div>
          )}

          <div className="border-t border-border/70 mt-1" />

          <p className="text-[10px] text-text-muted leading-relaxed">
            These are the server-confirmed values. The preview shown before confirmation
            was an estimate only.
          </p>
        </div>

        {/* Close */}
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-bold transition-all"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};

export default ExchangeResultSummaryModal;
