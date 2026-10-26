import React, { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  useCashStore,
  CashSessionActiveCard,
  CashSessionOpenModal,
  CashSessionCloseModal,
  CashAdjustmentModal,
  CashMovementsTable,
  CashSessionHistoryTable,
} from '@/features/cash';
import { CashVoucherModal } from '@/features/cash/components/CashVoucherModal';
import { ExpenseCreateModal } from '@/features/expenses/components/ExpenseCreateModal';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { cashApi } from '@/services/cash.api';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { OrgBranchCashSummary } from '@/lib/tauri/tauriClient';
import {
  Coins,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Building2,
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  Search,
  Check,
  ChevronDown,
  Store,
} from 'lucide-react';

// ─── PKR currency formatter (matches project conventions) ─────────────────────
const fmt = (val: number | null | undefined): string =>
  `PKR ${(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

// ─── Session status badge ────────────────────────────────────────────────────
const SessionBadge: React.FC<{ status: string }> = ({ status }) => {
  if (status === 'OPEN') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Open
      </span>
    );
  }
  if (status === 'CLOSED') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        Closed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
      No Session
    </span>
  );
};

// ─── Single branch row in the org overview grid ───────────────────────────────
const BranchCashRow: React.FC<{
  branch: OrgBranchCashSummary;
  isSelected?: boolean;
  onDrillDown: (branchId: string) => void;
}> = ({ branch, isSelected, onDrillDown }) => {
  const hasSession = branch.session_status !== 'NONE';
  return (
    <tr
      className={`border-b border-neutral-100 dark:border-neutral-800 transition-colors ${
        isSelected
          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 font-medium'
          : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
      }`}
    >
      <td className="py-3 pl-4 pr-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-neutral-900 dark:text-white text-sm">
              {branch.branch_name}
            </span>
            {isSelected && (
              <span className="text-[10px] px-1.5 py-0.2 bg-emerald-600 text-white rounded font-normal">
                Active
              </span>
            )}
          </div>
          <span className="text-xs text-neutral-400">{branch.branch_code}</span>
        </div>
      </td>
      <td className="py-3 px-2 text-center">
        <SessionBadge status={branch.session_status} />
      </td>
      <td className="py-3 px-2 text-right text-sm text-neutral-700 dark:text-neutral-300">
        {hasSession ? fmt(branch.opening_cash) : <span className="text-neutral-400">—</span>}
      </td>
      <td className="py-3 px-2 text-right text-sm">
        {hasSession ? (
          <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center justify-end gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            {fmt(branch.total_cash_in)}
          </span>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>
      <td className="py-3 px-2 text-right text-sm">
        {hasSession ? (
          <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center justify-end gap-1">
            <TrendingDown className="w-3.5 h-3.5" />
            {fmt(branch.total_cash_out)}
          </span>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>
      <td className="py-3 px-2 text-right text-sm font-semibold text-neutral-900 dark:text-white">
        {branch.session_status === 'OPEN'
          ? fmt(branch.expected_closing_cash)
          : branch.session_status === 'CLOSED' && branch.actual_closing_cash != null
          ? fmt(branch.actual_closing_cash)
          : <span className="text-neutral-400">—</span>}
      </td>
      <td className="py-3 pl-2 pr-4 text-right">
        {branch.error ? (
          <span className="text-xs text-rose-500 dark:text-rose-400">Error</span>
        ) : (
          <button
            type="button"
            onClick={() => onDrillDown(branch.branch_id)}
            className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium transition-colors"
          >
            {isSelected ? 'Viewing' : 'View Details'}
          </button>
        )}
      </td>
    </tr>
  );
};

// ─── Searchable Branch Selector & Quick Cards Strip (matches User Design) ──────
interface BranchQuickSelectorProps {
  branches: OrgBranchCashSummary[];
  selectedBranchId: string | null;
  onSelectBranch: (branchId: string | null) => void;
  isLoading?: boolean;
}

const BranchQuickSelector: React.FC<BranchQuickSelectorProps> = ({
  branches,
  selectedBranchId,
  onSelectBranch,
  isLoading,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const filteredBranches = useMemo(() => {
    if (!searchTerm.trim()) return branches;
    const lower = searchTerm.toLowerCase();
    return branches.filter(
      (b) =>
        b.branch_name.toLowerCase().includes(lower) ||
        b.branch_code.toLowerCase().includes(lower)
    );
  }, [branches, searchTerm]);

  const activeBranch = branches.find((b) => b.branch_id === selectedBranchId);

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full">
      {/* Search & Select Branch dropdown control */}
      <div className="relative shrink-0">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-neutral-400">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (!isDropdownOpen) setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            placeholder="Search branch name / code…"
            className="pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent w-full sm:w-56 transition-all"
          />
          <button
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="absolute inset-y-0 right-0 pr-2 flex items-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Dropdown menu */}
        {isDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={() => setIsDropdownOpen(false)}
            />
            <div className="absolute left-0 top-full mt-1 w-64 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-lg z-30 max-h-60 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  onSelectBranch(null);
                  setIsDropdownOpen(false);
                  setSearchTerm('');
                }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                  !selectedBranchId ? 'text-emerald-600 font-semibold bg-emerald-50/50 dark:bg-emerald-950/20' : 'text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <span>🏢 All Branches Overview</span>
                {!selectedBranchId && <Check className="w-3.5 h-3.5 text-emerald-600" />}
              </button>
              {isLoading ? (
                <div className="p-3 text-center text-xs text-neutral-400">Loading branches…</div>
              ) : filteredBranches.length === 0 ? (
                <div className="p-3 text-center text-xs text-neutral-400">No matching branches</div>
              ) : (
                filteredBranches.map((b) => (
                  <button
                    key={b.branch_id}
                    type="button"
                    onClick={() => {
                      onSelectBranch(b.branch_id);
                      setIsDropdownOpen(false);
                      setSearchTerm('');
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                      selectedBranchId === b.branch_id
                        ? 'text-emerald-600 font-semibold bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{b.branch_name}</span>
                      <span className="text-[10px] text-neutral-400">{b.branch_code}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <SessionBadge status={b.session_status} />
                      {selectedBranchId === b.branch_id && (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Dynamic branch cards / pills row matching the user's sketch */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-full custom-scrollbar">
        {/* All Branches pill */}
        <button
          type="button"
          onClick={() => onSelectBranch(null)}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
            !selectedBranchId
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700 hover:border-emerald-500'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>All Branches</span>
        </button>

        {/* Dynamic branches */}
        {filteredBranches.map((b) => {
          const isSelected = selectedBranchId === b.branch_id;
          return (
            <button
              key={b.branch_id}
              type="button"
              onClick={() => onSelectBranch(b.branch_id)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-2 ${
                isSelected
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white shadow-sm ring-2 ring-emerald-500 ring-offset-1'
                  : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600'
              }`}
            >
              <Store className="w-3.5 h-3.5 opacity-70" />
              <span className="truncate max-w-[120px]">{b.branch_name}</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  b.session_status === 'OPEN'
                    ? 'bg-emerald-500'
                    : b.session_status === 'CLOSED'
                    ? 'bg-neutral-400'
                    : 'bg-amber-400'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── CMA-3/6: Organization Admin — All Branches Overview ────────────────────────
