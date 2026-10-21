import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Smartphone, ChevronRight, Layers, DollarSign, Store } from 'lucide-react';
import type { MobileOrganizationSummary } from '@/features/mobiles/services/mobile.api';

interface MobileInventoryCardProps {
  summary: MobileOrganizationSummary | null;
  loading?: boolean;
}

export const MobileInventoryCard: React.FC<MobileInventoryCardProps> = ({ summary, loading = false }) => {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6 border border-gray-100 dark:border-gray-800 animate-pulse">
        <div className="h-6 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
        <div className="h-10 w-32 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="h-12 bg-gray-100 dark:bg-gray-800/60 rounded" />
          <div className="h-12 bg-gray-100 dark:bg-gray-800/60 rounded" />
        </div>
      </div>
    );
  }

  const total = summary?.total_devices ?? 0;
  const inStock = summary?.in_stock_count ?? 0;
  const newCount = summary?.new_count ?? 0;
  const usedCount = summary?.used_count ?? 0;
  const inspection = summary?.inspection_count ?? 0;
  const valuation = summary?.total_valuation ?? 0;
  const branches = summary?.branches ?? [];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6 border border-gray-100 dark:border-gray-800 flex flex-col justify-between">
      <div>
        {/* Card Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-50 dark:bg-teal-950/40 rounded-lg text-teal-600 dark:text-teal-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Mobile Inventory</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Consolidated Serialized Units</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            {branches.length} {branches.length === 1 ? 'Branch' : 'Branches'}
          </span>
        </div>

        {/* Primary Metrics */}
        <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Units</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{total}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {inStock} In Stock {inspection > 0 && `• ${inspection} Inspection`}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stock Valuation</p>
            <p className="text-2xl font-bold text-teal-700 dark:text-teal-400 mt-1">
              Rs. {valuation.toLocaleString('en-PK')}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              <span className="text-green-600 dark:text-green-400">N: Rs.&nbsp;{(summary?.new_valuation ?? 0).toLocaleString('en-PK')}</span>
              {' '}·{' '}
              <span className="text-amber-600 dark:text-amber-400">U: Rs.&nbsp;{(summary?.used_valuation ?? 0).toLocaleString('en-PK')}</span>
            </p>
          </div>
        </div>

        {/* Condition Split Badges */}
        <div className="grid grid-cols-2 gap-2 pt-3 pb-3 border-b border-gray-100 dark:border-gray-800 text-xs">
          <div className="p-2 bg-gray-50 dark:bg-gray-800/40 rounded flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-300">Brand New Units</span>
            <span className="font-bold text-gray-900 dark:text-white">{newCount}</span>
          </div>
          <div className="p-2 bg-gray-50 dark:bg-gray-800/40 rounded flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-300">Used Units (Legal)</span>
            <span className="font-bold text-gray-900 dark:text-white">{usedCount}</span>
          </div>
        </div>

        {/* Per-Branch Breakdown */}
        {branches.length > 0 && (
          <div className="pt-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5" />
              <span>Branch Allocation</span>
            </p>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {branches.map((b) => (
                <div
                  key={b.branch_id}
                  className="flex items-center justify-between text-xs py-1 px-2 rounded bg-gray-50/70 dark:bg-gray-800/30 hover:bg-gray-100/60 dark:hover:bg-gray-800/60 transition-colors"
                >
                  <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[150px]">
                    {b.branch_name}
                  </span>
                  <div className="flex flex-col items-end gap-0.5 text-right">
                    <span className="font-bold text-gray-900 dark:text-white">
                      {b.in_stock_count} in-stock / {b.total_devices} total
                    </span>
                    <span className="text-gray-400 text-[11px]">
                      Rs.&nbsp;{(b.total_valuation || 0).toLocaleString('en-PK')}
                      {' '}—{' '}
                      <span className="text-green-600 dark:text-green-400">{b.new_count}N</span>
                      {' / '}
                      <span className="text-amber-600 dark:text-amber-400">{b.used_count}U</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation Link */}
      <div className="pt-4 mt-3 border-t border-gray-100 dark:border-gray-800">
        <button
          type="button"
          onClick={() => navigate('/dashboard/organization/mobile-inventory')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 transition-colors cursor-pointer group"
        >
          <span>Open Consolidated Mobile Inventory</span>
          <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
};
