'use client';

import React, { useEffect, useState } from 'react';
import { HistoryStatsCards, HistoryFilters, HistoryTable, HistoryTimeline, useHistoryStore } from '@/features/history';
import { History as HistoryIcon, LayoutList, GripVertical } from 'lucide-react';

export default function HistoryPage() {
  const { fetchHistory, fetchStats } = useHistoryStore();
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');

  useEffect(() => {
    fetchStats();
    fetchHistory();
  }, [fetchStats, fetchHistory]);

  return (
    <div className="flex flex-col gap-6 sm:gap-8 w-full max-w-7xl mx-auto pb-12">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <HistoryIcon className="h-6 w-6 text-[#006970]" />
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              Financial History
            </h1>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Comprehensive audit log of all sales, purchases, and ledger movements.
          </p>
        </div>
        
        <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700 shadow-sm">
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-md flex items-center transition-colors ${viewMode === 'table' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            title="Table View"
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`p-1.5 rounded-md flex items-center transition-colors ${viewMode === 'timeline' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            title="Timeline View"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      <HistoryStatsCards />
      <HistoryFilters />
      
      {viewMode === 'table' ? <HistoryTable /> : <HistoryTimeline />}

      <div className="flex items-center justify-between mt-4">
        <span className="text-sm text-gray-500">Showing all records for selected filters</span>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">Previous</button>
          <button className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">Next</button>
        </div>
      </div>
    </div>
  );
}
