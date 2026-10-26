import React from 'react';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Calculator,
  Lock,
  Unlock,
  Sliders,
  CheckCircle,
  UserCheck,
  ShoppingCart,
  Receipt,
} from 'lucide-react';
import { useCashStore } from '../store/cash.store';

const formatCurrency = (val: number | undefined | null) =>
  `PKR ${(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

interface CashSessionActiveCardProps {
  onOpenSession: () => void;
  onCloseSession: () => void;
  onAdjustment: () => void;
  // CASH-2: three new voucher action callbacks
  onReceivePayment: () => void;
  onAddExpense: () => void;
  onPaySupplier: () => void;
  branchSelector?: React.ReactNode;
}

export const CashSessionActiveCard: React.FC<CashSessionActiveCardProps> = ({
  onOpenSession,
  onCloseSession,
  onAdjustment,
  onReceivePayment,
  onAddExpense,
  onPaySupplier,
  branchSelector,
}) => {
  const { currentSession: session, summary, isLoading } = useCashStore();
  const isOpen = session?.status === 'OPEN';

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-neutral-800 rounded-xl shadow p-6 animate-pulse">
        <div className="h-6 bg-neutral-200 dark:bg-neutral-700 rounded w-1/3 mb-4" />
        <div className="h-10 bg-neutral-200 dark:bg-neutral-700 rounded w-1/2 mb-6" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-neutral-200 dark:bg-neutral-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-xl shadow p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white whitespace-nowrap">
            Cash Session
          </h2>
        </div>
        {branchSelector && (
          <div className="flex-1 flex items-center justify-center min-w-[280px] max-w-full overflow-hidden">
            {branchSelector}
          </div>
        )}
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${
            isOpen
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400'
          }`}
        >
          {isOpen ? (
            <>
              <Unlock className="w-3 h-3" /> Open
            </>
          ) : (
            <>
              <Lock className="w-3 h-3" /> Closed
            </>
          )}
        </span>
      </div>

      {/* Expected Cash */}
      <div className="mb-6">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Expected Cash</p>
        <p className="text-3xl font-bold text-neutral-900 dark:text-white">
          {summary ? formatCurrency(summary.expected_closing_cash) : '—'}
        </p>
        {summary && (
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
            Opening: {formatCurrency(summary.opening_cash)}
          </p>
        )}
      </div>

      {/* KPI grid */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
            <div className="flex items-center gap-1 mb-1">
              <ArrowDownLeft className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
              <span className="text-xs text-green-700 dark:text-green-400 font-medium">Cash In</span>
            </div>
            <p className="text-sm font-bold text-green-800 dark:text-green-300">
              {formatCurrency(summary.total_cash_in)}
            </p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
            <div className="flex items-center gap-1 mb-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              <span className="text-xs text-red-700 dark:text-red-400 font-medium">Cash Out</span>
            </div>
            <p className="text-sm font-bold text-red-800 dark:text-red-300">
              {formatCurrency(summary.total_cash_out)}
            </p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
            <div className="flex items-center gap-1 mb-1">
              <Calculator className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="text-xs text-blue-700 dark:text-blue-400 font-medium">Sales</span>
            </div>
            <p className="text-sm font-bold text-blue-800 dark:text-blue-300">
              {formatCurrency(summary.cash_sales)}
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
            <div className="flex items-center gap-1 mb-1">
              <CheckCircle className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span className="text-xs text-purple-700 dark:text-purple-400 font-medium">Expenses</span>
            </div>
            <p className="text-sm font-bold text-purple-800 dark:text-purple-300">
              {formatCurrency(summary.cash_expenses)}
            </p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-3">
        {!isOpen ? (
          <button
            onClick={onOpenSession}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Unlock className="w-4 h-4" />
            Open Cash Session
          </button>
        ) : (
          <>
            {/* Voucher actions — only shown while session is OPEN (CASH-2) */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={onReceivePayment}
                className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 rounded-xl text-xs font-medium transition-colors border border-green-200 dark:border-green-800"
                title="Receive Customer Payment"
              >
                <UserCheck className="w-4 h-4" />
                <span className="text-center leading-tight">Receive Payment</span>
              </button>
              <button
                onClick={onAddExpense}
                className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/40 text-orange-700 dark:text-orange-400 rounded-xl text-xs font-medium transition-colors border border-orange-200 dark:border-orange-800"
                title="Add Expense"
              >
                <Receipt className="w-4 h-4" />
                <span className="text-center leading-tight">Add Expense</span>
              </button>
              <button
                onClick={onPaySupplier}
                className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400 rounded-xl text-xs font-medium transition-colors border border-red-200 dark:border-red-800"
                title="Pay Supplier Cash"
              >
                <ShoppingCart className="w-4 h-4" />
                <span className="text-center leading-tight">Pay Supplier</span>
              </button>
            </div>

            {/* Session management actions */}
            <div className="flex gap-2">
              <button
                onClick={onAdjustment}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-300 rounded-xl text-sm font-medium transition-colors"
              >
                <Sliders className="w-4 h-4" />
                Adjust Cash
              </button>
              <button
                onClick={onCloseSession}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors"
              >
                <Lock className="w-4 h-4" />
                Close Day
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
