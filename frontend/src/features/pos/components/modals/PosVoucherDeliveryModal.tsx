'use client';

import React, { useState } from 'react';
import { X, PackageCheck, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { httpClient } from '@/lib/http/httpClient';
import toast from 'react-hot-toast';

export interface PosVoucherDeliveryModalProps {
  voucher: {
    id: string;
    voucher_number: string;
    product_name: string;
    voucher_qty: number;
    delivered_qty: number;
    remaining_qty: number;
    voucher_sale_price: number;
    customer_name_snapshot?: string;
    branch_id?: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export const PosVoucherDeliveryModal: React.FC<PosVoucherDeliveryModalProps> = ({
  voucher,
  onClose,
  onSuccess,
}) => {
  const maxDeliverable = voucher.remaining_qty > 0 
    ? voucher.remaining_qty 
    : (voucher.voucher_qty - voucher.delivered_qty);

  const [qtyToDeliver, setQtyToDeliver] = useState<number>(maxDeliverable > 0 ? maxDeliverable : 1);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDeliver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qtyToDeliver <= 0 || qtyToDeliver > maxDeliverable) {
      setErrorMsg(`Delivery quantity must be between 1 and ${maxDeliverable}`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const idempotencyKey = `deliv-${voucher.id}-${Date.now()}`;
      await httpClient.post(`/api/v1/pos/vouchers/${voucher.id}/deliver`, {
        quantity_delivered: qtyToDeliver,
        idempotency_key: idempotencyKey,
        notes: notes.trim() || undefined,
        branch_id: voucher.branch_id || undefined,
      });

      toast.success(`Successfully delivered ${qtyToDeliver} unit(s) for Voucher ${voucher.voucher_number}`);
      onSuccess();
    } catch (err: any) {
      console.error('[PosVoucherDeliveryModal] Delivery failed:', err);
      const msg = err?.response?.data?.error || err?.message || 'Failed to record voucher delivery';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div 
        className="bg-surface border border-border rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface-hover/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-text-primary tracking-tight">
                Deliver Voucher Units
              </h3>
              <p className="text-[11px] font-mono text-text-muted">
                {voucher.voucher_number}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleDeliver} className="p-5 flex flex-col gap-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Product & Customer Summary */}
          <div className="bg-surface-hover/50 border border-border/80 rounded-xl p-3 flex flex-col gap-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-text-muted font-medium">Customer:</span>
              <span className="font-bold text-text-primary">{voucher.customer_name_snapshot || 'Walk-In'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-muted font-medium">Product:</span>
              <span className="font-bold text-text-primary">{voucher.product_name}</span>
            </div>
            <div className="flex justify-between text-xs pt-1 border-t border-border/60">
              <span className="text-text-muted font-medium">Booked / Delivered:</span>
              <span className="font-bold tabular-nums">
                {voucher.voucher_qty} booked / {voucher.delivered_qty} delivered
              </span>
            </div>
            <div className="flex justify-between text-xs font-black">
              <span className="text-amber-600 dark:text-amber-400">Remaining to Deliver:</span>
              <span className="text-amber-600 dark:text-amber-400 tabular-nums">{maxDeliverable} unit(s)</span>
            </div>
          </div>

          {/* Input Quantity */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-text-primary flex justify-between">
              <span>Quantity to Deliver Now</span>
              <span className="text-text-muted font-normal text-[11px]">Max: {maxDeliverable}</span>
            </label>
            <input
              type="number"
              min={1}
              max={maxDeliverable}
              value={qtyToDeliver}
              onChange={(e) => setQtyToDeliver(Math.max(1, Math.min(maxDeliverable, parseInt(e.target.value, 10) || 1)))}
              disabled={isSubmitting || maxDeliverable <= 0}
              className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm font-bold text-text-primary focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary/20 tabular-nums"
            />
          </div>

          {/* Optional Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-text-primary">
              Handover / Delivery Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Delivered batch 1 to customer with original box"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-xs text-text-primary focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-border text-xs font-bold text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || maxDeliverable <= 0}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-black shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Recording Delivery...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm Delivery ({qtyToDeliver})</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
