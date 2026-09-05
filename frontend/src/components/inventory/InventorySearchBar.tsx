'use client';

import React, { useRef } from 'react';
import { Search, X } from 'lucide-react';
import { selectSearchTerm, selectSetSearch } from '../../features/inventory/core/inventory.selectors';

export const InventorySearchBar = () => {
  const searchTerm = selectSearchTerm();
  const setSearch = selectSetSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleClear = () => {
    setSearch('');
    inputRef.current?.focus();
  };

  return (
    <div className="relative flex-1 min-w-0">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Search className="h-4 w-4 text-gray-400" aria-hidden="true" />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={searchTerm}
        onChange={handleChange}
        placeholder="Search by name or SKU..."
        className="block w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 pl-9 pr-8 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-[#006970] focus:outline-none focus:ring-1 focus:ring-[#006970] transition-colors"
      />
      {searchTerm && (
        <button
          onClick={handleClear}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

export default InventorySearchBar;
