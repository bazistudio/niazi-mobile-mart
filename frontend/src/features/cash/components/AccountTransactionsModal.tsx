import React, { useState } from 'react';
import { X, Landmark, Smartphone, RefreshCw, AlertCircle, ChevronLeft, ChevronRight as ChevronRightIcon, ArrowDownLeft, ArrowUpRight, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { accountsApi, BusinessAccount, LedgerEntry } from '@/services/accounts.api';
import { queryKeys } from '@/lib/react-query/queryKeys';

interface AccountTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: BusinessAccount | null;
}

const COLOR_SCHEME: Record<string, { bg: string; border: string; text: string }> = {
  JAZZCASH:  { bg: 'bg-amber-50 dark:bg-amber-950/40',   border: 'border-amber-200 dark:border-amber-800',   text: 'text-amber-700 dark:text-amber-300'   },
  EASYPAISA: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300' },
  BANK:      { bg: 'bg-blue-50 dark:bg-blue-950/40',     border: 'border-blue-200 dark:border-blue-800',     text: 'text-blue-700 dark:text-blue-300'     },
};

const ENTRY_TYPE_LABEL: Record<string, string> = {
  OPENING_BALANCE: 'Opening Balance',
};

const fmtPkr = (val: number) =>
  `PKR ${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-PK', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const LedgerRow: React.FC<{ entry: LedgerEntry }> = ({ entry }) => {
  const isIn = entry.direction === 'IN';
  return (
    <tr className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors">
      <td className="py-2.5 pl-4 pr-2 text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
        {fmtDate(entry.created_at)}
      </td>
      <td className="py-2.5 px-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
        {ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type}
      </td>
      <td className="py-2.5 px-2 text-xs text-center">
        <span className={`inline-flex items-center gap-1 font-semibold ${isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {isIn ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
          {isIn ? 'IN' : 'OUT'}
        </span>
      </td>
      <td className={`py-2.5 px-2 text-right text-sm font-bold ${isIn ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'} whitespace-nowrap`}>
        {isIn ? '+' : '-'}{fmtPkr(entry.amount)}
      </td>
      <td className="py-2.5 px-2 text-right text-xs font-semibold text-neutral-900 dark:text-white whitespace-nowrap">
        {fmtPkr(entry.balance_after)}
      </td>
      <td className="py-2.5 pl-2 pr-4 text-xs text-neutral-400 max-w-[160px] truncate">
        {entry.description || entry.reference_number || '—'}
      </td>
    </tr>
  );
};

const PAGE_SIZE = 20;

export const AccountTransactionsModal: React.FC<AccountTransactionsModalProps> = ({
  isOpen,
  onClose,
  account,
}) => {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: queryKeys.accounts.statement(account?.id ?? ''),
    queryFn: () => accountsApi.getStatement(account!.id, page, PAGE_SIZE),
    enabled: isOpen && !!account?.id,
    staleTime: 30_000,
  });

  // Reset page when account changes
  React.useEffect(() => { setPage(1); }, [account?.id]);

  if (!isOpen || !account) return null;

  const scheme = COLOR_SCHEME[account.account_type] ?? COLOR_SCHEME['BANK']!;
  const isBank = account.account_type === 'BANK';
  const Icon = isBank ? Landmark : Smartphone;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs select-none">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-neutral-200 dark:border-neutral-800 flex flex-col max-h-[88vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${scheme.bg} ${scheme.border}`}>
              <Icon className={`w-5 h-5 ${scheme.text}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  {account.name}
                </h3>
                {isFetching && !isLoading && (
                  <RefreshCw className="w-3.5 h-3.5 text-neutral-400 animate-spin" />
                )}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {account.account_holder_name} · {account.account_number_masked}
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

        {/* Summary metrics */}
        <div className="grid grid-cols-3 gap-3 p-5 border-b border-neutral-100 dark:border-neutral-800">
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-700/60">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block mb-1">
              Opening Balance
            </span>
            <span className="text-base font-extrabold text-neutral-900 dark:text-white">
              {fmtPkr(account.opening_balance)}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block mb-1">
              Current Balance
            </span>
            <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400">
              {data ? fmtPkr(data.account.current_balance) : fmtPkr(account.current_balance)}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-700/60">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block mb-1">
              Transactions
            </span>
            <span className="text-base font-extrabold text-neutral-900 dark:text-white">
              {data?.total ?? '—'}
            </span>
          </div>
        </div>

        {/* Phase 1 notice */}
        <div className="mx-5 mt-4 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Opening balance only. POS digital-payment synchronization is not yet implemented.
          </p>
        </div>

        {/* Ledger entries table */}
        <div className="overflow-y-auto flex-1 px-5 pb-2 mt-3">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-neutral-400">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              <span className="text-sm">Loading statement…</span>
            </div>
          )}
          {isError && !isLoading && (
            <div className="flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl">
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <p className="text-xs text-rose-700 dark:text-rose-400">
                {(error as Error)?.message || 'Failed to load statement.'}
              </p>
            </div>
          )}
          {!isLoading && !isError && data && (
            <>
              {data.entries.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl text-neutral-400">
                  <p className="text-sm">No ledger entries recorded yet.</p>
                  {account.opening_balance === 0 && (
                    <p className="text-xs mt-1">Opening balance was zero — no entry created.</p>
                  )}
                </div>
              ) : (
                <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-semibold border-b border-neutral-200 dark:border-neutral-700 uppercase tracking-wide">
                      <tr>
                        <th className="py-2.5 pl-4 pr-2">Date</th>
                        <th className="py-2.5 px-2">Type</th>
                        <th className="py-2.5 px-2 text-center">Dir</th>
                        <th className="py-2.5 px-2 text-right">Amount</th>
                        <th className="py-2.5 px-2 text-right">Balance After</th>
                        <th className="py-2.5 pl-2 pr-4">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.entries.map((entry) => (
                        <LedgerRow key={entry.id} entry={entry} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer: pagination + close */}
        <div className="px-6 py-3 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 flex items-center justify-between gap-3">
          {/* Pagination */}
          {data && data.total > PAGE_SIZE ? (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>Page {page} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
