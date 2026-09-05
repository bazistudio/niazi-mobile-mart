import React from 'react';
import { ShopAdminDashboardLayout } from '@/features/dashboard/components/shop-admin/ShopAdminDashboardLayout';
import { GlobalAddExpenseModal } from '@/features/expenses/components/GlobalAddExpenseModal';
import { GlobalAddProductDrawer } from '@/features/inventory/components/GlobalAddProductDrawer';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ShopAdminDashboardLayout>
      {children}
      <GlobalAddExpenseModal />
      <GlobalAddProductDrawer />
    </ShopAdminDashboardLayout>
  );
}
