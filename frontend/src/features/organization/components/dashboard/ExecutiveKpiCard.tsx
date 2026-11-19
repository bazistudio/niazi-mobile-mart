import React from 'react';
import { ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react';

export interface ExecutiveKpiCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  accentColor?: 'teal' | 'emerald' | 'rose' | 'amber' | 'blue' | 'slate';
  deltaPct?: number | null;
  /** True when increase is unfavorable (e.g., returns, expenses, payables) */
  invertDeltaColors?: boolean;
  deltaLabel?: string;
  isLoading?: boolean;
  onClick?: () => void;
}

const BORDER_TOP_MAP: Record<NonNullable<ExecutiveKpiCardProps['accentColor']>, string> = {
  teal: 'border-t-2 border-t-[#006970]',
  emerald: 'border-t-2 border-t-emerald-600',
  rose: 'border-t-2 border-t-rose-600',
  amber: 'border-t-2 border-t-amber-600',
  blue: 'border-t-2 border-t-blue-600',
  slate: 'border-t-2 border-t-slate-500',
};

const ICON_BOX_MAP: Record<NonNullable<ExecutiveKpiCardProps['accentColor']>, string> = {
  teal: 'text-[#006970] dark:text-[#33c9cf] bg-[#006970]/10',
  emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  rose: 'text-rose-600 dark:text-rose-400 bg-rose-500/10',
  amber: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  blue: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
  slate: 'text-slate-600 dark:text-slate-300 bg-slate-500/10',
};

export const ExecutiveKpiCard: React.FC<ExecutiveKpiCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  accentColor = 'teal',
  deltaPct = null,
  invertDeltaColors = false,
  deltaLabel,
  isLoading = false,
  onClick,
}) => {
  if (isLoading) {
    return (
      <div className={`bg-surface rounded-lg border border-border ${BORDER_TOP_MAP[accentColor]} p-3.5 shadow-xs animate-pulse`}>
        <div className="h-3.5 w-24 bg-surface-hover rounded mb-3" />
        <div className="h-6 w-32 bg-surface-hover rounded mb-2" />
        <div className="h-3 w-28 bg-surface-hover rounded" />
      </div>
    );
  }

  let deltaBadge: React.ReactNode = null;
  if (deltaPct !== null && deltaPct !== undefined && Number.isFinite(deltaPct)) {
    const isUp = deltaPct > 0;
    const isZero = deltaPct === 0;
    const isGood = isZero ? null : invertDeltaColors ? !isUp : isUp;
    const colorClass =
      isGood === null
        ? 'text-text-muted bg-surface-hover'
        : isGood
        ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
        : 'text-rose-700 dark:text-rose-400 bg-rose-500/10';

    deltaBadge = (
      <span
        title={deltaLabel}
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold tabular-nums shrink-0 ${colorClass}`}
      >
        {!isZero && (isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />)}
        {isUp ? `+${deltaPct}%` : `${deltaPct}%`}
      </span>
    );
  }

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted truncate">
          {title}
        </span>
        <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${ICON_BOX_MAP[accentColor]}`}>
          {icon}
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-lg font-extrabold text-text-primary tabular-nums tracking-tight truncate">
          {value}
        </span>
        {deltaBadge}
      </div>

      <div className="mt-1.5 pt-1.5 border-t border-border/70 flex items-center justify-between gap-1 text-[11px] text-text-muted">
        <span className="truncate">{subtitle}</span>
        {onClick && (
          <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`group w-full text-left bg-surface rounded-lg border border-border ${BORDER_TOP_MAP[accentColor]} p-3.5 shadow-xs hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`bg-surface rounded-lg border border-border ${BORDER_TOP_MAP[accentColor]} p-3.5 shadow-xs flex flex-col justify-between`}>
      {content}
    </div>
  );
};
