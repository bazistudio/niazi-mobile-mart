import React from 'react';
import { Wrench, Users, Smartphone, Activity, ChevronRight } from 'lucide-react';
import { SharedChart } from '@/components/charts/SharedChart';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import type { HistoryItem } from '@/features/history/types/history.types';
import { formatPkr, type DashboardDateRange } from '../../utils/dashboardDates';
import type {
  HrAttendanceOverview,
  MobileSalesOperationalSummary,
  RepairsOperationalSummary,
} from '../../utils/dashboardCalculations';

interface OperationalOverviewSectionProps {
  mode: 'organization' | 'branch';
  dateRange: DashboardDateRange;
  canViewRepairs: boolean;
  canViewHr: boolean;
  canViewSales: boolean;
  canViewInventory: boolean;
  repairs: RepairsOperationalSummary;
  hrAttendance: HrAttendanceOverview | null;
  mobileSales: MobileSalesOperationalSummary;
  recentHistory: HistoryItem[];
  loadingRepairs: boolean;
  loadingHr: boolean;
  loadingMobileSales: boolean;
  loadingHistory: boolean;
  onNavigate: (href: string) => void;
}

export const OperationalOverviewSection: React.FC<OperationalOverviewSectionProps> = ({
  mode,
  dateRange,
  canViewRepairs,
  canViewHr,
  canViewSales,
  canViewInventory,
  repairs,
  hrAttendance,
  mobileSales,
  recentHistory,
  loadingRepairs,
  loadingHr,
  loadingMobileSales,
  loadingHistory,
  onNavigate,
}) => {
  if (!canViewRepairs && !canViewHr && !canViewSales && !canViewInventory) return null;

  const base = mode === 'organization' ? '/dashboard/organization' : '/dashboard/shop-admin';
  const hrDest = mode === 'organization' ? '/dashboard/organization/hr' : '/dashboard/shop-admin/settings/workforce';
  const mobileSalesDest =
    mode === 'organization' ? '/dashboard/organization/mobile-inventory' : '/dashboard/shop-admin/mobiles/sale-history';

  return (
    <section aria-labelledby="ops-overview-heading" className="space-y-3">
      <DashboardSectionHeader
        headingId="ops-overview-heading"
        title="Operational Modules Summary"
        subtitle="Service repairs pipeline, today's PKT staff attendance, mobile handset sales, and recent transactions"
        badge={dateRange.label}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Column 1: Repairs & Mobile Sales */}
        {(canViewRepairs || canViewInventory) && (
          <div className="bg-surface rounded-lg border border-border shadow-xs flex flex-col justify-between">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded bg-primary/10 text-primary">
                  <Wrench className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-text-primary">Repairs & Mobile Handsets</h3>
                  <p className="text-[11px] text-text-muted">Workshop queue & serialized sales</p>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-4 flex-1">
              {canViewRepairs && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                      Repair Jobs {repairs.isTruncated ? `(Latest 100 of ${repairs.totalTracked})` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate(`${base}/repairs`)}
                      className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                    >
                      Open Lab →
                    </button>
                  </div>
                  {loadingRepairs ? (
                    <div className="h-16 bg-surface-hover/50 rounded animate-pulse" />
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded bg-surface-hover/60 border border-border/70 p-2">
                        <span className="text-text-muted">Pending Active:</span>{' '}
                        <strong className="text-text-primary tabular-nums">{repairs.pendingCount}</strong>
                      </div>
                      <div className="rounded bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40 p-2">
                        <span className="text-text-muted">Ready Pickup:</span>{' '}
                        <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {repairs.readyForPickupCount}
                        </strong>
                      </div>
                      <div className="rounded bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/40 p-2">
                        <span className="text-text-muted">Overdue:</span>{' '}
                        <strong className="text-rose-700 dark:text-rose-400 tabular-nums">
                          {repairs.overdueCount}
                        </strong>
                      </div>
                      <div className="rounded bg-surface-hover/60 border border-border/70 p-2">
                        <span className="text-text-muted">Collected:</span>{' '}
                        <strong className="text-text-primary tabular-nums">
                          {formatPkr(repairs.periodCollections)}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {canViewInventory && (
                <div className="pt-3 border-t border-border/70">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1">
                      <Smartphone className="w-3.5 h-3.5" />
                      Mobile Device Sales (Period)
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate(mobileSalesDest)}
                      className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                    >
                      Mobiles →
                    </button>
                  </div>
                  {loadingMobileSales ? (
                    <div className="h-14 bg-surface-hover/50 rounded animate-pulse" />
                  ) : (
                    <div className="rounded bg-surface-hover/60 border border-border/70 p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-text-primary tabular-nums">
                          {mobileSales.devicesSold} Device(s) Sold ({mobileSales.invoiceCount} invoices)
                        </p>
                        <p className="text-[11px] text-text-muted mt-0.5">
                          Paid on invoice: {formatPkr(mobileSales.paidAmount)}
                          {mobileSales.isTruncated ? ' • Latest 100 cap' : ''}
                        </p>
                      </div>
                      <span className="font-extrabold text-primary tabular-nums">
                        {formatPkr(mobileSales.totalRevenue)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-border bg-surface-hover/40 text-xs text-text-muted rounded-b-lg">
              Delivered in period: <strong className="text-text-primary">{repairs.deliveredInPeriodCount}</strong> repair jobs
            </div>
          </div>
        )}

        {/* Column 2: HR Attendance Distribution (Today PKT) */}
        {canViewHr && (
          <div className="bg-surface rounded-lg border border-border shadow-xs flex flex-col justify-between">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Users className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-text-primary">HR & Today's Attendance</h3>
                  <p className="text-[11px] text-text-muted">PKT daily register snapshot</p>
                </div>
              </div>
              {hrAttendance && (
                <span className="text-xs font-bold text-text-primary tabular-nums">
                  {hrAttendance.totalEmployees} Staff
                </span>
              )}
            </div>

            <div className="p-4 flex-1 flex flex-col justify-between">
              <SharedChart
                variant="donut"
                data={hrAttendance?.chartData ?? []}
                height={165}
                minHeight={150}
                maxWidth={230}
                align="center"
                isLoading={loadingHr}
                emptyMessage="No attendance register records found today"
                valueType="integer"
                legend={{ enabled: true, position: 'bottom', align: 'center' }}
                series={[{ key: 'value', label: 'Staff', color: '#16a34a' }]}
              />

              {hrAttendance && (
                <div className="grid grid-cols-4 gap-1.5 pt-3 mt-2 border-t border-border/70 text-center text-[11px]">
                  <div className="rounded bg-emerald-50/70 dark:bg-emerald-950/20 py-1.5">
                    <div className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {hrAttendance.present}
                    </div>
                    <div className="text-[10px] text-text-muted">Present</div>
                  </div>
                  <div className="rounded bg-amber-50/70 dark:bg-amber-950/20 py-1.5">
                    <div className="font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                      {hrAttendance.late}
                    </div>
                    <div className="text-[10px] text-text-muted">Late</div>
                  </div>
                  <div className="rounded bg-rose-50/70 dark:bg-rose-950/20 py-1.5">
                    <div className="font-bold text-rose-700 dark:text-rose-400 tabular-nums">
                      {hrAttendance.absent}
                    </div>
                    <div className="text-[10px] text-text-muted">Absent</div>
                  </div>
                  <div className="rounded bg-blue-50/70 dark:bg-blue-950/20 py-1.5">
                    <div className="font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                      {hrAttendance.onLeave + hrAttendance.halfDay}
                    </div>
                    <div className="text-[10px] text-text-muted">Leave</div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-border bg-surface-hover/40 flex items-center justify-between text-xs rounded-b-lg">
              <span className="text-text-muted">
                Open check-ins: {hrAttendance?.checkedInOpen ?? 0}
              </span>
              <button
                type="button"
                onClick={() => onNavigate(hrDest)}
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline cursor-pointer"
              >
                HR Workspace <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Column 3: Recent ERP Activity */}
        {canViewSales && (
          <div className="bg-surface rounded-lg border border-border shadow-xs flex flex-col justify-between">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded bg-surface-hover text-text-primary">
                  <Activity className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-text-primary">Recent ERP Activity</h3>
                  <p className="text-[11px] text-text-muted">Latest invoices, receipts, & returns</p>
                </div>
              </div>
            </div>

            <div className="p-4 flex-1">
              {loadingHistory ? (
                <div className="space-y-2.5">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-10 bg-surface-hover/50 rounded animate-pulse" />
                  ))}
                </div>
              ) : recentHistory.length === 0 ? (
                <div className="h-44 flex items-center justify-center text-xs text-text-muted">
                  No recent transactions recorded.
                </div>
              ) : (
                <div className="divide-y divide-border/70">
                  {recentHistory.slice(0, 6).map((item) => (
                    <div key={item.id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-text-primary truncate">
                          <span className="uppercase text-[10px] font-bold text-primary mr-1.5">
                            {item.type}
                          </span>
                          {item.referenceId}
                        </p>
                        <p className="text-[11px] text-text-muted truncate">
                          {item.party?.name || 'Walk-in'} • {item.status}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-text-primary tabular-nums shrink-0">
                        {formatPkr(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-border bg-surface-hover/40 flex items-center justify-between text-xs rounded-b-lg">
              <span className="text-text-muted">Audit trail synchronized</span>
              <button
                type="button"
                onClick={() => onNavigate(`${base}/history`)}
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline cursor-pointer"
              >
                Full History <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
