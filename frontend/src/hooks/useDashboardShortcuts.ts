import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTerminalStore } from '@/store/useTerminalStore';

export const useDashboardShortcuts = () => {
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Check for Ctrl + Shift + {Key} (Existing shortcuts)
      if (e.ctrlKey && e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'c':
            e.preventDefault();
            router.push('/dashboard/shop-admin/customers?tab=customers');
            break;
          case 'l':
            e.preventDefault();
            router.push('/dashboard/shop-admin/customers?tab=ledger');
            break;
          case 'a':
            e.preventDefault();
            router.push('/dashboard/shop-admin/customers?tab=analytics');
            break;
        }
        return;
      }

      // 2. Check for Ctrl + {Key} (P0 Global Navigation & Terminal Lock shortcuts)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'l':
            // Lock Terminal
            e.preventDefault();
            useTerminalStore.getState().setTerminalLocked(true);
            break;
          case 'p':
            // Fast Navigate to POS
            e.preventDefault();
            router.push('/dashboard/shop-admin/pos');
            break;
          case 'd':
            // Navigate to Dashboard
            e.preventDefault();
            router.push('/dashboard/shop-admin');
            break;
          case 'i':
            // Navigate to Inventory & Products
            e.preventDefault();
            router.push('/dashboard/shop-admin/inventory');
            break;
          case 'o':
            // Navigate to Operations / Expenses
            e.preventDefault();
            router.push('/dashboard/shop-admin/expenses');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);
};

