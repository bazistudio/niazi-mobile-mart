import React, { useState } from 'react';
import { Smartphone, Landmark, ChevronRight, Plus, RefreshCw, AlertCircle, Building2, Eye, EyeOff } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { accountsApi, BusinessAccount } from '@/services/accounts.api';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { RegisterAccountModal } from './RegisterAccountModal';
import { AccountTransactionsModal } from './AccountTransactionsModal';

interface BusinessAccountsStripProps {
  isAdminAllBranchesMode?: boolean;
  currentBranchId?: string | null;
  currentBranchName?: string | null;
}

const COLOR_SCHEME: Record<string, { bg: string; border: string; text: string }> = {
  JAZZCASH:  { bg: 'bg-amber-50 dark:bg-amber-950/40',   border: 'border-amber-200 dark:border-amber-800',   text: 'text-amber-700 dark:text-amber-300'   },
  EASYPAISA: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300' },
  BANK:      { bg: 'bg-blue-50 dark:bg-blue-950/40',     border: 'border-blue-200 dark:border-blue-800',     text: 'text-blue-700 dark:text-blue-300'     },
};

const TYPE_LABEL: Record<string, string> = {
  JAZZCASH: 'JazzCash',
  EASYPAISA: 'Easypaisa',
  BANK: 'Bank',
};

const fmtPkr = (val: number) =>
  `PKR ${val.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

const AccountCard: React.FC<{
  account: BusinessAccount;
  onSelect: (account: BusinessAccount) => void;
}> = ({ account, onSelect }) => {
  const [showFull, setShowFull] = useState(false);
  const scheme = COLOR_SCHEME[account.account_type] ?? COLOR_SCHEME['BANK']!;
  const isBank = account.account_type === 'BANK';
  const Icon = isBank ? Landmark : Smartphone;
  const displayNumber = showFull ? account.account_number : account.account_number_masked;

  return (
    <div
      className={`p-3 rounded-xl border transition-all cursor-pointer hover:shadow-md flex flex-col justify-between ${scheme.bg} ${scheme.border} group`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(account)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(account); }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <div className="p-1.5 rounded-lg bg-white/80 dark:bg-neutral-800/80 shadow-2xs">
            <Icon className={`w-3.5 h-3.5 ${scheme.text}`} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-neutral-900 dark:text-white leading-tight truncate max-w-[120px]">
              {account.name}
            </span>
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
              {TYPE_LABEL[account.account_type] ?? account.account_type}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!account.is_active && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400">
              INACTIVE
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>

      {/* Account number row with reveal toggle */}
      <div className="flex items-center gap-1 mb-2">
        <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 flex-1 truncate">
          {displayNumber}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowFull((p) => !p); }}
          className="p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          title={showFull ? 'Hide account number' : 'Reveal full account number'}
        >
          {showFull ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </button>
      </div>

      {/* Balance row */}
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium">Balance:</span>
        <span className="text-sm font-black text-neutral-900 dark:text-white tabular-nums tracking-tight">
          {fmtPkr(account.current_balance)}
        </span>
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-neutral-200/50 dark:border-neutral-700/50 flex items-center justify-between text-[10px] mt-1">
        <span className="text-neutral-400 italic">Opening: {fmtPkr(account.opening_balance)}</span>
        <span className="text-[10px] font-semibold text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors">
          Statement →
        </span>
      </div>
    </div>
  );
};

export const BusinessAccountsStrip: React.FC<BusinessAccountsStripProps> = ({
  isAdminAllBranchesMode,
  // currentBranchId and currentBranchName reserved for Phase 2 branch-scoped filtering
}) => {
  const [selectedAccount, setSelectedAccount] = useState<BusinessAccount | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const {
    data: accounts,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.accounts.all,
    queryFn: () => accountsApi.listAccounts(),
    staleTime: 60_000,
    enabled: isAdminAllBranchesMode === true || isAdminAllBranchesMode === undefined,
  });

  return (
    <>
      <div className="flex flex-col gap-3 w-full">
        {/* Section header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Organization Business Accounts
            </span>
            {isFetching && !isLoading && (
              <RefreshCw className="w-3 h-3 text-neutral-400 animate-spin" />
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowRegisterModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Register Account
          </button>
        </div>

        {/* Summary card — total balance across all accounts */}
        {!isLoading && !isError && accounts && accounts.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400">
                All Branches / Branch Sent
              </span>
              <span className="text-lg font-black tabular-nums text-blue-900 dark:text-blue-100">
                {fmtPkr(accounts.reduce((sum, acc) => sum + acc.current_balance, 0))}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                {accounts.length} account{accounts.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}

        {/* Phase 1 POS sync notice */}
        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Opening balances recorded. POS digital-payment synchronization is not yet implemented —
            JazzCash, Easypaisa and bank POS collections are not reflected in these balances.
          </p>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-neutral-400">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            <span className="text-sm">Loading accounts…</span>
          </div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <div className="flex items-center gap-3 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl">
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <p className="text-xs text-rose-700 dark:text-rose-400 flex-1">
              {(error as Error)?.message || 'Failed to load business accounts.'}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-xs font-medium text-rose-700 dark:text-rose-400 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && accounts?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl text-neutral-400">
            <Building2 className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm font-medium">No business accounts registered yet.</p>
            <p className="text-xs mt-1">Click "Register Account" to add your first account.</p>
          </div>
        )}

        {/* Account cards */}
        {!isLoading && !isError && accounts && accounts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
            {accounts.map((acc) => (
              <AccountCard
                key={acc.id}
                account={acc}
                onSelect={setSelectedAccount}
              />
            ))}
          </div>
        )}
      </div>

      {/* Account statement modal */}
      <AccountTransactionsModal
        isOpen={!!selectedAccount}
        onClose={() => setSelectedAccount(null)}
        account={selectedAccount}
      />

      {/* Register account modal */}
      <RegisterAccountModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
      />
    </>
  );
};
