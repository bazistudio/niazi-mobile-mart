import React, { useState } from 'react';
import { X, CreditCard, Banknote, Smartphone } from 'lucide-react';
import { DBCustomer } from '@/types/db.types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ledgerApi } from '@/services/ledger.api';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { invalidateQueries } from '@/lib/react-query/invalidate';
import { usePrintStore } from '@/lib/printer';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { printFormatter } from '@/features/settings/printer/utils/printFormatter';

interface ReceivePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: DBCustomer | null;
  onPaymentSuccess?: () => void;
}

export const ReceivePaymentModal = ({ isOpen, onClose, customer, onPaymentSuccess }: ReceivePaymentModalProps) => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');

  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { openPreview } = usePrintStore();
  const { settings, shopHeader } = usePrinterStore();

  const paymentMutation = useMutation({
    mutationFn: ledgerApi.recordPayment,
    onSuccess: (data: any) => {
      invalidateQueries.customers(queryClient, user);
      invalidateQueries.ledger(queryClient, user, 'CUSTOMER', customer?.id);
      setAmount('');
      
      // Attempt to Print Receipt automatically
      if (settings && shopHeader && data?.data?.paymentId) {
        // Construct a mock ledger object since the backend just returns IDs right now
        // Ideally we fetch the full ledger object, or construct it from the inputs
        const mockLedger = {
          transactionId: data.data.paymentId,
          createdAt: new Date().toISOString(),
          customerId: customer,
          type: 'payment',
          amount: Number(amount),
          debitAccount: method.toLowerCase() === 'bank transfer' ? 'bank' : method.toLowerCase(),
          description: `Payment Received - ${method}`
        };
        const html = printFormatter.formatPaymentReceipt(mockLedger, settings, shopHeader);
        openPreview({ html, documentType: 'PaymentReceipt', referenceId: data.data.paymentId, title: 'Payment Receipt' });
      }

      onClose();
      if (onPaymentSuccess) {
        onPaymentSuccess();
      }
    },
    onError: (err: any) => {
      console.error('Failed to save payment', err);
      alert(err.response?.data?.message || 'Failed to save payment');
    }
  });

  if (!isOpen || !customer) return null;

  const handleSave = async () => {
    if (!amount || isNaN(Number(amount))) return;
    
    paymentMutation.mutate({
      partyId: customer?.id,
      partyType: 'CUSTOMER',
      amount: Number(amount),
      method: method.toLowerCase() === 'bank transfer' ? 'bank' : method.toLowerCase() as any,
    });
  };

  const isSaving = paymentMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Receive Payment</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Customer Info */}
          <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Customer</p>
              <p className="font-semibold text-gray-900 dark:text-white">{customer?.name}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500 dark:text-gray-400">Outstanding</p>
              <p className="font-bold text-red-600 dark:text-red-400">Rs {customer.currentBalance.toLocaleString()}</p>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Amount Received
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">Rs</span>
              </div>
              <input
                type="number"
                className="block w-full pl-9 pr-3 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006970] focus:border-transparent text-lg font-semibold transition-colors"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                autoFocus
              />
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Payment Method
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { name: 'Cash', icon: Banknote },
                { name: 'Bank Transfer', icon: CreditCard },
                { name: 'Easypaisa', icon: Smartphone },
                { name: 'JazzCash', icon: Smartphone },
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = method === m.name;
                return (
                  <button
                    key={m.name}
                    onClick={() => setMethod(m.name)}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all ${
                      isSelected
                        ? 'border-[#006970] bg-[#006970]/5 text-[#006970] dark:border-[#00B4BB] dark:bg-[#00B4BB]/10 dark:text-[#00B4BB]'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!amount || isSaving}
            className="px-6 py-2 text-sm font-medium text-white bg-[#006970] hover:bg-[#00585e] rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? 'Saving...' : 'Save Payment'}
          </button>
        </div>

      </div>
    </div>
  );
};
