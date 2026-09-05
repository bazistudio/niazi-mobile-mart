'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  CheckCircle2,
  CreditCard,
  Banknote,
  Building2,
  Smartphone,
  UserCircle2,
  Plus,
  Trash2,
  Loader2,
  Printer,
  Receipt,
  ArrowRight
} from 'lucide-react';
import { PaymentMethod, usePosStore } from '../store/usePosStore';

interface MultiPaymentModalProps {
  isOpen: boolean;
  grandTotal: number;
  onClose: () => void;
  onConfirm: (
    paymentBreakdown: { method: string; amount: number }[],
    shouldPrint?: boolean
  ) => Promise<void>;
  onCreditSelect: () => void;
  isProcessing?: boolean;
}

export const MultiPaymentModal: React.FC<MultiPaymentModalProps> = ({
  isOpen,
  grandTotal,
  onClose,
  onConfirm,
  onCreditSelect,
  isProcessing = false,
}) => {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tenderAmount, setTenderAmount] = useState<string>('');
  const [payments, setPayments] = useState<{ method: string; amount: number }[]>([]);
  const tenderInputRef = useRef<HTMLInputElement>(null);

  const isRefund = grandTotal < 0;
  const absTotal = Math.abs(grandTotal);

  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  const remainingDue = Math.max(0, absTotal - totalPaid);

  const parsedTender = parseFloat(tenderAmount || '0');
  const change = !isRefund && totalPaid + parsedTender > absTotal
    ? (totalPaid + parsedTender) - absTotal
    : 0;

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMethod('cash');
      setTenderAmount('');
      setPayments([]);
    }
  }, [isOpen, grandTotal]);

  // Focus tender input on method switch or modal open
  useEffect(() => {
    if (isOpen && method === 'cash' && !isRefund && remainingDue > 0) {
      tenderInputRef.current?.focus();
    }
  }, [isOpen, method, isRefund, remainingDue]);

  if (!isOpen) return null;

  const paymentOptions: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
    { id: 'cash', label: 'Cash', icon: <Banknote className="h-4 w-4" /> },
    { id: 'card', label: 'Debit/Credit Card', icon: <CreditCard className="h-4 w-4" /> },
    { id: 'bank', label: 'Bank Transfer', icon: <Building2 className="h-4 w-4" /> },
    { id: 'easypaisa', label: 'EasyPaisa', icon: <Smartphone className="h-4 w-4" /> },
    { id: 'jazzcash', label: 'JazzCash', icon: <Smartphone className="h-4 w-4" /> },
    { id: 'credit', label: 'Credit (Ledger)', icon: <UserCircle2 className="h-4 w-4" /> },
  ];

  const cashNotes = [100, 500, 1000, 5000];

  const handleAddPayment = () => {
    if (method === 'credit') {
      if (payments.length > 0) {
        import('react-hot-toast').then(({ default: toast }) => {
          toast.error("Credit/Udhar cannot be combined with other payment methods. Please use Credit for the full amount or remove other tenders.");
        });
        return;
      }
      onCreditSelect();
      return;
    }

    if (isRefund) {
      onConfirm([{ method, amount: absTotal }]);
      return;
    }

    if (parsedTender > 0) {
      // Check if existing payments contain credit
      const hasCredit = payments.some(p => p.method === 'credit');
      if (hasCredit) {
        import('react-hot-toast').then(({ default: toast }) => {
          toast.error("Credit/Udhar cannot be combined with other payment methods. Please clear the credit payment first.");
        });
        return;
      }

      const amountToRecord = Math.min(parsedTender, remainingDue);
      setPayments((prev) => [...prev, { method, amount: amountToRecord }]);
      setTenderAmount('');
    }
  };

  const handleQuickNote = (note: number) => {
    setTenderAmount(String(note));
  };

  const handleExactAmount = () => {
    setTenderAmount(String(remainingDue));
  };

  const handleRemovePayment = (index: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFinalSubmit = async (shouldPrint: boolean = false) => {
    if (method === 'credit' && payments.length === 0) {
      onCreditSelect();
      return;
    }

    // T2 Safety Guard: Prevent mixing credit with other payment methods
    const hasCredit = payments.some(p => p.method === 'credit') || method === 'credit';
    const hasImmediate = payments.some(p => p.method !== 'credit') || (parsedTender > 0 && method !== 'credit');
    
    if (hasCredit && hasImmediate && payments.length > 0) {
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error("Credit/Udhar cannot be combined with other payment methods. Please use Credit for the full amount or remove other tenders.");
      });
      return;
    }

    let finalPayments = [...payments];
    if (parsedTender > 0 && remainingDue > 0 && method !== 'credit') {
      const amountToRecord = Math.min(parsedTender, remainingDue);
      finalPayments.push({ method, amount: amountToRecord });
    }

    if (finalPayments.length === 0 && !isRefund && method !== 'credit') {
      finalPayments = [{ method: 'cash', amount: absTotal }];
    }

    await onConfirm(finalPayments, shouldPrint);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200 select-none"
    >
      <div className="w-full max-w-3xl rounded-2xl bg-surface border border-border shadow-modal overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-surface-hover/30">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Receipt className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">
                {isRefund ? 'Process Refund' : 'Multi-Payment Checkout'}
              </h3>
              <p className="text-xs text-text-muted">
                {isRefund ? 'Select refund payout method' : 'Select payment method or split tender'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body: Dual Column */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-y-auto custom-scrollbar min-h-0">
          {/* Left Column: Methods & Note shortcuts (7 cols) */}
          <div className="md:col-span-7 p-4 sm:p-5 border-b md:border-b-0 md:border-r border-border flex flex-col gap-4">
            {/* Payment Method Selector */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">
                1. Select Payment Method
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {paymentOptions.map((opt) => {
                  const isSelected = method === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMethod(opt.id)}
                      disabled={remainingDue === 0 && !isRefund && !isSelected}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'bg-primary text-white border-primary shadow-xs'
                          : 'bg-surface border-border text-text-secondary hover:bg-surface-hover hover:border-primary/40'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <span className={isSelected ? 'text-white' : 'text-primary'}>
                        {opt.icon}
                      </span>
                      <span className="text-xs font-bold truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cash Tender Shortcuts & Input */}
            {method === 'cash' && !isRefund && (
              <div className="space-y-3 pt-2 border-t border-border/80">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted">
                  2. Cash Tender Note Shortcuts
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {cashNotes.map((note) => (
                    <button
                      key={note}
                      type="button"
                      onClick={() => handleQuickNote(note)}
                      className="py-2 px-1 rounded-lg border border-border bg-surface hover:bg-surface-hover active:bg-primary/10 text-xs font-black text-text-primary text-center transition-all"
                    >
                      Rs {note}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleExactAmount}
                    className="py-2 px-1 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-xs font-black text-primary text-center transition-all"
                  >
                    Exact
                  </button>
                </div>

                {/* Tender Amount Input */}
                <div className="pt-2">
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    Tendered Cash Amount
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-text-muted text-sm">
                        Rs
                      </span>
                      <input
                        ref={tenderInputRef}
                        type="number"
                        min="0"
                        value={tenderAmount}
                        onChange={(e) => setTenderAmount(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddPayment()}
                        placeholder={remainingDue.toString()}
                        className="w-full pl-10 pr-3 py-2 text-lg font-black bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-focus-ring tabular-nums no-spinners"
                      />
                    </div>
                    {remainingDue > 0 && parsedTender > 0 && parsedTender < remainingDue && (
                      <button
                        type="button"
                        onClick={handleAddPayment}
                        className="px-3.5 py-2 bg-surface-hover hover:bg-primary/10 border border-border rounded-xl text-primary font-bold text-xs flex items-center gap-1 transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Add Split</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Non-cash prompt */}
            {method !== 'cash' && method !== 'credit' && !isRefund && (
              <div className="p-3.5 rounded-xl bg-info/5 border border-info/20 text-xs text-text-secondary space-y-1">
                <p className="font-semibold text-info flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
                  Electronic Payment ({method.toUpperCase()})
                </p>
                <p className="text-text-muted">
                  Confirm receipt of payment on external terminal before completing sale.
                </p>
              </div>
            )}

            {method === 'credit' && (
              <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/30 text-xs text-text-secondary space-y-1">
                <p className="font-bold text-warning flex items-center gap-1.5">
                  <UserCircle2 className="h-4 w-4" />
                  Customer Credit Ledger
                </p>
                <p className="text-text-muted">
                  Invoice balance will be attached to customer account in the ledger.
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Breakdown & Grand Total (5 cols) */}
          <div className="md:col-span-5 p-4 sm:p-5 bg-surface-hover/20 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2">
                <div className="flex justify-between items-center text-xs text-text-secondary">
                  <span>{isRefund ? 'Total Refund' : 'Total Bill Amount'}</span>
                  <span className="text-base font-black text-text-primary tabular-nums">
                    Rs {absTotal.toLocaleString()}
                  </span>
                </div>

                {!isRefund && (
                  <>
                    <div className="flex justify-between items-center text-xs text-success pt-1.5 border-t border-border/60">
                      <span>Total Paid:</span>
                      <span className="font-bold tabular-nums">
                        Rs {(totalPaid + (parsedTender > 0 ? Math.min(parsedTender, remainingDue) : 0)).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs text-danger">
                      <span>Remaining Balance:</span>
                      <span className="font-bold tabular-nums">
                        Rs {Math.max(0, remainingDue - (parsedTender || 0)).toLocaleString()}
                      </span>
                    </div>

                    {change > 0 && (
                      <div className="flex justify-between items-center text-xs text-info pt-1.5 border-t border-border/60">
                        <span className="font-bold">Change to Return:</span>
                        <span className="font-black text-sm tabular-nums">
                          Rs {change.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Split Breakdown Chips */}
              {payments.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                    Split Payments Applied
                  </label>
                  <div className="space-y-1.5">
                    {payments.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-surface border border-border text-xs"
                      >
                        <span className="font-bold uppercase text-[11px] text-text-secondary">
                          {p.method}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-text-primary tabular-nums">
                            Rs {p.amount.toLocaleString()}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemovePayment(idx)}
                            className="p-1 text-danger hover:bg-danger/10 rounded transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Final Checkout CTAs */}
            <div className="space-y-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleFinalSubmit(false)}
                className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary-hover active:bg-primary-active text-white font-black text-sm shadow-md hover:shadow-lg disabled:opacity-disabled transition-all flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Submitting payment...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      {remainingDue > 0 && method === 'credit'
                        ? 'Proceed to Ledger'
                        : isRefund
                        ? 'Payout Refund'
                        : 'Complete Sale (Ctrl+S)'}
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleFinalSubmit(true)}
                className="w-full py-2 px-4 rounded-xl bg-surface border border-border hover:bg-surface-hover text-text-primary font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Printer className="h-3.5 w-3.5 text-primary" />
                <span>Complete & Print Receipt (Ctrl+P)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiPaymentModal;