const OrgCashOverview: React.FC<{
  onSelectBranch: (branchId: string) => void;
}> = ({ onSelectBranch }) => {
  const {
    data: orgSummary,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.cash.orgSummary,
    queryFn: () => cashApi.getOrganizationSummary(),
    staleTime: 30_000,
  });

  const totals = orgSummary?.org_totals;
  const errorBranches = orgSummary?.branches?.filter((b) => b.error != null) ?? [];

  return (
    <div className="flex flex-col gap-6 sm:gap-8 w-full max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
                Cash Management — All Branches
              </h1>
              {orgSummary && (
                <p className="mt-0.5 text-xs text-neutral-400">
                  Generated {new Date(orgSummary.generated_at).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Organization-wide cash session status and daily totals across all retail branches.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Searchable branch selector bar */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 shadow-sm">
        <BranchQuickSelector
          branches={orgSummary?.branches ?? []}
          selectedBranchId={null}
          onSelectBranch={(id) => {
            if (id) onSelectBranch(id);
          }}
          isLoading={isLoading}
        />
      </div>

      {/* Prominent partial-data warning when one or more branches have errors */}
      {errorBranches.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">
              Partial Data Warning: Incomplete Organization Totals
            </p>
            <p className="text-xs mt-0.5 text-amber-700 dark:text-amber-400">
              Data could not be retrieved for {errorBranches.length}{' '}
              {errorBranches.length === 1 ? 'branch' : 'branches'}:{' '}
              <span className="font-medium">
                {errorBranches.map((b) => `${b.branch_name} (${b.branch_code})`).join(', ')}
              </span>
              . The totals below represent only the responding branches and are not complete.
            </p>
          </div>
        </div>
      )}

      {/* Organization-wide totals summary strip */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Open Sessions</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {totals.open_session_count}
            </p>
          </div>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Total Cash In</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 truncate">
              {fmt(totals.total_cash_in)}
            </p>
          </div>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Total Cash Out</p>
            <p className="text-lg font-bold text-rose-600 dark:text-rose-400 truncate">
              {fmt(totals.total_cash_out)}
            </p>
          </div>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
              Expected Cash {errorBranches.length > 0 ? '(partial)' : '(org)'}
            </p>
            <p className="text-lg font-bold text-neutral-900 dark:text-white truncate">
              {fmt(totals.total_expected_cash)}
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-medium text-sm">Failed to load organization summary</p>
            <p className="text-xs mt-0.5">{(error as Error)?.message ?? 'Unknown error'}</p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="ml-auto text-xs font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Branch table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <h2 className="font-semibold text-neutral-900 dark:text-white text-sm">
            Branch Cash Sessions
          </h2>
          <span className="text-xs text-neutral-400">
            {orgSummary?.branches?.length ?? 0} Retail Branches
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-neutral-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Loading branch summaries…</span>
          </div>
        ) : orgSummary?.branches?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
            <Building2 className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">No retail branches found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40">
                  <th className="py-2.5 pl-4 pr-2">Branch</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                  <th className="py-2.5 px-2 text-right">Opening</th>
                  <th className="py-2.5 px-2 text-right">Cash In</th>
                  <th className="py-2.5 px-2 text-right">Cash Out</th>
                  <th className="py-2.5 px-2 text-right">Current Cash</th>
                  <th className="py-2.5 pl-2 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {orgSummary?.branches.map((branch) => (
                  <BranchCashRow
                    key={branch.branch_id}
                    branch={branch}
                    onDrillDown={onSelectBranch}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Branch-specific view with Searchable Branch Selector (matches screenshot) ──
interface BranchCashViewProps {
  explicitBranchId?: string;
  onReturnToAllBranches?: () => void;
  onSelectBranch?: (branchId: string | null) => void;
}

const BranchCashView: React.FC<BranchCashViewProps> = ({
  explicitBranchId,
  onReturnToAllBranches,
  onSelectBranch,
}) => {
  const user = useAuthStore((s) => s.user);
  const isOrgAdmin = user?.role === 'ADMIN';
  const activeShopId = useOrganizationStore((s) => s.activeShopId || s.activeShop?._id);
  const activeShop = useOrganizationStore((s) => s.activeShop);
  const effectiveBranchId = explicitBranchId || activeShopId || undefined;

  const { fetchCurrentState, isLoading } = useCashStore();

  const [isOpenModalActive, setIsOpenModalActive] = useState(false);
  const [isCloseModalActive, setIsCloseModalActive] = useState(false);
  const [isAdjustmentModalActive, setIsAdjustmentModalActive] = useState(false);
  const [isReceivePaymentModalActive, setIsReceivePaymentModalActive] = useState(false);
  const [isExpenseModalActive, setIsExpenseModalActive] = useState(false);
  const [isSupplierPaymentModalActive, setIsSupplierPaymentModalActive] = useState(false);

  // Fetch organization branches so Admin can switch branches right from this view
  const { data: orgSummary, isLoading: isOrgSummaryLoading } = useQuery({
    queryKey: queryKeys.cash.orgSummary,
    queryFn: () => cashApi.getOrganizationSummary(),
    enabled: isOrgAdmin,
    staleTime: 30_000,
  });

  useEffect(() => {
    fetchCurrentState(effectiveBranchId);
  }, [fetchCurrentState, effectiveBranchId]);

  const handleVoucherSuccess = () => {
    fetchCurrentState(effectiveBranchId);
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8 w-full max-w-7xl mx-auto pb-12">
      {/* Return to All Branches navigation bar for Org Admins */}
      {isOrgAdmin && onReturnToAllBranches && (
        <div className="flex items-center justify-between pb-2 border-b border-neutral-200/60 dark:border-neutral-800">
          <button
            type="button"
            onClick={onReturnToAllBranches}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to All Branches Cash Overview</span>
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Coins className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
                Cash Management & Daily Closing
              </h1>
              {effectiveBranchId && (
                <p className="mt-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {orgSummary?.branches?.find((b) => b.branch_id === effectiveBranchId)?.branch_name ||
                    activeShop?.name ||
                    'Branch Cash Drawer'}
                </p>
              )}
            </div>
          </div>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Authoritative physical cash drawer sessions, daily closings, and real-time reconciliation.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchCurrentState(effectiveBranchId)}
          disabled={isLoading}
          className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Active Cash Session Card with embedded branch selector header */}
      <CashSessionActiveCard
        branchSelector={
          isOrgAdmin && onSelectBranch && orgSummary?.branches ? (
            <BranchQuickSelector
              branches={orgSummary.branches}
              selectedBranchId={effectiveBranchId || null}
              onSelectBranch={onSelectBranch}
              isLoading={isOrgSummaryLoading}
            />
          ) : undefined
        }
        onOpenSession={() => setIsOpenModalActive(true)}
        onCloseSession={() => setIsCloseModalActive(true)}
        onAdjustment={() => setIsAdjustmentModalActive(true)}
        onReceivePayment={() => setIsReceivePaymentModalActive(true)}
        onAddExpense={() => setIsExpenseModalActive(true)}
        onPaySupplier={() => setIsSupplierPaymentModalActive(true)}
      />

      <div className="space-y-4">
        <CashMovementsTable />
      </div>

      <div className="space-y-4">
        <CashSessionHistoryTable />
      </div>

      <CashSessionOpenModal
        isOpen={isOpenModalActive}
        onClose={() => setIsOpenModalActive(false)}
      />
      <CashSessionCloseModal
        isOpen={isCloseModalActive}
        onClose={() => setIsCloseModalActive(false)}
      />
      <CashAdjustmentModal
        isOpen={isAdjustmentModalActive}
        onClose={() => setIsAdjustmentModalActive(false)}
      />
      <CashVoucherModal
        isOpen={isReceivePaymentModalActive}
        onClose={() => {
          setIsReceivePaymentModalActive(false);
          handleVoucherSuccess();
        }}
        voucherType="receive_payment"
      />
      <ExpenseCreateModal
        isOpen={isExpenseModalActive}
        onClose={() => {
          setIsExpenseModalActive(false);
          handleVoucherSuccess();
        }}
      />
      <CashVoucherModal
        isOpen={isSupplierPaymentModalActive}
        onClose={() => {
          setIsSupplierPaymentModalActive(false);
          handleVoucherSuccess();
        }}
        voucherType="pay_supplier"
      />
    </div>
  );
};

// ─── Root page: routes to Org overview OR branch view dynamically ──────────────
export const CashManagementPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const activeOrganizationId = useOrganizationStore((s) => s.activeOrganizationId);
  const activeShopId = useOrganizationStore((s) => s.activeShopId || s.activeShop?._id);
  const setActiveContext = useOrganizationStore((s) => s.setActiveContext);
  const setActiveShop = useOrganizationStore((s) => s.setActiveShop);

  const isOrgAdmin = user?.role === 'ADMIN';

  // Explicit state for currently focused branch drill-down when on organization route
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // If user is on an organization route or has viewMode === 'organization', they are in Org context.
  const isOrgRoute = location.pathname.startsWith('/dashboard/organization');

  // Handle branch selection from cards or dropdown
  const handleSelectBranch = (branchId: string | null) => {
    setSelectedBranchId(branchId);
    if (branchId) {
      setActiveContext(activeOrganizationId, branchId);
    } else {
      setActiveContext(activeOrganizationId || '00000000-0000-0000-0000-000000000001', null);
      setActiveShop(null);
    }
  };

  const handleReturnToAll = () => {
    setSelectedBranchId(null);
    setActiveContext(activeOrganizationId || '00000000-0000-0000-0000-000000000001', null);
    setActiveShop(null);
  };

  // 1. Branch-scoped users (CASHIER, SHOP_ADMIN, etc.) always see their own branch view
  if (!isOrgAdmin) {
    return <BranchCashView />;
  }

  // 2. Organization Admin on Organization Route:
  // If no branch is explicitly selected, display the full All Branches Overview.
  // If a branch is selected, display that branch's live session drawer with the quick switcher and back link.
  if (isOrgRoute) {
    if (!selectedBranchId) {
      return <OrgCashOverview onSelectBranch={handleSelectBranch} />;
    }
    return (
      <BranchCashView
        explicitBranchId={selectedBranchId}
        onReturnToAllBranches={handleReturnToAll}
        onSelectBranch={handleSelectBranch}
      />
    );
  }

  // 3. Organization Admin on Shop Route (/dashboard/shop-admin/cash):
  // Renders BranchCashView with active shop context, and lets Org Admin switch branches or return to all.
  return (
    <BranchCashView
      explicitBranchId={activeShopId || undefined}
      onReturnToAllBranches={handleReturnToAll}
      onSelectBranch={handleSelectBranch}
    />
  );
};
