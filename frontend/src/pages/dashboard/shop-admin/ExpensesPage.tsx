import React, { useEffect, useState } from 'react';
import { ExpenseStatsCards, ExpensesTable, ExpenseCreateModal, ExpenseFilters, useExpensesStore } from '@/features/expenses';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { ReceiptText, Plus, Building2 } from 'lucide-react';

export const ExpensesPage: React.FC = () => {
  const { fetchExpenses, fetchCategories, setFilters } = useExpensesStore();
  const activeShopId = useOrganizationStore((s: ReturnType<typeof useOrganizationStore.getState>) => s.activeShopId || s.activeShop?._id);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';
  const [isModalOpen, setIsModalOpen] = useState(false);

  // DEFECT-04 FIX: Sync the active branch into expense store filters so
  // the table and stats respect the topbar shop-switcher for ADMIN users.
  //
  // FEATURE-01: For ADMIN with no specific shop selected, use org-wide mode.
  // For non-ADMIN users, branch_id filter is always enforced.
  useEffect(() => {
    if (isAdmin && !activeShopId) {
      // ADMIN org-wide: clear branch_id, set organization_id from JWT
      // The organization_id propagates to backend via JWT (server resolves it from identity)
      // We pass organization_id: undefined here — the backend derives it from the JWT for ADMIN
      setFilters({ branch_id: undefined, organization_id: undefined });
    } else {
      setFilters({ branch_id: activeShopId ?? undefined, organization_id: undefined });
    }
  }, [activeShopId, isAdmin, setFilters]);

  useEffect(() => {
    fetchExpenses();
    fetchCategories();
  }, [fetchExpenses, fetchCategories]);

  const isOrgWide = isAdmin && !activeShopId;

  return (
    <div className="flex flex-col gap-6 sm:gap-8 w-full max-w-7xl mx-auto pb-12">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ReceiptText className="h-6 w-6 text-blue-600 dark:text-blue-500" />
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
              Expenses
            </h1>
            {isOrgWide && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 text-xs font-semibold rounded-full">
                <Building2 className="w-3 h-3" /> All Branches
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {isOrgWide
              ? 'Organization-wide expense report — all branches visible.'
              : 'Track and categorize shop expenditures to calculate accurate net profit.'}
          </p>
        </div>
        
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Add Expense
        </button>
      </div>

      <ExpenseStatsCards />
      
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between mt-2">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
            {isOrgWide ? 'Organization-wide Expenses' : 'Recent Expenses'}
          </h2>
        </div>
        
        <ExpenseFilters isAdminView={isAdmin} />
        <ExpensesTable isAdminView={isAdmin} />
      </div>

      <ExpenseCreateModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};
