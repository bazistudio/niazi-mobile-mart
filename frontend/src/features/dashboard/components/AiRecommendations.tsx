import React from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  AlertTriangle,
  Flame,
  Wallet,
  ArrowRight,
  CheckCircle2,
  Package,
} from 'lucide-react';

export interface RecommendationItem {
  id: string;
  type: 'LOW_STOCK' | 'TOP_SELLER' | 'PENDING_PAYMENT' | 'ALL_NOMINAL';
  title: string;
  description: string;
  metric?: string;
  actionLabel?: string;
  actionHref?: string;
  severity: 'warning' | 'success' | 'info' | 'danger';
}

export interface AiRecommendationsProps {
  lowStockCount?: number;
  lowStockItems?: { name: string; stock: number }[];
  topProduct?: { name: string; quantitySold: number; revenue?: number };
  pendingPaymentsAmount?: number;
  isLoading?: boolean;
}

export const AiRecommendations: React.FC<AiRecommendationsProps> = ({
  lowStockCount = 0,
  lowStockItems = [],
  topProduct,
  pendingPaymentsAmount = 0,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="w-full h-full rounded-2xl bg-surface border border-border p-5 sm:p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-surface-hover animate-pulse" />
          <div className="space-y-1.5 flex-1">
            <div className="h-4 w-32 bg-surface-hover rounded animate-pulse" />
            <div className="h-3 w-48 bg-surface-hover rounded animate-pulse" />
          </div>
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-surface-hover/50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Derive rule-based recommendations truthfully from props
  const recommendations: RecommendationItem[] = [];

  // Rule 1: Low Stock Alert
  if (lowStockCount > 0) {
    const itemNames = lowStockItems.map((i) => i.name).slice(0, 2).join(', ');
    const extra = lowStockCount > 2 ? ` and ${lowStockCount - 2} more` : '';
    recommendations.push({
      id: 'low-stock-alert',
      type: 'LOW_STOCK',
      title: 'Restock Action Required',
      description: `${lowStockCount} ${lowStockCount === 1 ? 'item is' : 'items are'} below minimum threshold${itemNames ? ` (${itemNames}${extra})` : ''}.`,
      metric: `${lowStockCount} items`,
      actionLabel: 'View Stock',
      actionHref: '/dashboard/shop-admin/inventory/stock',
      severity: 'danger',
    });
  }

  // Rule 2: Top Selling Product
  if (topProduct && topProduct.quantitySold > 0) {
    recommendations.push({
      id: 'top-seller-insight',
      type: 'TOP_SELLER',
      title: 'Top Performer Today',
      description: `"${topProduct.name}" is leading today's volume with ${topProduct.quantitySold} units sold.`,
      metric: `${topProduct.quantitySold} sold`,
      actionLabel: 'Inventory',
      actionHref: '/dashboard/shop-admin/inventory',
      severity: 'success',
    });
  }

  // Rule 3: Pending Customer Payments
  if (pendingPaymentsAmount > 0) {
    recommendations.push({
      id: 'pending-payments-reminder',
      type: 'PENDING_PAYMENT',
      title: 'Outstanding Ledger Balance',
      description: `You have Rs ${pendingPaymentsAmount.toLocaleString()} in pending customer receivables to follow up.`,
      metric: `Rs ${pendingPaymentsAmount.toLocaleString()}`,
      actionLabel: 'View Ledger',
      actionHref: '/dashboard/shop-admin/customers/ledger',
      severity: 'warning',
    });
  }

  // Fallback Rule: All Systems Nominal
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'all-nominal',
      type: 'ALL_NOMINAL',
      title: 'All Systems Operational',
      description: 'Inventory levels are healthy and no critical pending actions require attention.',
      severity: 'info',
    });
  }

  const getBadgeStyle = (severity: RecommendationItem['severity']) => {
    switch (severity) {
      case 'danger':
        return 'bg-danger/10 text-danger border-danger/20';
      case 'warning':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'success':
        return 'bg-success/10 text-success border-success/20';
      case 'info':
      default:
        return 'bg-primary/10 text-primary border-primary/20';
    }
  };

  const getIcon = (type: RecommendationItem['type']) => {
    switch (type) {
      case 'LOW_STOCK':
        return <AlertTriangle className="h-4 w-4 text-danger" />;
      case 'TOP_SELLER':
        return <Flame className="h-4 w-4 text-success" />;
      case 'PENDING_PAYMENT':
        return <Wallet className="h-4 w-4 text-warning" />;
      case 'ALL_NOMINAL':
      default:
        return <CheckCircle2 className="h-4 w-4 text-primary" />;
    }
  };

  return (
    <div className="w-full h-full rounded-2xl bg-surface border border-border p-5 sm:p-6 shadow-card flex flex-col justify-between gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text-primary">Operational Insights</h3>
            <p className="text-xs text-text-muted">Rule-based inventory and revenue alerts</p>
          </div>
        </div>

        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
          Rule-Based AI
        </span>
      </div>

      {/* Insights List */}
      <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-1 max-h-[300px]">
        {recommendations.map((rec) => (
          <div
            key={rec.id}
            className="p-3.5 rounded-xl bg-surface-hover/40 border border-border/70 hover:border-primary/40 transition-colors flex items-start justify-between gap-3 text-xs"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="mt-0.5 p-1.5 rounded-lg bg-surface border border-border shrink-0 shadow-xs">
                {getIcon(rec.type)}
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-text-primary leading-tight">
                    {rec.title}
                  </h4>
                  {rec.metric && (
                    <span
                      className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full border ${getBadgeStyle(
                        rec.severity
                      )}`}
                    >
                      {rec.metric}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  {rec.description}
                </p>
              </div>
            </div>

            {rec.actionHref && rec.actionLabel && (
              <Link
                to={rec.actionHref}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:bg-surface-hover hover:border-primary/40 text-text-primary font-bold text-[11px] transition-colors shrink-0 shadow-xs"
              >
                <span>{rec.actionLabel}</span>
                <ArrowRight className="h-3 w-3 text-primary" />
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AiRecommendations;
