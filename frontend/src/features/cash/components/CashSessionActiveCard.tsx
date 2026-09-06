import React from 'react';
import { useCashStore } from '../store/cash.store';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Calculator,
  Lock,
  Unlock,
  Sliders,
  CheckCircle,
} from 'lucide-react';

interface Props {
  onOpenSession: () => void;
  onCloseSession: () => void;
  onAdjustment: () => void;
}

export const CashSessionActiveCard: React.FC<Props> = ({
  onOpenSession,
  onCloseSession,
  onAdjustment,
}) => {
  const { currentSession, summary, isLoading } = useCashStore();

  if (isLoading && !summary) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="animate-pulse h-32 bg-gray-200 dark:bg-neutral-800 rounded-2xl"></div>
        <div className="animate-pulse h-32 bg-gray-200 dark:bg-neutral-800 rounded-2xl"></div>
        <div className="animate-pulse h-32 bg-gray-200 dark:bg-neutral-800 rounded-2xl"></div>
        <div className="animate-pulse h-32 bg-gray-200 dark:bg-neutral-800 rounded-2xl"></div>
      </div>
    );
  }

  const isOpen = currentSession?.status === 'OPEN';

  return (
    <div className="space-y-6">
      {/* Session Status Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 shadow-sm gap-4">
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              isOpen
                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                : 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
            }`}
          >
            {isOpen ? <Unlock className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
                {isOpen ? 'Current Cash Session is Active' : 'No Active Cash Session'}
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider uppercase ${
                  isOpen
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'
                }`}
              >
                {isOpen ? 'OPEN' : 'CLOSED'}
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {isOpen && currentSession
                ? `Opened on ${currentSession.business_date} at ${new Date(
                    currentSession.opened_at
                  ).toLocaleTimeString()}`
                : 'Open a session to begin recording daily cash drawer operations.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {isOpen ? (
            <>
              <button
                type="button"
                onClick={onAdjustment}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <Sliders className="w-4 h-4" />
                Adjust Cash
              </button>
              <button
                type="button"
                onClick={onCloseSession}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
              >
                <CheckCircle className="w-4 h-4" />
                Close Day
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenSession}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
            >
              <Unlock className="w-4 h-4" />
              Open Cash Session
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Opening Cash */}
        <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-100 dark:border-neutral-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              Opening Cash
            </span>
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-neutral-900 dark:text-white tabular-nums">
            PKR {(summary?.opening_cash || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-neutral-400 mt-1">Starting drawer balance</p>
        </div>

        {/* Total Cash In */}
        <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-100 dark:border-neutral-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              Total Cash In
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
            +PKR {(summary?.total_cash_in || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-400 mt-1">
            <span>Sales: PKR {(summary?.cash_sales || 0).toLocaleString()}</span>
            <span>Cust: PKR {(summary?.customer_payments || 0).toLocaleString()}</span>
            {summary && summary.cash_in_adjustments > 0 && (
              <span>Adj: PKR {summary.cash_in_adjustments.toLocaleString()}</span>
            )}
          </div>
        </div>

        {/* Total Cash Out */}
        <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-100 dark:border-neutral-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              Total Cash Out
            </span>
            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-red-600 dark:text-red-400 tabular-nums">
            -PKR {(summary?.total_cash_out || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-400 mt-1">
            <span>Suppliers: PKR {(summary?.supplier_payments || 0).toLocaleString()}</span>
            <span>Expenses: PKR {(summary?.cash_expenses || 0).toLocaleString()}</span>
            {summary && summary.cash_out_adjustments > 0 && (
              <span>Adj: PKR {summary.cash_out_adjustments.toLocaleString()}</span>
            )}
          </div>
        </div>

        {/* Expected Cash */}
        <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-100 dark:border-neutral-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              Expected Cash
            </span>
            <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
              <Calculator className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-600 dark:text-purple-400 tabular-nums">
            PKR {(summary?.expected_closing_cash || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </div>
          <p className="text-xs text-neutral-400 mt-1">Opening + Cash In - Cash Out</p>
        </div>
      </div>
    </div>
  );
};
