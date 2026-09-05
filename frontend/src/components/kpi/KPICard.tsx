import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { KPIData } from '../../types/dashboard/kpi.types';

interface KPICardProps {
  data: KPIData;
  isLoading?: boolean;
}

/** Skeleton placeholder */
const KPICardSkeleton = () => (
  <div className="flex flex-col bg-surface rounded-xl p-5 shadow-card border border-border animate-pulse">
    <div className="flex items-start justify-between mb-4 gap-3">
      <div className="h-3.5 w-28 bg-surface-hover rounded-full" />
      <div className="h-9 w-9 bg-surface-hover rounded-lg flex-shrink-0" />
    </div>
    <div className="h-7 w-32 bg-surface-hover rounded-md mb-2" />
    <div className="h-5 w-20 bg-surface-hover rounded-full" />
  </div>
);

export const KPICard = ({ data, isLoading = false }: KPICardProps) => {
  if (isLoading) return <KPICardSkeleton />;

  const { title, value, trend, icon, timeframe = 'vs last month', onClick } = data;

  const isPositive = trend > 0;
  const isNegative = trend < 0;

  const trendVariant = isPositive
    ? 'bg-success/10 text-success'
    : isNegative
    ? 'bg-danger/10 text-danger'
    : 'bg-surface-hover text-text-muted';

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={`group flex flex-col bg-surface rounded-xl p-5 shadow-card border border-border transition-all duration-fast ${
        onClick
          ? 'cursor-pointer hover:shadow-hover hover:border-primary/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'
          : 'hover:shadow-hover'
      }`}
    >
      {/* Header row: label + icon */}
      <div className="flex items-start justify-between mb-3 gap-3">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider leading-tight">
          {title}
        </h3>
        <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 text-primary flex-shrink-0 transition-colors group-hover:bg-primary/15">
          {icon}
        </div>
      </div>

      {/* Value */}
      <div className="text-2xl font-bold text-text-primary break-words leading-tight">
        {value}
      </div>

      {/* Trend + timeframe */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {trend !== undefined && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${trendVariant}`}
          >
            {isPositive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : isNegative ? (
              <ArrowDownRight className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {Math.abs(trend)}%
          </span>
        )}
        <span className="text-xs text-text-muted">{timeframe}</span>
      </div>
    </div>
  );
};

export default KPICard;
