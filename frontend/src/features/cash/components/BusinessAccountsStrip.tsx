import React, { useState } from 'react';
import { Smartphone, Landmark, Clock, ChevronRight } from 'lucide-react';
import { BusinessAccountSummary } from '../types/business-accounts.types';
import { getBusinessAccountsSummary } from '../data/mock-business-accounts';
import { AccountTransactionsModal } from './AccountTransactionsModal';

interface BusinessAccountsStripProps {
  currentBranchId?: string | null;
  currentBranchName?: string | null;
  isAdminAllBranchesMode?: boolean;
}

const fmt = (val: number) =>
  `PKR ${val.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

export const BusinessAccountsStrip: React.FC<BusinessAccountsStripProps> = ({
  currentBranchId,
  currentBranchName,
  isAdminAllBranchesMode,
}) => {
  const [selectedAccount, setSelectedAccount] = useState<BusinessAccountSummary | null>(null);

  const accounts = getBusinessAccountsSummary(currentBranchId, currentBranchName);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        {accounts.map((acc) => {
          const isBank = acc.provider === 'BANK';
          const Icon = isBank ? Landmark : Smartphone;
          const hasOnHold = acc.onHoldCount > 0;

          return (
            <div
              key={acc.provider}
              onClick={() => setSelectedAccount(acc)}
              role="button"
              tabIndex={0}
              className={`p-3 rounded-xl border transition-all cursor-pointer hover:shadow-md flex flex-col justify-between ${acc.colorScheme.bg} ${acc.colorScheme.border} group`}
            >
              {/* Account Title & Icon */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <div className={`p-1.5 rounded-lg bg-white/80 dark:bg-neutral-800/80 shadow-2xs`}>
                    <Icon className={`w-3.5 h-3.5 ${acc.colorScheme.text}`} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-neutral-900 dark:text-white leading-tight">
                      {acc.name}
                    </span>
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                      {acc.accountNumberMasked}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
              </div>

              {/* Total Sent Amount */}
              <div className="my-1">
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                    {isAdminAllBranchesMode ? 'All Branches:' : 'Branch Sent:'}
                  </span>
                  <span className="text-base font-black text-neutral-900 dark:text-white tabular-nums tracking-tight">
                    {fmt(acc.totalSent)}
                  </span>
                </div>
              </div>

              {/* On-Hold Status Tag */}
              <div className="pt-2 border-t border-neutral-200/50 dark:border-neutral-700/50 flex items-center justify-between text-[10px]">
                {hasOnHold ? (
                  <span className="inline-flex items-center gap-1 font-bold text-amber-700 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-md">
                    <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
                    <span>On Hold: {fmt(acc.onHoldAmount)} ({acc.onHoldCount})</span>
                  </span>
                ) : (
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    All Cleared
                  </span>
                )}
                <span className="text-[10px] font-semibold text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors">
                  Details →
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Account Details Modal */}
      <AccountTransactionsModal
        isOpen={!!selectedAccount}
        onClose={() => setSelectedAccount(null)}
        account={selectedAccount}
        currentBranchName={currentBranchName}
        isAdminAllBranchesMode={isAdminAllBranchesMode}
      />
    </>
  );
};

