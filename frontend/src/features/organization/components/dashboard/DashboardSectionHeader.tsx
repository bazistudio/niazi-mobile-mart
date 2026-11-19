import React from 'react';
import { ChevronRight } from 'lucide-react';

interface DashboardSectionHeaderProps {
  headingId?: string;
  title: string;
  subtitle?: string;
  badge?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const DashboardSectionHeader: React.FC<DashboardSectionHeaderProps> = ({
  headingId,
  title,
  subtitle,
  badge,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-1 h-4 rounded-full bg-primary shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 id={headingId} className="text-sm font-bold tracking-tight text-text-primary uppercase">
              {title}
            </h2>
            {badge && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-hover text-text-secondary border border-border">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-text-muted mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover transition-colors cursor-pointer self-start sm:self-auto shrink-0"
        >
          <span>{actionLabel}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
