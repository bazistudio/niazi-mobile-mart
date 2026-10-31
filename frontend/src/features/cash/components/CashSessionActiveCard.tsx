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
import { BusinessAccountsStrip } from './BusinessAccountsStrip';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMISSIONS } from '@/constants/permissions';

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
  currentBranchId?: string | null;
  currentBranchName?: string | null;
}

export const CashSessionActiveCard: React.FC<CashSessionActiveCardProps> = ({
  onOpenSession,
  onCloseSession,
  onAdjustment,
  onReceivePayment,
  onAddExpense,
  onPaySupplier,
  branchSelector,
  currentBranchId,
  currentBranchName,
}) => {
  const { currentSession: session, summary, isLoading } = useCashStore();
  const { hasPermission } = usePermissions();
  const canManageRegister = hasPermission(PERMISSIONS.FINANCE_MANAGE);
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

      {/* Expected Cash Drawer & Business Accounts Section */}
      <div className="mb-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Physical Drawer Cash Tile */}
        <div className="lg:col-span-4 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 bg-gradient-to-br from-neutral-50 to-white dark:from-neutral-800/80 dark:to-neutral-900/60 p-4 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Expected Cash Drawer
              </p>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                Physical Float
              </span>
            </div>
            <p className="text-3xl font-extrabold text-neutral-900 dark:text-white tabular-nums tracking-tight mt-1">
              {summary ? formatCurrency(summary.expected_closing_cash) : '—'}
            </p>
          </div>
          {summary && (
            <div className="mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
              <span>Opening Float:</span>
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                {formatCurrency(summary.opening_cash)}
              </span>
            </div>
          )}
        </div>

        {/* Digital Business Accounts Strip (EasyPaisa, JazzCash, Bank) */}
        <div className="lg:col-span-8 flex flex-col justify-between">
          <BusinessAccountsStrip
            currentBranchId={currentBranchId}
            currentBranchName={currentBranchName}
          />
        </div>
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
          canManageRegister ? (
            <button
              onClick={onOpenSession}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Unlock className="w-4 h-4" />
              Open Cash Session
            </button>
          ) : (
            <div
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 rounded-xl text-sm font-medium border border-neutral-200 dark:border-neutral-700 cursor-not-allowed"
              title="Register open/close actions require finance management permission"
            >
              <Lock className="w-4 h-4" />
              Register Closed (Open Restricted)
            </div>
          )
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
              {canManageRegister ? (
                <button
                  onClick={onCloseSession}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  <Lock className="w-4 h-4" />
                  Close Day
                </button>
              ) : (
                <div
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 rounded-xl text-sm font-medium border border-neutral-200 dark:border-neutral-700 cursor-not-allowed"
                  title="Register closing requires finance management permission"
                >
                  <Lock className="w-4 h-4" />
                  Close Restricted
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
