'use client';

import React from 'react';
import { useExpensesStore } from '../store/expenses.store';
import { ExpenseCreateModal } from './ExpenseCreateModal';

export const GlobalAddExpenseModal: React.FC = () => {
  const { isGlobalModalOpen, setGlobalModalOpen } = useExpensesStore();

  return (
    <ExpenseCreateModal 
      isOpen={isGlobalModalOpen} 
      onClose={() => setGlobalModalOpen(false)} 
    />
  );
};
