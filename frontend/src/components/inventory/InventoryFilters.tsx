'use client';

import React from 'react';
import { selectActiveFilter, selectSetFilter } from '../../features/inventory/core/inventory.selectors';
import { InventoryFilterType } from '../../features/inventory/types';

const filters: { label: string; value: InventoryFilterType }[] = [
  { label: 'All Products', value: 'all' },
  { label: 'Low Stock', value: 'low_stock' },
  { label: 'Out of Stock', value: 'out_of_stock' },
];

export const InventoryFilters = () => {
  const activeFilter = selectActiveFilter();
  const setFilter = selectSetFilter();

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
      {filters.map((f) => (
        <button
          key={f.value}
          onClick={() => setFilter(f.value)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 whitespace-nowrap ${
            activeFilter === f.value
              ? 'bg-white dark:bg-gray-700 text-[#006970] dark:text-[#00B4BB] shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
};

export default InventoryFilters;
