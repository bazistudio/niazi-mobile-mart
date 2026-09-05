'use client';

import React from 'react';

interface SettingsCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export function SettingsCard({
  title,
  description,
  icon,
  children,
  className = '',
  action,
}: SettingsCardProps) {
  return (
    <div className={`rounded-2xl border border-[--color-border] p-6 bg-[--color-surface] ${className}`}>
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          {icon && (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-primary)', opacity: 0.12 }}
            >
              <div style={{ color: 'var(--color-primary)' }} className="w-5 h-5">
                {icon}
              </div>
            </div>
          )}
          <div>
            <h2 className="text-lg font-bold text-[--color-text-primary]">{title}</h2>
            {description && (
              <p className="text-sm text-[--color-text-muted] mt-0.5">{description}</p>
            )}
          </div>
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}