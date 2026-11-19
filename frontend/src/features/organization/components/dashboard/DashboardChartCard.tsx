import React from 'react';
import { AlertCircle, ChevronRight, RefreshCw } from 'lucide-react';

interface DashboardChartCardProps {
  title: string;
  subtitle?: string;
  badge?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  footerText?: string;
  actionLabel?: string;
  onAction?: () => void;
  isError?: boolean;
  onRetry?: () => void;
  className?: string;
}

export const DashboardChartCard: React.FC<DashboardChartCardProps> = ({
  title,
  subtitle,
  badge,
  headerRight,
  children,
  footerText,
  actionLabel,
  onAction,
  isError = false,
  onRetry,
  className = '',
}) => {
  return (
    <div
      className={`bg-surface rounded-lg border border-border shadow-xs flex flex-col justify-between min-w-0 ${className}`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-text-primary truncate">{title}</h3>
            {badge && (
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 shrink-0">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-text-muted mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {headerRight && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">{headerRight}</div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex-1 min-w-0">
        {isError ? (
          <div className="h-52 rounded-md border border-dashed border-danger/30 bg-danger/5 flex flex-col items-center justify-center p-4 text-center gap-2">
            <AlertCircle className="w-5 h-5 text-danger" />
            <p className="text-xs font-semibold text-text-primary">
              Unable to load section data
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-border bg-surface text-xs font-semibold text-text-primary hover:bg-surface-hover cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            )}
          </div>
        ) : (
          children
        )}
      </div>

      {/* Footer */}
      {(footerText || (actionLabel && onAction)) && (
        <div className="px-4 py-2.5 border-t border-border bg-surface-hover/40 flex items-center justify-between gap-2 text-xs rounded-b-lg">
          <span className="text-text-muted truncate">{footerText ?? ''}</span>
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-hover transition-colors cursor-pointer shrink-0"
            >
              <span>{actionLabel}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
