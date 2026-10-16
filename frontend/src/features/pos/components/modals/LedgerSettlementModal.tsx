'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DBCustomer } from '@/types/db.types';
import { X, CheckCircle2, Printer, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { ledgerApi } from '@/services/ledger.api';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';

interface Props {
  customer: DBCustomer;
  invoiceTotal: number;
  onClose: () => void;
  onSuccess: (receivedAmount: number) => void;
  /**
   * GAP-04: When true, the modal records the payment via ledgerApi itself and shows a
   * print-receipt option after confirmation. Use this for the standalone "Receive Payment"
   * flow in PosCustomerLedgerPanel where no other transaction is being processed.
   *
   * When false (default), the modal simply calls onSuccess(amount) and lets the caller
   * decide how to record the payment (used by CartSummary's invoice-checkout flow).
   */
  standaloneMode?: boolean;
}

interface PaymentReceipt {
  paymentId: string;
  receiptNumber: string;
  newBalance: number;
  paidAmount: number;
  customerName: string;
  paymentMethod: string;
  branchName: string;
  cashierName: string;
  timestamp: string;
}

export const LedgerSettlementModal: React.FC<Props> = ({
  customer,
  invoiceTotal,
  onClose,
  onSuccess,
  standaloneMode = false,
}) => {
  const [cashReceived, setCashReceived] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedReceipt, setCompletedReceipt] = useState<PaymentReceipt | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const previousOutstanding = customer.currentBalance;
  const totalDue = previousOutstanding + invoiceTotal;
  
  const receivedAmount = parseInt(cashReceived || '0', 10);
  const newOutstanding = Math.max(totalDue - receivedAmount, 0);
  const customerAdvance = Math.max(receivedAmount - totalDue, 0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter') handleSave();
  };

  const handleSave = async () => {
    if (newOutstanding > customer.creditLimit) {
      toast.error(`Exceeds credit limit of Rs ${customer.creditLimit.toLocaleString()}`);
      return;
    }

    if (!standaloneMode) {
      // CartSummary path: just delegate to caller.
      onSuccess(receivedAmount);
      return;
    }

    // GAP-04: Standalone path — record the payment via the REST API.
    if (receivedAmount <= 0) {
      toast.error('Enter a payment amount greater than zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await ledgerApi.recordPayment({
        partyId: customer.id || (customer as any)._id,
        partyType: 'CUSTOMER',
        amount: receivedAmount,
        method: 'CASH',
        notes: `POS standalone payment - ${new Date().toLocaleDateString()}`,
      });

      const activeShop = useOrganizationStore.getState().activeShop;
      const authUser = useAuthStore.getState().user;

      setCompletedReceipt({
        paymentId: result.data.paymentId,
        receiptNumber: result.data.receiptNumber || result.data.paymentId,
        newBalance: result.data.newBalance,
        paidAmount: receivedAmount,
        customerName: customer.name,
        paymentMethod: 'Cash',
        branchName: (activeShop as any)?.name || 'Branch',
        cashierName: authUser?.name || 'Cashier',
        timestamp: new Date().toLocaleString('en-PK', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }),
      });

      // Notify caller to refresh the ledger panel — pass receivedAmount so callers
      // that track the amount still work, but onSuccess does NOT record a second payment.
      onSuccess(receivedAmount);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  // ── Success screen (GAP-04: shown after standalone payment is confirmed) ──────
  if (completedReceipt) {
    return (
      <>
        {/* Print-only receipt block – hidden on screen, visible on print */}
        <style>{`
          @media print {
            body > *:not(#payment-receipt-printable) { display: none !important; }
            #payment-receipt-printable { display: block !important; }
          }
          #payment-receipt-printable { display: none; }
        `}</style>

        <div
          id="payment-receipt-printable"
          style={{ fontFamily: 'monospace', width: '80mm', padding: '4mm', fontSize: '11px', lineHeight: '1.4' }}
        >
          <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
            {completedReceipt.branchName}
          </div>
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>Payment Receipt</div>
          <div>{'─'.repeat(32)}</div>
          <div>Receipt #: {completedReceipt.receiptNumber}</div>
          <div>Date: {completedReceipt.timestamp}</div>
          <div>{'─'.repeat(32)}</div>
          <div>Customer: {completedReceipt.customerName}</div>
          <div>Cashier: {completedReceipt.cashierName}</div>
          <div>{'─'.repeat(32)}</div>
          <div>Payment Method: {completedReceipt.paymentMethod}</div>
          <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
            Amount Paid: Rs {completedReceipt.paidAmount.toLocaleString()}
          </div>
          <div>New Balance: Rs {completedReceipt.newBalance.toLocaleString()}</div>
          <div>{'─'.repeat(32)}</div>
          <div style={{ textAlign: 'center', marginTop: '8px' }}>Thank you!</div>
        </div>

        {/* On-screen success dialog */}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800">

            <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-800 bg-emerald-50 dark:bg-emerald-900/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Payment Recorded</h2>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2 border border-gray-100 dark:border-gray-700 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{completedReceipt.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Receipt #</span>
                  <span className="font-mono font-semibold text-gray-900 dark:text-white">{completedReceipt.receiptNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount Paid</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">Rs {completedReceipt.paidAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="font-bold text-gray-700 dark:text-gray-300">New Balance</span>
                  <span className={`font-bold tabular-nums ${completedReceipt.newBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    Rs {completedReceipt.newBalance.toLocaleString()}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {completedReceipt.timestamp} · {completedReceipt.cashierName}
              </p>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm"
              >
                Close
              </button>
              <button
                onClick={handlePrintReceipt}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md transition-colors flex justify-center items-center gap-2 text-sm"
              >
                <Printer className="h-4 w-4" />
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Default input screen ──────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800">
        
        <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-800 bg-blue-50 dark:bg-blue-900/20">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {standaloneMode ? (
                <span className="flex items-center gap-1.5"><Receipt className="h-4 w-4 text-blue-600" />Receive Payment</span>
              ) : (
                'Ledger Settlement'
              )}
            </h2>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">{customer.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          
          {/* Ledger Summary */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2 border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Previous Balance:</span>
              <span className="font-semibold text-gray-900 dark:text-white">Rs {previousOutstanding.toLocaleString()}</span>
            </div>
            {!standaloneMode && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Today's Invoice:</span>
                <span className="font-semibold text-gray-900 dark:text-white">Rs {invoiceTotal.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-base pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="font-bold text-gray-900 dark:text-white">Total Due:</span>
              <span className="font-bold text-red-600 dark:text-red-400 tabular-nums">Rs {totalDue.toLocaleString()}</span>
            </div>
          </div>

          {/* Cash Received Input */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Cash Received</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-500">Rs</span>
              <input
                ref={inputRef}
                type="number"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="0"
                disabled={isSubmitting}
                className="w-full pl-10 pr-4 py-3 text-lg font-bold bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus: focus:ring-0 no-spinners tabular-nums transition-colors disabled:opacity-60"
              />
            </div>
          </div>

          {/* New Ledger State Result */}
          <div className={`p-4 rounded-lg border ${customerAdvance > 0 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : ' dark:/20  dark:'}`}>
            <div className="flex justify-between items-center">
              <span className={`text-sm font-bold ${customerAdvance > 0 ? 'text-green-800 dark:text-green-400' : 'text-red-800 dark:text-red-400'}`}>
                {customerAdvance > 0 ? 'Advance Credit Given:' : 'New Outstanding:'}
              </span>
              <span className={`text-xl font-black tabular-nums ${customerAdvance > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                Rs {customerAdvance > 0 ? customerAdvance.toLocaleString() : newOutstanding.toLocaleString()}
              </span>
            </div>
            {newOutstanding > customer.creditLimit && (
              <div className="mt-2 text-sm text-red-600 dark:text-red-400 font-bold bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800/50">
                Warning: Exceeds credit limit of Rs {customer.creditLimit.toLocaleString()}
              </div>
            )}
          </div>

        </div>

        <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={newOutstanding > customer.creditLimit || isSubmitting || (standaloneMode && receivedAmount <= 0)}
            className={`flex-1 py-3 text-white rounded-lg font-bold shadow-md transition-colors flex justify-center items-center gap-2 ${
              newOutstanding > customer.creditLimit || (standaloneMode && receivedAmount <= 0)
                ? 'bg-red-400 cursor-not-allowed opacity-70' 
                : isSubmitting
                  ? 'bg-blue-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSubmitting ? (
              <span className="animate-pulse">Recording…</span>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5" />
                {standaloneMode ? 'Confirm & Record' : 'Save Ledger'}
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
