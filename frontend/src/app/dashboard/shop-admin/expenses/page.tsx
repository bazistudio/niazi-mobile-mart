'use client';

import React, { useEffect, useState } from 'react';
import { ExpenseStatsCards, ExpensesTable, ExpenseCreateModal, ExpenseFilters, useExpensesStore } from '@/features/expenses';
import { ReceiptText, Plus } from 'lucide-react';

export default function ExpensesPage() {
  const { fetchExpenses } = useExpensesStore();
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  return (
    <div className="flex flex-col gap-6 sm:gap-8 w-full max-w-7xl mx-auto pb-12">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ReceiptText className="h-6 w-6 text-blue-600 dark:text-blue-500" />
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
              Expenses
            </h1>
          </div>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Track and categorize shop expenditures to calculate accurate net profit.
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
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Recent Expenses</h2>
        </div>
        
        <ExpenseFilters />
        <ExpensesTable />
      </div>

      <ExpenseCreateModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
