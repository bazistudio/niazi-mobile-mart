'use client';

import React, { useState } from 'react';
import { useInventoryFilters } from './InventoryFilterContext';
import { Search, X } from 'lucide-react';
import { DynamicMasterSelect } from './master-data/DynamicMasterSelect';

export function InventoryFilterBar() {
  const { filters, updateFilter, resetFilters } = useInventoryFilters();

  // DynamicMasterSelect now fetches its own options

  return (
    <div className="flex w-full items-center gap-2 text-sm pb-1 -mb-1">
      
      {/* Dynamic Master Filters */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <DynamicMasterSelect 
          entity="category"
          value={filters.categoryId}
          onChange={(id: string) => updateFilter('categoryId', id)}
        />
        <DynamicMasterSelect 
          entity="brand"
          value={filters.brandId}
          onChange={(id: string) => updateFilter('brandId', id)}
        />
        <DynamicMasterSelect 
          entity="company"
          value={filters.companyId}
          onChange={(id: string) => updateFilter('companyId', id)}
        />
        <DynamicMasterSelect 
          entity="color"
          value={filters.colorId}
          onChange={(id: string) => updateFilter('colorId', id)}
        />
        <DynamicMasterSelect 
          entity="quality"
          value={filters.qualityId}
          onChange={(id: string) => updateFilter('qualityId', id)}
        />
      </div>

      <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 flex-shrink-0 mx-1"></div>

      {/* Search Input */}
      <div className="relative flex-1 min-w-[200px] max-w-sm flex-shrink-0">
        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#006970] focus:border-[#006970]"
          placeholder="Search product, SKU..."
          value={filters.search}
          onChange={(e) => updateFilter('search', e.target.value)}
        />
      </div>

      {/* Reset Button */}
      <div className="flex-shrink-0">
        <button
          onClick={resetFilters}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          aria-label="Reset Filters"
        >
          <X className="h-4 w-4" />
          <span>Reset</span>
        </button>
      </div>

    </div>
  );
}
