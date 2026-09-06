'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wallet, ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react';
import { cashApi } from '@/services/cash.api';

export const CashFlowSummaryCard: React.FC = () => {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['cash-daily-summary'],
    queryFn: () => cashApi.getDailySummary(),
    staleTime: 10000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="animate-pulse h-28 bg-neutral-100 dark:bg-neutral-800/60 rounded-2xl"></div>
        <div className="animate-pulse h-28 bg-neutral-100 dark:bg-neutral-800/60 rounded-2xl"></div>
        <div className="animate-pulse h-28 bg-neutral-100 dark:bg-neutral-800/60 rounded-2xl"></div>
      </div>
    );
  }

  const totalCashIn = summary?.total_cash_in ?? 0;
  const totalCashOut = summary?.total_cash_out ?? 0;
  const netCash = totalCashIn - totalCashOut;
  const isNetPositive = netCash >= 0;

  return (
    <div className="mb-6 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-[#006970] dark:text-[#00B4BB]" />
          <h3 className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
            Daily Cash Flow Overview
          </h3>
        </div>
        <span className="text-[11px] text-neutral-400 font-medium">
          Authoritative SQLite Ledger
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Cash In Card */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-100 dark:border-neutral-800 shadow-sm relative overflow-hidden group">
          <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-bl-full transition-transform group-hover:scale-110"></div>
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">
                Cash In (Today)
              </p>
              <h4 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums tracking-tight">
                PKR {totalCashIn.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h4>
              <p className="text-xs text-neutral-400 mt-1">
                Sales PKR {(summary?.cash_sales || 0).toLocaleString()} + Cust PKR {(summary?.customer_payments || 0).toLocaleString()}
              </p>
            </div>
            <div className="w-11 h-11 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
              <ArrowDownLeft className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Cash Out Card */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-100 dark:border-neutral-800 shadow-sm relative overflow-hidden group">
          <div className="absolute right-0 top-0 w-24 h-24 bg-red-500/5 dark:bg-red-500/10 rounded-bl-full transition-transform group-hover:scale-110"></div>
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">
                Cash Out (Today)
              </p>
              <h4 className="text-2xl font-black text-red-600 dark:text-red-400 tabular-nums tracking-tight">
                PKR {totalCashOut.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h4>
              <p className="text-xs text-neutral-400 mt-1">
                Suppliers PKR {(summary?.supplier_payments || 0).toLocaleString()} + Exp PKR {(summary?.cash_expenses || 0).toLocaleString()}
              </p>
            </div>
            <div className="w-11 h-11 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Net Cash Card */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-100 dark:border-neutral-800 shadow-sm relative overflow-hidden group">
          <div
            className={`absolute right-0 top-0 w-24 h-24 ${
              isNetPositive ? 'bg-[#006970]/5 dark:bg-[#006970]/10' : 'bg-amber-500/5 dark:bg-amber-500/10'
            } rounded-bl-full transition-transform group-hover:scale-110`}
          ></div>
          <div className="relative flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Net Cash Position
                </p>
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    isNetPositive
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                  }`}
                >
                  {isNetPositive ? 'Surplus' : 'Deficit'}
                </span>
              </div>
              <h4
                className={`text-2xl font-black tabular-nums tracking-tight ${
                  isNetPositive
                    ? 'text-[#006970] dark:text-[#00B4BB]'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                PKR {Math.abs(netCash).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                <span className="text-xs font-bold ml-1 text-neutral-400">
                  {isNetPositive ? '(+)' : '(-)'}
                </span>
              </h4>
              <p className="text-xs text-neutral-400 mt-1">Cash In minus Cash Out</p>
            </div>
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                isNetPositive
                  ? 'bg-[#006970]/10 text-[#006970] dark:bg-[#006970]/20 dark:text-[#00B4BB]'
                  : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
              }`}
            >
              <Wallet className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
