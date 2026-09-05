'use client';

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState = ({
  title = 'Something went wrong',
  message = 'We encountered an unexpected error while loading the data.',
  onRetry,
  className = '',
}: ErrorStateProps) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center bg-danger/5 rounded-xl border border-danger/20 ${className}`}
    >
      <div className="h-12 w-12 rounded-full bg-danger/10 flex items-center justify-center mb-4">
        <AlertCircle className="h-6 w-6 text-danger" />
      </div>
      <h3 className="text-base font-semibold text-text-primary mb-1">{title}</h3>
      <p className="text-sm text-text-muted max-w-sm mb-5">{message}</p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-surface text-text-secondary text-sm font-medium border border-border rounded-lg hover:bg-surface-hover hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
      )}
    </div>
  );
};
