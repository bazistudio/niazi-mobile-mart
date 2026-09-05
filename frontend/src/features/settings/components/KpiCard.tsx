'use client';

import React from 'react';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    value: string;
  };
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export function KpiCard({ label, value, icon, trend, variant = 'default' }: KpiCardProps) {
  const variantStyles = {
    default: {
      iconBg: 'var(--color-primary)',
      textColor: 'var(--color-primary)',
    },
    success: {
      iconBg: 'var(--color-success)',
      textColor: 'var(--color-success)',
    },
    warning: {
      iconBg: 'var(--color-warning)',
      textColor: 'var(--color-warning)',
    },
    danger: {
      iconBg: 'var(--color-danger)',
      textColor: 'var(--color-danger)',
    },
    info: {
      iconBg: 'var(--color-info)',
      textColor: 'var(--color-info)',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className="rounded-2xl border border-[--color-border] bg-[--color-surface] p-5 shadow-card hover:shadow-hover transition-shadow duration-fast">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-[--color-text-muted]">{label}</p>
          <p className="text-2xl font-bold text-[--color-text-primary] tracking-tight">{value}</p>
          {trend && (
            <div className="flex items-center gap-1">
              <span
                className={`text-xs font-semibold ${
                  trend.direction === 'up'
                    ? 'text-[--color-success]'
                    : trend.direction === 'down'
                    ? 'text-[--color-danger]'
                    : 'text-[--color-text-muted]'
                }`}
              >
                {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'} {trend.value}
              </span>
            </div>
          )}
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: styles.iconBg, opacity: 0.12 }}
        >
          <div style={{ color: styles.textColor }} className="w-5 h-5">
            {icon}
          </div>
        </div>
      </div>
    </div>
  );
}