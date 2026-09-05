'use client';

import React from 'react';
import { StockStatus } from '../../features/inventory/types';

export const StockStatusBadge = ({ status }: { status: StockStatus }) => {
  if (status === StockStatus.OUT_OF_STOCK) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md  dark:/10 text-xs font-semibold text-red-700 dark:text-red-400 border  dark:/30">
        <span className="h-1.5 w-1.5 rounded-full  animate-pulse"></span>
        Out of Stock
      </span>
    );
  }

  if (status === StockStatus.LOW_STOCK) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-900/10 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-800/30">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
        Low Stock
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/10 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
      In Stock
    </span>
  );
};
