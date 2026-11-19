import React from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Landmark, ChevronRight } from 'lucide-react';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { formatPkr } from '../../utils/dashboardDates';
import type {
  LiquidPositionAnalytics,
  PartyFinancialPosition,
} from '../../utils/dashboardCalculations';

interface FinancialPositionSectionProps {
  mode: 'organization' | 'branch';
  canViewParties: boolean;
  canViewPurchases: boolean;
  canViewCash: boolean;
  canViewAccounts: boolean;
  partyPosition: PartyFinancialPosition;
  liquidPosition: LiquidPositionAnalytics;
  partiesLoading: boolean;
  liquidLoading: boolean;
  onNavigate: (href: string) => void;
}

export const FinancialPositionSection: React.FC<FinancialPositionSectionProps> = ({
  mode,
  canViewParties,
  canViewPurchases,
  canViewCash,
  canViewAccounts,
  partyPosition,
  liquidPosition,
  partiesLoading,
  liquidLoading,
  onNavigate,
}) => {
  if (!canViewParties && !canViewPurchases && !canViewCash) return null;

  const base = mode === 'organization' ? '/dashboard/organization' : '/dashboard/shop-admin';
  const supplierDest =
    mode === 'organization' ? '/dashboard/organization/ledger' : '/dashboard/shop-admin/suppliers';

  return (
    <section aria-labelledby="financial-pos-heading" className="space-y-3">
      <DashboardSectionHeader
        headingId="financial-pos-heading"
        title="Financial Position & Liquidity"
        subtitle="Customer DR receivables vs CR advances, supplier payables, drawer cash, and bank accounts (never mixed)"
        actionLabel={mode === 'organization' ? 'Open Ledger' : 'Cash Management'}
        onAction={() => onNavigate(`${base}/${mode === 'organization' ? 'ledger' : 'cash'}`)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Column 1: Customer Position */}
        {canViewParties && (
          <div className="bg-surface rounded-lg border border-border shadow-xs flex flex-col justify-between">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <ArrowDownToLine className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-text-primary">Customer Position</h3>
                  <p className="text-[11px] text-text-muted">Organization-wide credit & advances</p>
                </div>
              </div>
              {partyPosition.isCustomerListTruncated && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700">
                  Top 500
                </span>
              )}
            </div>

            <div className="p-4 space-y-3 flex-1">
              {partiesLoading ? (
                <div className="h-32 bg-surface-hover/50 rounded animate-pulse" />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-md bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-900/40 p-2.5">
                      <p className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">
                        Receivables (DR)
                      </p>
                      <p className="text-base font-extrabold text-text-primary tabular-nums mt-0.5">
                        {formatPkr(partyPosition.customerReceivables)}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {partyPosition.customerDebtorCount} customer(s) owe
                      </p>
                    </div>
                    <div className="rounded-md bg-surface-hover/70 border border-border p-2.5">
                      <p className="text-[10px] font-bold uppercase text-text-muted">
                        Advances (CR)
                      </p>
                      <p className="text-base font-extrabold text-text-primary tabular-nums mt-0.5">
                        {formatPkr(partyPosition.customerAdvances)}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {partyPosition.customerAdvanceCount} credit balance (liability)
                      </p>
                    </div>
                  </div>

                  {partyPosition.topDebtors.length > 0 && (
                    <div className="pt-2 border-t border-border/70">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                        Highest Customer Balances
                      </p>
                      <div className="space-y-1.5">
                        {partyPosition.topDebtors.slice(0, 3).map((d) => (
                          <div key={d.id} className="flex items-center justify-between text-xs">
                            <span className="text-text-secondary truncate max-w-[60%]">
                              {d.name} <span className="text-text-muted">({d.code})</span>
                            </span>
                            <span className="font-bold text-text-primary tabular-nums">
                              {formatPkr(d.balance)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-border bg-surface-hover/40 flex justify-between items-center text-xs rounded-b-lg">
              <span className="text-text-muted">Advances excluded from sales</span>
              <button
                type="button"
                onClick={() => onNavigate(`${base}/customers`)}
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline cursor-pointer"
              >
                Customer Ledger <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Column 2: Supplier Position */}
        {canViewPurchases && (
          <div className="bg-surface rounded-lg border border-border shadow-xs flex flex-col justify-between">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <ArrowUpFromLine className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-text-primary">Supplier Position</h3>
                  <p className="text-[11px] text-text-muted">Vendor liabilities & advance prepayments</p>
                </div>
              </div>
              {partyPosition.isSupplierListTruncated && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700">
                  Top 500
                </span>
              )}
            </div>

            <div className="p-4 space-y-3 flex-1">
              {partiesLoading ? (
                <div className="h-32 bg-surface-hover/50 rounded animate-pulse" />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-md bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/40 p-2.5">
                      <p className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300">
                        Payables Owed
                      </p>
                      <p className="text-base font-extrabold text-text-primary tabular-nums mt-0.5">
                        {formatPkr(partyPosition.supplierPayables)}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {partyPosition.supplierCreditorCount} vendor(s) payable
                      </p>
                    </div>
                    <div className="rounded-md bg-surface-hover/70 border border-border p-2.5">
                      <p className="text-[10px] font-bold uppercase text-text-muted">
                        Vendor Advances
                      </p>
                      <p className="text-base font-extrabold text-text-primary tabular-nums mt-0.5">
                        {formatPkr(partyPosition.supplierAdvances)}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {partyPosition.supplierAdvanceCount} prepaid account(s)
                      </p>
                    </div>
                  </div>

                  {partyPosition.topCreditors.length > 0 && (
                    <div className="pt-2 border-t border-border/70">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                        Largest Vendor Liabilities
                      </p>
                      <div className="space-y-1.5">
                        {partyPosition.topCreditors.slice(0, 3).map((c) => (
                          <div key={c.id} className="flex items-center justify-between text-xs">
                            <span className="text-text-secondary truncate max-w-[60%]">
                              {c.name} <span className="text-text-muted">({c.code})</span>
                            </span>
                            <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                              {formatPkr(c.balance)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-border bg-surface-hover/40 flex justify-between items-center text-xs rounded-b-lg">
              <span className="text-text-muted">SUM(debit) − SUM(credit)</span>
              <button
                type="button"
                onClick={() => onNavigate(supplierDest)}
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline cursor-pointer"
              >
                Supplier Ledger <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Column 3: Cash & Business Bank Position */}
        {canViewCash && (
          <div className="bg-surface rounded-lg border border-border shadow-xs flex flex-col justify-between">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Landmark className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-text-primary">Cash & Liquid Funds</h3>
                  <p className="text-[11px] text-text-muted">
                    {canViewAccounts ? 'Drawers + Business Bank/Wallet accounts' : 'Branch cash register'}
                  </p>
                </div>
              </div>
              <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {formatPkr(liquidPosition.totalLiquidFunds)}
              </span>
            </div>

            <div className="p-4 space-y-3 flex-1">
              {liquidLoading ? (
                <div className="h-32 bg-surface-hover/50 rounded animate-pulse" />
              ) : (
                <>
                  <div className="rounded-md bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40 p-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">
                        Cash in Drawers
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {liquidPosition.singleBranchStatus
                          ? `Status: ${liquidPosition.singleBranchStatus} • Float ${formatPkr(liquidPosition.singleBranchOpeningCash)}`
                          : `${liquidPosition.openSessions} open • ${liquidPosition.closedSessions} closed`}
                      </p>
                    </div>
                    <span className="text-base font-extrabold text-text-primary tabular-nums">
                      {formatPkr(liquidPosition.drawerCashTotal)}
                    </span>
                  </div>

                  {canViewAccounts ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-text-muted">
                        <span>Business Bank / Digital ({liquidPosition.activeAccountCount})</span>
                        <span className="text-text-primary tabular-nums">
                          {formatPkr(liquidPosition.bankAndDigitalTotal)}
                        </span>
                      </div>
                      {liquidPosition.accounts.length === 0 ? (
                        <p className="text-xs text-text-muted py-2">
                          No active business accounts registered.
                        </p>
                      ) : (
                        <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar pr-1">
                          {liquidPosition.accounts.slice(0, 4).map((acc) => (
                            <div key={acc.id} className="flex items-center justify-between text-xs">
                              <span className="text-text-secondary truncate max-w-[60%]">
                                {acc.name}{' '}
                                <span className="text-[10px] text-text-muted">({acc.account_type})</span>
                              </span>
                              <span className="font-bold text-text-primary tabular-nums">
                                {formatPkr(acc.current_balance)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted">
                      Business bank accounts are managed at Organization Administrator level.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-border bg-surface-hover/40 flex justify-between items-center text-xs rounded-b-lg">
              <span className="text-text-muted">Liabilities never added to cash</span>
              <button
                type="button"
                onClick={() => onNavigate(`${base}/cash`)}
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline cursor-pointer"
              >
                Cash & Banking <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
