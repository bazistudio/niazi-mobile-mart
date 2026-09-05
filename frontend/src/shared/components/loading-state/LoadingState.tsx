'use client';

import React from 'react';

interface LoadingStateProps {
  rows?: number;
  className?: string;
}

export const LoadingState = ({ rows = 5, className = '' }: LoadingStateProps) => {
  return (
    <div className={`divide-y divide-border w-full ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4 animate-pulse">
          <div className="flex-1 flex gap-4">
            <div className="h-3.5 w-1/3 rounded-full bg-surface-hover" />
            <div className="h-3.5 w-1/4 rounded-full bg-surface-hover" />
            <div className="h-3.5 w-1/6 rounded-full bg-surface-hover" />
          </div>
          <div className="h-6 w-20 rounded-full bg-surface-hover" />
        </div>
      ))}
    </div>
  );
};
