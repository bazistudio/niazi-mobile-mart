'use client';

import React, { useState, useEffect } from 'react';
import { X, Percent, Tag, Check, Sparkles } from 'lucide-react';
import { usePosStore } from '../store/usePosStore';

interface DiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiscountModal: React.FC<DiscountModalProps> = ({ isOpen, onClose }) => {
  const activeSession = usePosStore((s) => s.getActiveSession());
  const setInvoiceDiscount = usePosStore((s) => s.setInvoiceDiscount);

  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<string>('0');

  useEffect(() => {
    if (activeSession && isOpen) {
      setDiscountType(activeSession.invoiceDiscountType || 'fixed');
      setDiscountValue(String(activeSession.invoiceDiscountValue || 0));
    }
  }, [activeSession, isOpen]);

  if (!isOpen || !activeSession) return null;

  const cart = activeSession.cart || [];
  const returnedItems = activeSession.returnedItems || [];
  const subtotal = cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const returnTotal = returnedItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const netSubtotal = Math.max(0, subtotal - returnTotal);

  const numVal = parseFloat(discountValue) || 0;
  let calculatedDiscountAmount = 0;
  if (discountType === 'percentage') {
    calculatedDiscountAmount = (netSubtotal * Math.min(100, Math.max(0, numVal))) / 100;
  } else {
    calculatedDiscountAmount = Math.min(netSubtotal, Math.max(0, numVal));
  }

  const finalTotal = Math.max(0, netSubtotal - calculatedDiscountAmount);

  const handleApplyPreset = (percent: number) => {
    setDiscountType('percentage');
    setDiscountValue(String(percent));
  };

  const handleConfirm = () => {
    setInvoiceDiscount(discountType, numVal);
    onClose();
  };

  const handleClearDiscount = () => {
    setInvoiceDiscount('fixed', 0);
    setDiscountValue('0');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200 select-none"
    >
      <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 sm:p-6 shadow-modal">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Tag className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">Apply Invoice Discount</h3>
              <p className="text-xs text-text-muted">Set percentage or fixed rupee discount</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Subtotal Summary Card */}
        <div className="my-4 p-3 rounded-xl bg-surface-hover/60 border border-border/80 flex items-center justify-between text-xs">
          <span className="font-semibold text-text-secondary">Cart Subtotal</span>
          <span className="text-sm font-black text-text-primary tabular-nums">
            Rs {netSubtotal.toLocaleString()}
          </span>
        </div>

        {/* Preset Percentage Chips */}
        <div className="mb-4">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">
            Quick Preset Discount
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[5, 10, 15, 20].map((pct) => {
              const isSelected = discountType === 'percentage' && numVal === pct;
              return (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleApplyPreset(pct)}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                    isSelected
                      ? 'bg-primary text-white border-primary shadow-xs'
                      : 'bg-surface border-border text-text-secondary hover:bg-surface-hover hover:border-primary/40'
                  }`}
                >
                  {pct}%
                </button>
              );
            })}
          </div>
        </div>

        {/* Type Toggle & Custom Input */}
        <div className="space-y-3 mb-5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Custom Discount Value
            </label>
            <div className="flex bg-surface-hover p-0.5 rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setDiscountType('percentage')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                  discountType === 'percentage'
                    ? 'bg-surface text-primary shadow-xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                % Percent
              </button>
              <button
                type="button"
                onClick={() => setDiscountType('fixed')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                  discountType === 'fixed'
                    ? 'bg-surface text-primary shadow-xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Rs Amount
              </button>
            </div>
          </div>

          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-text-muted text-sm">
              {discountType === 'percentage' ? '%' : 'Rs'}
            </span>
            <input
              type="number"
              min="0"
              max={discountType === 'percentage' ? 100 : netSubtotal}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder="0"
              className="w-full pl-10 pr-3 py-2 text-base font-bold bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-focus-ring tabular-nums no-spinners"
            />
          </div>
        </div>

        {/* Live Calculation Preview */}
        <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 space-y-1.5 mb-5 text-xs">
          <div className="flex justify-between items-center text-text-secondary">
            <span>Discount Applied:</span>
            <span className="font-bold text-danger tabular-nums">
              - Rs {calculatedDiscountAmount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm font-black text-text-primary pt-1.5 border-t border-primary/10">
            <span>New Net Total:</span>
            <span className="text-primary tabular-nums">
              Rs {finalTotal.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleClearDiscount}
            className="px-3.5 py-2 text-xs font-semibold text-danger hover:bg-danger/10 rounded-xl transition-colors"
          >
            Clear Discount
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover border border-border rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-hover rounded-xl shadow-xs transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              Apply Discount
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscountModal;
