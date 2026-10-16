import React, { useEffect, useState } from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { 
  Receipt, 
  RotateCcw,
  LayoutList,
  GripVertical
} from 'lucide-react';
import { HistoryStatsCards, HistoryFilters, HistoryTable, HistoryTimeline, useHistoryStore } from '@/features/history';
import { SalesReturnsTable } from '@/features/returns/SalesReturnsTable';
import { PurchaseReturnsTable } from '@/features/returns/PurchaseReturnsTable';
import { useOrganizationStore } from '@/store/useOrganizationStore';

export function OrganizationHistoryPage() {
  const { fetchHistory, fetchStats, setFilters, filters, total } = useHistoryStore();
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');
  const [activeTab, setActiveTab] = useState<'transactions' | 'sales_returns' | 'purchase_returns'>('transactions');

  const activeBranchId = useOrganizationStore((state) => state.activeShop?._id ?? null);
  const activeShop = useOrganizationStore((state) => state.activeShop);

  useEffect(() => {
    fetchStats(activeBranchId);
    setFilters({ branch_id: activeBranchId, page: 1 });
  }, [activeBranchId, fetchStats, setFilters]);

  return (
    <OrganizationPageShell
      title="Organization History"
      description="Consolidated historical business transactions, returns, and ledger movements across branches."
      badge={activeShop ? `Scope: ${activeShop.name}` : 'Scope: All Branches'}
    >
      {/* Tab Navigation */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('transactions')}
            className={`pb-2 px-4 text-sm font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'transactions'
                ? 'border-[#006970] text-[#006970]'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Receipt className="w-4 h-4" />
            All Transactions
          </button>
          <button
            onClick={() => setActiveTab('sales_returns')}
            className={`pb-2 px-4 text-sm font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'sales_returns'
                ? 'border-[#e76f51] text-[#e76f51]'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <RotateCcw className="w-4 h-4 text-[#e76f51]" />
            Sales Returns
          </button>
          <button
            onClick={() => setActiveTab('purchase_returns')}
            className={`pb-2 px-4 text-sm font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'purchase_returns'
                ? 'border-[#2a9d8f] text-[#2a9d8f]'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <RotateCcw className="w-4 h-4 text-[#2a9d8f]" />
            Purchase Returns
          </button>
        </div>

        {activeTab === 'transactions' && (
          <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700 shadow-sm">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md flex items-center transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              title="Table View"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`p-1.5 rounded-md flex items-center transition-colors cursor-pointer ${
                viewMode === 'timeline' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              title="Timeline View"
            >
              <GripVertical className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Main Views */}
      {activeTab === 'transactions' && (
        <div className="space-y-6">
          <HistoryStatsCards />
          <HistoryFilters />
          {viewMode === 'table' ? <HistoryTable /> : <HistoryTimeline />}

          {/* Pagination */}
          {(() => {
            const limit = filters.limit ?? 10;
            const currentPage = filters.page ?? 1;
            const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
            const isFirstPage = currentPage <= 1;
            const isLastPage = currentPage >= totalPages;
            const start = total === 0 ? 0 : (currentPage - 1) * limit + 1;
            const end = Math.min(currentPage * limit, total);
            return (
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-gray-500">
                  {total > 0 ? `Showing ${start}–${end} of ${total} records` : 'No records'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => !isFirstPage && setFilters({ page: currentPage - 1 })}
                    disabled={isFirstPage}
                    className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400 px-1">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => !isLastPage && setFilters({ page: currentPage + 1 })}
                    disabled={isLastPage}
                    className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {activeTab === 'sales_returns' && <SalesReturnsTable branchId={activeBranchId} />}

      {activeTab === 'purchase_returns' && <PurchaseReturnsTable branchId={activeBranchId} />}
    </OrganizationPageShell>
  );
}

export default OrganizationHistoryPage;
