'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DBCustomer } from '@/types/db.types';
import { X, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  customer: DBCustomer;
  invoiceTotal: number;
  onClose: () => void;
  onSuccess: (receivedAmount: number) => void;
}

export const LedgerSettlementModal: React.FC<Props> = ({ customer, invoiceTotal, onClose, onSuccess }) => {
  const [cashReceived, setCashReceived] = useState<string>('');
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

  const handleSave = () => {
    if (newOutstanding > customer.creditLimit) {
      toast.error(`Exceeds credit limit of Rs ${customer.creditLimit.toLocaleString()}`);
      return;
    }
    onSuccess(receivedAmount);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800">
        
        <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-800 bg-blue-50 dark:bg-blue-900/20">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Ledger Settlement</h2>
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
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Today's Invoice:</span>
              <span className="font-semibold text-gray-900 dark:text-white">Rs {invoiceTotal.toLocaleString()}</span>
            </div>
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
                className="w-full pl-10 pr-4 py-3 text-lg font-bold bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus: focus:ring-0 no-spinners tabular-nums transition-colors"
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
            className="flex-1 py-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={newOutstanding > customer.creditLimit}
            className={`flex-1 py-3 text-white rounded-lg font-bold shadow-md transition-colors flex justify-center items-center gap-2 ${
              newOutstanding > customer.creditLimit 
                ? 'bg-red-400 cursor-not-allowed opacity-70' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <CheckCircle2 className="h-5 w-5" />
            Save Ledger
          </button>
        </div>

      </div>
    </div>
  );
};
