'use client';

import React, { useEffect } from 'react';
import { CustomerSelector } from './CustomerSelector';
import { CartTable } from './CartTable';
import { CartSummary } from './CartSummary';
import { useCashStore } from '@/features/cash';
import { usePosStore } from '../store/usePosStore';

interface CartPanelProps {
  isSaleSuccess?: boolean;
}

export const CartPanel: React.FC<CartPanelProps> = ({ isSaleSuccess }) => {
  const currentSession = useCashStore((s) => s.currentSession);
  const summary = useCashStore((s) => s.summary);
  const fetchCurrentState = useCashStore((s) => s.fetchCurrentState);

  const activeSession = usePosStore((s) => s.saleTabs.find((t) => t.id === s.activeTabId));

  useEffect(() => {
    fetchCurrentState();
  }, [fetchCurrentState]);

  // Current Till / Cash Register Drawer Balance (Bar 1)
  const currentDrawerCash = summary?.expected_closing_cash ?? currentSession?.opening_cash ?? 0;

  // Compute Invoice Cash Impact (Bar 2)
  const cart = activeSession?.cart ?? [];
  const returnedItems = activeSession?.returnedItems ?? [];
  const mode = activeSession?.mode;
  const isReturnMode = !!activeSession?.isReturnMode;
  const returnLines = activeSession?.returnLines ?? [];

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const returnTotal = returnedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const preDiscountTotal = subtotal - returnTotal;

  let invoiceDiscountAmount = 0;
  if (activeSession?.invoiceDiscountType === 'percentage') {
    invoiceDiscountAmount = Math.max(0, preDiscountTotal) * ((activeSession?.invoiceDiscountValue || 0) / 100);
  } else {
    invoiceDiscountAmount = activeSession?.invoiceDiscountValue || 0;
  }
  const grandTotal = Math.max(0, preDiscountTotal - invoiceDiscountAmount);

  // In return mode: compute refund amount from selected return lines
  const selectedReturnLines = returnLines.filter((l) => l.selectedForReturn && l.returnableQty > 0);
  const selectedRefundSum = selectedReturnLines.reduce(
    (sum, l) => sum + l.originalUnitPrice * l.returnQty,
    0
  );
  const effectiveRefundAmount = returnLines.length > 0 ? selectedRefundSum : grandTotal;

  // Dynamic invoice impact based on transaction mode
  let invoiceCashImpact = 0;
  if (isReturnMode || (mode as string) === 'return') {
    // Pure cash return/refund mode: cash paid OUT of drawer (reduces drawer balance)
    invoiceCashImpact = -effectiveRefundAmount;
  } else if (mode === 'replace') {
    // Replacement mode: net difference
    invoiceCashImpact = subtotal - returnTotal;
  } else if (activeSession?.linkedInvoiceId && returnedItems.length > 0 && cart.length === 0) {
    // Pure cash return/refund mode: cash paid OUT of drawer
    invoiceCashImpact = -returnTotal;
  } else if (activeSession?.customer?.id && activeSession.customer.id !== 'walk-in' && (activeSession as any).paymentMethod === 'credit') {
    // Pure credit / khata sale: no cash enters drawer
    invoiceCashImpact = 0;
  } else {
    // Normal cash sale: cash in
    invoiceCashImpact = grandTotal;
  }

  // Final Projected Cash Position (Bar 3) = Bar 1 + Bar 2
  const projectedCashPosition = currentDrawerCash + invoiceCashImpact;

  return (
    <div
      className={`flex flex-col h-full min-h-0 bg-surface border border-border rounded-xl shadow-card overflow-hidden transition-all duration-500 ${
        isSaleSuccess ? 'pos-animated-border-green' : 'pos-animated-border-blue'
      }`}
    >
      {/* 1. Header Bar: POS Cart + 3 Payment Position Bars in empty header space */}
      <div className="px-3 py-1.5 border-b border-border bg-surface-hover/60 flex items-center justify-between gap-2 shrink-0">
        <span className="text-sm font-black text-text-primary uppercase tracking-wider shrink-0 mr-1">
          POS Cart
        </span>

        {/* 3 Payment Bars filling the empty header space */}
        <div className="flex items-center gap-2 flex-1 justify-end max-w-[700px]">
          {/* Bar 1: Cash Register Current */}
          <div
            className="flex items-center justify-between gap-2 bg-surface px-2.5 py-1 rounded-lg border border-border shadow-xs min-w-[130px] flex-1 max-w-[200px]"
            title="Cash Register Current Payment (Drawer Cash)"
          >
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider truncate">
              Register Cash
            </span>
            <span className="text-xs font-black font-mono text-text-primary tabular-nums">
              Rs {currentDrawerCash.toLocaleString()}
            </span>
          </div>

          <span className="text-text-muted font-black text-xs shrink-0">{invoiceCashImpact < 0 ? '−' : '+'}</span>

          {/* Bar 2: Invoice Total / Impact */}
          <div
            className={`flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg border shadow-xs min-w-[130px] flex-1 max-w-[200px] transition-all ${
              invoiceCashImpact < 0
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-400'
                : invoiceCashImpact > 0
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400'
                : 'bg-surface border-border text-text-primary'
            }`}
            title="Invoice Total Payment Impact"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider truncate opacity-80">
              {isReturnMode || invoiceCashImpact < 0 ? 'Refund Total' : 'Invoice Total'}
            </span>
            <span className="text-xs font-black font-mono tabular-nums">
              {invoiceCashImpact > 0 ? `+Rs ${invoiceCashImpact.toLocaleString()}` : invoiceCashImpact < 0 ? `-Rs ${Math.abs(invoiceCashImpact).toLocaleString()}` : `Rs 0`}
            </span>
          </div>

          <span className="text-text-muted font-black text-xs shrink-0">=</span>

          {/* Bar 3: Final Projected Cash Position */}
          <div
            className={`flex items-center justify-between gap-2 border px-2.5 py-1 rounded-lg shadow-xs min-w-[140px] flex-1 max-w-[210px] ring-1 transition-all ${
              invoiceCashImpact < 0
                ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 ring-amber-400/20'
                : 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300 ring-blue-400/20'
            }`}
            title="Final New Cash Position in Register after Invoice"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider truncate opacity-80">
              New Position
            </span>
            <span className={`text-xs font-black font-mono tabular-nums ${
              invoiceCashImpact < 0
                ? 'text-amber-900 dark:text-amber-200'
                : 'text-blue-900 dark:text-blue-200'
            }`}>
              Rs {projectedCashPosition.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Cart Items Table */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <CartTable />
      </div>

      {/* 3. Financial Summary & Checkout Footer at the Bottom */}
      <div className="shrink-0 border-t border-border/70">
        <CartSummary />
      </div>
    </div>
  );
};

export default CartPanel;
