import React from 'react';
import { ArrowDownToLine, ArrowUpFromLine, DollarSign, Wallet } from 'lucide-react';

export const ReceivablesCard = ({ amount, scopeLabel = 'Global Organization Balance' }: { amount: number; scopeLabel?: string }) => {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-gray-800 flex flex-col justify-between">
      <div>
        <div className="flex items-center mb-6">
          <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 rounded-xl mr-3">
            <ArrowDownToLine className="text-blue-600 dark:text-blue-400" size={24} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Customer Receivables</h3>
            <p className="text-xs text-gray-400">Total Outstanding Credit</p>
          </div>
        </div>

        <div className="flex items-baseline text-gray-900 dark:text-white font-black text-2xl">
          <span className="text-blue-600 dark:text-blue-400 mr-2 text-base font-bold">Rs</span>
          <span>{amount.toLocaleString('en-PK')}</span>
        </div>
      </div>
      
      <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
          <DollarSign size={14} className="mr-1 text-blue-500" />
          {scopeLabel}
        </p>
      </div>
    </div>
  );
};

export const PayablesCard = ({ amount, scopeLabel = 'Global Organization Balance' }: { amount: number; scopeLabel?: string }) => {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-gray-800 flex flex-col justify-between">
      <div>
        <div className="flex items-center mb-6">
          <div className="p-2.5 bg-rose-50 dark:bg-rose-900/30 rounded-xl mr-3">
            <ArrowUpFromLine className="text-rose-600 dark:text-rose-400" size={24} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Supplier Payables</h3>
            <p className="text-xs text-gray-400">Vendor Liabilities</p>
          </div>
        </div>

        <div className="flex items-baseline text-gray-900 dark:text-white font-black text-2xl">
          <span className="text-rose-600 dark:text-rose-400 mr-2 text-base font-bold">Rs</span>
          <span>{amount.toLocaleString('en-PK')}</span>
        </div>
      </div>
      
      <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
          <DollarSign size={14} className="mr-1 text-rose-500" />
          {scopeLabel}
        </p>
      </div>
    </div>
  );
};

export const CashDrawerCard = ({ 
  expectedCash, 
  openingCash, 
  sessionStatus,
  scopeLabel = 'Physical Cash Drawer'
}: { 
  expectedCash: number; 
  openingCash: number;
  sessionStatus: string;
  scopeLabel?: string;
}) => {
  const isSessionOpen = sessionStatus === 'OPEN';
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-gray-800 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl mr-3">
              <Wallet className="text-emerald-600 dark:text-emerald-400" size={24} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Cash in Drawers</h3>
              <p className="text-xs text-gray-400">Current Register Position</p>
            </div>
          </div>
          <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
            isSessionOpen 
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' 
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          }`}>
            {isSessionOpen ? 'Session Active' : 'No Open Session'}
          </span>
        </div>

        <div className="flex items-baseline text-gray-900 dark:text-white font-black text-2xl">
          <span className="text-emerald-600 dark:text-emerald-400 mr-2 text-base font-bold">Rs</span>
          <span>{expectedCash.toLocaleString('en-PK')}</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Opening Float: Rs {openingCash.toLocaleString('en-PK')}
        </p>
      </div>
      
      <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
          <DollarSign size={14} className="mr-1 text-emerald-500" />
          {scopeLabel}
        </p>
      </div>
    </div>
  );
};
