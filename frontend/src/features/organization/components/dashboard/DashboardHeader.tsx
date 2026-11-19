import React from 'react';
import {
  Building2,
  Calendar,
  RefreshCw,
  ShoppingCart,
  ReceiptText,
  Store,
  Lock,
} from 'lucide-react';
import type { Branch } from '@/lib/tauri/tauriClient';
import type { DashboardDatePreset, DashboardDateRange } from '../../utils/dashboardDates';

interface DashboardHeaderProps {
  mode: 'organization' | 'branch';
  organizationName: string;
  scopeName: string;
  dateRange: DashboardDateRange;
  preset: DashboardDatePreset;
  customStart: string;
  customEnd: string;
  onPresetChange: (preset: DashboardDatePreset) => void;
  onCustomDatesChange: (start: string, end: string) => void;
  branches: Branch[];
  selectedBranchId: string | null;
  onBranchSelect?: (branchId: string | null) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  canAccessPos: boolean;
  canAccessExpenses: boolean;
  onNavigate: (href: string) => void;
  extraAction?: React.ReactNode;
}

const PRESETS: Array<{ id: DashboardDatePreset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'prev_month', label: 'Prev Month' },
  { id: 'this_year', label: 'This Year' },
  { id: 'custom', label: 'Custom' },
];

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  mode,
  organizationName,
  scopeName,
  dateRange,
  preset,
  customStart,
  customEnd,
  onPresetChange,
  onCustomDatesChange,
  branches,
  selectedBranchId,
  onBranchSelect,
  onRefresh,
  isRefreshing,
  canAccessPos,
  canAccessExpenses,
  onNavigate,
  extraAction,
}) => {
  return (
    <header className="bg-surface rounded-lg border border-border shadow-xs p-4 space-y-3">
      {/* Row 1: Identity, Scope Badge & Primary ERP Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold text-text-primary tracking-tight">
              {mode === 'organization'
                ? `${organizationName} — Business Command Center`
                : `${scopeName} — Operations Dashboard`}
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              {mode === 'organization' && !selectedBranchId ? (
                <Building2 className="w-3.5 h-3.5" />
              ) : (
                <Store className="w-3.5 h-3.5" />
              )}
              <span>{scopeName}</span>
              {mode === 'branch' && (
                <Lock className="w-3 h-3 opacity-70" aria-label="Locked to branch" />
              )}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1 flex items-center gap-2 flex-wrap">
            <span>
              Reporting Period (PKT):{' '}
              <strong className="text-text-secondary font-semibold">{dateRange.label}</strong>
            </span>
            <span aria-hidden="true">•</span>
            <span>
              Comparison:{' '}
              <strong className="text-text-secondary font-semibold">
                {dateRange.comparisonLabel}
              </strong>
            </span>
          </p>
        </div>

        {/* Actions Cluster */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Org Admin Inline Scope Switcher */}
          {mode === 'organization' && onBranchSelect && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="cc-branch-scope" className="sr-only">
                Dashboard Branch Scope
              </label>
              <select
                id="cc-branch-scope"
                value={selectedBranchId ?? '__ALL__'}
                onChange={(e) =>
                  onBranchSelect(e.target.value === '__ALL__' ? null : e.target.value)
                }
                className="h-8 px-2.5 rounded-md border border-border bg-surface text-xs font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
              >
                <option value="__ALL__">Consolidated: All Retail Branches ({branches.length})</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    Branch: {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh all dashboard metrics"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors cursor-pointer disabled:opacity-disabled"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            <span>Refresh</span>
          </button>

          {extraAction}

          {canAccessExpenses && (
            <button
              type="button"
              onClick={() => onNavigate('/dashboard/shop-admin/expenses')}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface text-xs font-semibold text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <ReceiptText className="w-3.5 h-3.5 text-warning" />
              <span>Expenses</span>
            </button>
          )}

          {canAccessPos && (
            <button
              type="button"
              onClick={() => onNavigate('/dashboard/shop-admin/pos')}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-primary text-xs font-semibold text-white hover:bg-primary-hover active:bg-primary-active transition-colors cursor-pointer shadow-xs"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Open POS</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Unified Date Presets & Custom Range Picker */}
      <div className="pt-2.5 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted uppercase tracking-wider mr-1">
            <Calendar className="w-3.5 h-3.5" />
            Period:
          </span>
          {PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPresetChange(p.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-surface-hover/70 text-text-secondary hover:bg-surface-hover hover:text-text-primary border border-transparent hover:border-border'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <label className="text-text-muted font-medium" htmlFor="cc-date-start">
              From
            </label>
            <input
              id="cc-date-start"
              type="date"
              value={customStart}
              onChange={(e) => onCustomDatesChange(e.target.value, customEnd)}
              className="h-7 px-2 rounded border border-border bg-surface text-xs text-text-primary font-medium"
            />
            <label className="text-text-muted font-medium" htmlFor="cc-date-end">
              To
            </label>
            <input
              id="cc-date-end"
              type="date"
              value={customEnd}
              onChange={(e) => onCustomDatesChange(customStart, e.target.value)}
              className="h-7 px-2 rounded border border-border bg-surface text-xs text-text-primary font-medium"
            />
          </div>
        )}
      </div>
    </header>
  );
};
