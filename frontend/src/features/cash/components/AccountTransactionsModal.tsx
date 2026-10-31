import React from 'react';
import { X, Building2, Clock, CheckCircle2, AlertCircle, Smartphone, Landmark, ArrowUpRight } from 'lucide-react';
import { BusinessAccountSummary, AccountTransaction } from '../types/business-accounts.types';

interface AccountTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: BusinessAccountSummary | null;
  currentBranchName?: string | null;
  isAdminAllBranchesMode?: boolean;
}

const fmt = (val: number) =>
  `PKR ${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export const AccountTransactionsModal: React.FC<AccountTransactionsModalProps> = ({
  isOpen,
  onClose,
  account,
  currentBranchName,
  isAdminAllBranchesMode,
}) => {
  if (!isOpen || !account) return null;

  const isBank = account.provider === 'BANK';
  const Icon = isBank ? Landmark : Smartphone;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs select-none">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${account.colorScheme.bg} ${account.colorScheme.border}`}>
              <Icon className={`w-5 h-5 ${account.colorScheme.text}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  {account.name} Dispatches
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-neutral-200/70 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                  {account.accountNumberMasked}
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {isAdminAllBranchesMode
                  ? 'All Branches Consolidated Dispatch Audit'
                  : `Dispatches sent from ${currentBranchName || 'Current Branch'}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Account Top Summary Metrics */}
        <div className="grid grid-cols-3 gap-3 p-5 border-b border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-700/60">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block mb-1">
              Total Sent
            </span>
            <span className="text-base font-extrabold text-neutral-900 dark:text-white">
              {fmt(account.totalSent)}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Cleared</span>
            </div>
            <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400">
              {fmt(account.clearedAmount)}
            </span>
          </div>
          <div className={`p-3 rounded-xl border ${
            account.onHoldCount > 0
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700'
              : 'bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200/60 dark:border-neutral-700/60'
          }`}>
            <div className="flex items-center justify-between text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> On Hold
              </span>
              {account.onHoldCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-black text-[10px]">
                  {account.onHoldCount}
                </span>
              )}
            </div>
            <span className="text-base font-extrabold text-amber-700 dark:text-amber-400">
              {fmt(account.onHoldAmount)}
            </span>
          </div>
        </div>

        {/* Content Section: Admin Multi-Branch Breakdown OR Branch Transactions List */}
        <div className="overflow-y-auto p-5 flex-1 space-y-4">
          
          {/* Admin All-Branches Breakdown Table */}
          {isAdminAllBranchesMode && account.branchBreakdown && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <span>Branch-Wise Dispatch Contributions</span>
              </h4>
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-semibold border-b border-neutral-200 dark:border-neutral-700">
                    <tr>
                      <th className="py-2.5 px-3">Branch Name</th>
                      <th className="py-2.5 px-3 text-right">Total Sent</th>
                      <th className="py-2.5 px-3 text-right">Cleared</th>
                      <th className="py-2.5 px-3 text-right">On Hold</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {account.branchBreakdown.map((b) => (
                      <tr key={b.branchId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                        <td className="py-2.5 px-3 font-semibold text-neutral-900 dark:text-white">
                          {b.branchName}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-neutral-900 dark:text-white">
                          {fmt(b.totalSent)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                          {fmt(b.clearedAmount)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {b.onHoldAmount > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400 font-bold">
                              {fmt(b.onHoldAmount)} ({b.onHoldCount})
                            </span>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Transactions Feed */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider flex items-center justify-between">
              <span>{isAdminAllBranchesMode ? 'All Dispatched Records' : 'Branch Sent Transactions'}</span>
              <span className="text-[11px] font-normal text-neutral-400">
                {account.transactions.length} record(s)
              </span>
            </h4>

            {account.transactions.length === 0 ? (
              <div className="py-8 text-center text-sm text-neutral-400 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
                No payment dispatches sent for this account in the active session.
              </div>
            ) : (
              <div className="space-y-2">
                {account.transactions.map((tx: AccountTransaction) => {
                  const isOnHold = tx.status === 'ON_HOLD';
                  return (
                    <div
                      key={tx.id}
                      className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
                        isOnHold
                          ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                          : 'bg-neutral-50/70 dark:bg-neutral-800/40 border-neutral-200/70 dark:border-neutral-700/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          isOnHold
                            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                            : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                        }`}>
                          <ArrowUpRight className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-neutral-900 dark:text-white">
                              {tx.senderName}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
                              {tx.referenceNumber}
                            </span>
                            {isAdminAllBranchesMode && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                                {tx.branchName}
                              </span>
                            )}
                          </div>
                          {isOnHold && tx.holdReason ? (
                            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1 mt-0.5">
                              <AlertCircle className="w-3 h-3 flex-shrink-0" />
                              <span>{tx.holdReason}</span>
                            </p>
                          ) : (
                            <p className="text-[11px] text-neutral-400 mt-0.5">
                              Verified at {tx.timestamp}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-black text-neutral-900 dark:text-white block">
                          +{fmt(tx.amount)}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                          isOnHold
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                        }`}>
                          {isOnHold ? 'ON HOLD' : 'CLEARED'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Close Overview
          </button>
        </div>

      </div>
    </div>
  );
};

