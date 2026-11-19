'use client';

import React, { useState, useEffect, useId } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Coffee,
  Calendar,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  Loader2,
} from 'lucide-react';

// ─── HRSectionCard ────────────────────────────────────────────────────────────

interface HRSectionCardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean;
  className?: string;
}

export const HRSectionCard: React.FC<HRSectionCardProps> = ({
  title,
  subtitle,
  icon,
  badge,
  actions,
  children,
  noPadding = false,
  className = '',
}) => {
  return (
    <section
      className={`rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden ${className}`}
    >
      {(title || actions) && (
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/60 dark:bg-slate-900/80">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            {icon && <div className="shrink-0 mt-0.5 sm:mt-0">{icon}</div>}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {title && (
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-5">
                    {title}
                  </h3>
                )}
                {badge}
              </div>
              {subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-4">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-5'}>{children}</div>
    </section>
  );
};

// ─── HRStatCard ───────────────────────────────────────────────────────────────

export type HRStatTone = 'neutral' | 'teal' | 'emerald' | 'amber' | 'rose' | 'violet' | 'sky';

const STAT_TONE_STYLES: Record<
  HRStatTone,
  { border: string; iconBg: string; iconText: string; valueText: string; labelText: string }
> = {
  neutral: {
    border: 'border-slate-200/90 dark:border-slate-800',
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    iconText: 'text-slate-600 dark:text-slate-300',
    valueText: 'text-slate-900 dark:text-white',
    labelText: 'text-slate-500 dark:text-slate-400',
  },
  teal: {
    border: 'border-[#006970]/25 dark:border-[#00b4bb]/30',
    iconBg: 'bg-[#006970]/10 dark:bg-[#006970]/25',
    iconText: 'text-[#006970] dark:text-[#33c9cf]',
    valueText: 'text-[#006970] dark:text-[#33c9cf]',
    labelText: 'text-slate-600 dark:text-slate-300',
  },
  emerald: {
    border: 'border-emerald-200/80 dark:border-emerald-900/50',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    valueText: 'text-emerald-700 dark:text-emerald-400',
    labelText: 'text-emerald-700/90 dark:text-emerald-300',
  },
  amber: {
    border: 'border-amber-200/80 dark:border-amber-900/50',
    iconBg: 'bg-amber-50 dark:bg-amber-950/60',
    iconText: 'text-amber-600 dark:text-amber-400',
    valueText: 'text-amber-700 dark:text-amber-400',
    labelText: 'text-amber-700/90 dark:text-amber-300',
  },
  rose: {
    border: 'border-rose-200/80 dark:border-rose-900/50',
    iconBg: 'bg-rose-50 dark:bg-rose-950/60',
    iconText: 'text-rose-600 dark:text-rose-400',
    valueText: 'text-rose-700 dark:text-rose-400',
    labelText: 'text-rose-700/90 dark:text-rose-300',
  },
  violet: {
    border: 'border-violet-200/80 dark:border-violet-900/50',
    iconBg: 'bg-violet-50 dark:bg-violet-950/60',
    iconText: 'text-violet-600 dark:text-violet-400',
    valueText: 'text-violet-700 dark:text-violet-400',
    labelText: 'text-violet-700/90 dark:text-violet-300',
  },
  sky: {
    border: 'border-sky-200/80 dark:border-sky-900/50',
    iconBg: 'bg-sky-50 dark:bg-sky-950/60',
    iconText: 'text-sky-600 dark:text-sky-400',
    valueText: 'text-sky-700 dark:text-sky-400',
    labelText: 'text-sky-700/90 dark:text-sky-300',
  },
};

interface HRStatCardProps {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: HRStatTone;
  loading?: boolean;
  onClick?: () => void;
  active?: boolean;
}

export const HRStatCard: React.FC<HRStatCardProps> = ({
  label,
  value,
  subtext,
  icon,
  tone = 'neutral',
  loading = false,
  onClick,
  active = false,
}) => {
  const s = STAT_TONE_STYLES[tone];
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      aria-pressed={onClick ? active : undefined}
      onClick={onClick}
      className={`text-left w-full rounded-xl border bg-white dark:bg-slate-900 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all ${
        s.border
      } ${onClick ? 'cursor-pointer hover:shadow-sm hover:border-[#006970]/50' : ''} ${
        active ? 'ring-2 ring-[#006970]/40 border-[#006970]' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-wider leading-4 ${s.labelText}`}>
          {label}
        </span>
        {icon && (
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${s.iconBg} ${s.iconText}`}>
            {icon}
          </div>
        )}
      </div>
      <div className={`mt-2 text-2xl font-bold tracking-tight tabular-nums leading-7 ${s.valueText}`}>
        {loading ? (
          <span className="inline-block h-7 w-14 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
        ) : (
          value
        )}
      </div>
      {subtext && (
        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-4 truncate">
          {subtext}
        </div>
      )}
    </Wrapper>
  );
};

// ─── HRStatusBadge ────────────────────────────────────────────────────────────

const BADGE_MAP: Record<string, { label: string; cls: string; icon?: React.ElementType }> = {
  // Attendance statuses
  PRESENT: {
    label: 'Present',
    cls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/70',
    icon: CheckCircle2,
  },
  LATE: {
    label: 'Late',
    cls: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/70',
    icon: Clock,
  },
  ABSENT: {
    label: 'Absent',
    cls: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/70',
    icon: XCircle,
  },
  HALF_DAY: {
    label: 'Half Day',
    cls: 'bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 border-orange-200/80 dark:border-orange-800/70',
    icon: Clock,
  },
  LEAVE: {
    label: 'On Leave',
    cls: 'bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border-violet-200/80 dark:border-violet-800/70',
    icon: Coffee,
  },
  HOLIDAY: {
    label: 'Holiday',
    cls: 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200/80 dark:border-sky-800/70',
    icon: Calendar,
  },
  WEEKLY_OFF: {
    label: 'Weekly Off',
    cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    icon: Calendar,
  },
  NOT_MARKED: {
    label: 'Not Marked',
    cls: 'bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 border-dashed border-slate-300 dark:border-slate-700',
    icon: AlertCircle,
  },
  // Payroll / Settlement statuses
  DRAFT: {
    label: 'Draft',
    cls: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
  CALCULATED: {
    label: 'Calculated',
    cls: 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200/80 dark:border-sky-800',
  },
  APPROVED: {
    label: 'Approved',
    cls: 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200/80 dark:border-sky-800',
  },
  PARTIALLY_PAID: {
    label: 'Partial Pay',
    cls: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800',
  },
  PAID: {
    label: 'Paid',
    cls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800',
  },
  CLOSED: {
    label: 'Closed',
    cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  },
  // Advance statuses
  PENDING: {
    label: 'Pending',
    cls: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800',
  },
  DISBURSED: {
    label: 'Disbursed',
    cls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800',
  },
  RECOVERED: {
    label: 'Recovered',
    cls: 'bg-[#006970]/10 dark:bg-[#006970]/30 text-[#006970] dark:text-[#33c9cf] border-[#006970]/25',
  },
  REJECTED: {
    label: 'Rejected',
    cls: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-800',
  },
  CANCELLED: {
    label: 'Cancelled',
    cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  },
  // Account statuses
  ACTIVE: {
    label: 'Active',
    cls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800',
  },
  INACTIVE: {
    label: 'Inactive',
    cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  },
};

export const HRStatusBadge: React.FC<{
  status: string;
  labelOverride?: string;
  showIcon?: boolean;
}> = ({ status, labelOverride, showIcon = true }) => {
  const key = String(status || 'NOT_MARKED').toUpperCase();
  const cfg = BADGE_MAP[key] ?? {
    label: status || 'Unknown',
    cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  };
  const Icon = showIcon ? cfg.icon : undefined;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${cfg.cls}`}
    >
      {Icon && <Icon className="w-3 h-3 shrink-0" />}
      {labelOverride ?? cfg.label}
    </span>
  );
};

// ─── HRChartCard ──────────────────────────────────────────────────────────────

interface HRChartCardProps {
  title: string;
  subtitle?: string;
  pill?: string;
  maxWidth?: number | string;
  children: React.ReactNode;
  className?: string;
}

export const HRChartCard: React.FC<HRChartCardProps> = ({
  title,
  subtitle,
  pill,
  maxWidth,
  children,
  className = '',
}) => {
  return (
    <div
      className={`rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col min-w-0 ${className}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-5">
            {title}
          </h4>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-4">
              {subtitle}
            </p>
          )}
        </div>
        {pill && (
          <span className="shrink-0 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300">
            {pill}
          </span>
        )}
      </div>
      <div className="w-full min-w-0" style={maxWidth ? { maxWidth } : undefined}>
        {children}
      </div>
    </div>
  );
};

// ─── HRConfirmDialog ──────────────────────────────────────────────────────────

interface HRConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  details?: Array<{ label: string; value: string }>;
  dateInputLabel?: string;
  defaultDateValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger' | 'warning';
  isPending?: boolean;
  error?: string | null;
  onConfirm: (dateValue?: string) => void | Promise<void>;
  onCancel: () => void;
}

export const HRConfirmDialog: React.FC<HRConfirmDialogProps> = ({
  open,
  title,
  description,
  details,
  dateInputLabel,
  defaultDateValue = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  isPending = false,
  error = null,
  onConfirm,
  onCancel,
}) => {
  const [dateVal, setDateVal] = useState(defaultDateValue);
  const titleId = useId();
  const dateInputId = useId();

  useEffect(() => {
    if (open) setDateVal(defaultDateValue);
  }, [open, defaultDateValue]);

  useEffect(() => {
    if (!open || isPending) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, isPending, onCancel]);

  if (!open) return null;

  const hasBodyContent =
    (details && details.length > 0) || Boolean(dateInputLabel) || Boolean(error);

  const btnCls =
    variant === 'danger'
      ? 'bg-rose-600 hover:bg-rose-700 text-white'
      : variant === 'warning'
      ? 'bg-amber-600 hover:bg-amber-700 text-white'
      : 'bg-[#006970] hover:bg-[#005a60] text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-[1px] p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div
              className={`p-2 rounded-lg shrink-0 ${
                variant === 'danger'
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600'
                  : variant === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600'
                  : 'bg-[#006970]/10 text-[#006970] dark:text-[#33c9cf]'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3
                id={titleId}
                className="text-sm font-bold text-slate-900 dark:text-white"
              >
                {title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={onCancel}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            aria-label="Close confirmation dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {hasBodyContent && (
          <div className="p-5 space-y-4">
            {details && details.length > 0 && (
              <dl className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 p-3.5 space-y-2 text-xs">
                {details.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">{item.label}</dt>
                    <dd className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums text-right">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {dateInputLabel && (
              <div className="space-y-1.5">
                <label
                  htmlFor={dateInputId}
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  {dateInputLabel}
                </label>
                <input
                  id={dateInputId}
                  type="date"
                  value={dateVal}
                  onChange={(e) => setDateVal(e.target.value)}
                  required
                  className="w-full h-9 px-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}
          </div>
        )}

        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={onCancel}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isPending || (Boolean(dateInputLabel) && !dateVal)}
            onClick={() => void onConfirm(dateInputLabel ? dateVal : undefined)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50 ${btnCls}`}
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── HREmptyState & HRBanner ──────────────────────────────────────────────────

export const HREmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 py-10 px-6 text-center">
    {icon && (
      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
        {icon}
      </div>
    )}
    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
    {description && (
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
        {description}
      </p>
    )}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

export const HRBanner: React.FC<{
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  onDismiss?: () => void;
}> = ({ type, message, onDismiss }) => {
  const cls = {
    success:
      'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200',
    warning:
      'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
    error:
      'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
    info:
      'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200',
  }[type];
  const Icon = type === 'success' ? CheckCircle2 : type === 'warning' ? AlertTriangle : type === 'error' ? AlertCircle : Info;

  return (
    <div
      role="status"
      className={`rounded-xl px-4 py-2.5 border flex items-center justify-between gap-3 text-xs font-medium ${cls}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="leading-relaxed">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="opacity-70 hover:opacity-100 cursor-pointer shrink-0"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export function getKarachiTodayCanonical(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
    const m = parts.find((p) => p.type === 'month')?.value ?? '11';
    const d = parts.find((p) => p.type === 'day')?.value ?? '19';
    return `${y}-${m}-${d}`;
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
  }
}
