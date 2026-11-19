import React from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle2, ChevronRight } from 'lucide-react';
import type { BusinessAlertItem } from '../../utils/dashboardCalculations';

interface BusinessAlertsSectionProps {
  alerts: BusinessAlertItem[];
  onNavigate: (href: string) => void;
}

export const BusinessAlertsSection: React.FC<BusinessAlertsSectionProps> = ({
  alerts,
  onNavigate,
}) => {
  if (alerts.length === 0) {
    return (
      <div className="bg-surface rounded-lg border border-border px-4 py-2.5 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            <strong className="text-text-primary font-semibold">Operational Health Nominal:</strong>{' '}
            No critical stockouts, overdue repairs, or elevated return warnings triggered.
          </span>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="Business Alerts and Action Center"
      className="bg-surface rounded-lg border border-border shadow-xs p-3.5"
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-primary">
            Action Center ({alerts.length} Active {alerts.length === 1 ? 'Notice' : 'Notices'})
          </h2>
        </div>
        <span className="text-[11px] text-text-muted">
          Deterministic threshold alerts from live ERP tables
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {alerts.map((alert) => {
          const style =
            alert.severity === 'danger'
              ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-950/20'
              : alert.severity === 'warning'
              ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20'
              : 'border-blue-200 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/20';

          const badgeStyle =
            alert.severity === 'danger'
              ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200'
              : alert.severity === 'warning'
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200';

          const Icon =
            alert.severity === 'danger'
              ? AlertCircle
              : alert.severity === 'warning'
              ? AlertTriangle
              : Info;

          const iconColor =
            alert.severity === 'danger'
              ? 'text-rose-600'
              : alert.severity === 'warning'
              ? 'text-amber-600'
              : 'text-blue-600';

          return (
            <button
              key={alert.id}
              type="button"
              onClick={() => onNavigate(alert.href)}
              className={`group text-left rounded-md border p-2.5 transition-all hover:shadow-xs cursor-pointer flex items-start justify-between gap-2.5 ${style}`}
            >
              <div className="flex items-start gap-2 min-w-0">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-text-primary truncate">{alert.title}</p>
                  <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">
                    {alert.description}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${badgeStyle}`}>
                  {alert.metric}
                </span>
                <span className="inline-flex items-center text-[11px] font-semibold text-primary group-hover:underline">
                  View <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
