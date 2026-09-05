import React, { useEffect, useRef, useState } from 'react';
import { PosHeader } from '@/features/pos/components/PosHeader';
import { SaleWorkspace } from '@/features/pos/components/SaleWorkspace';
import { ReturnOverflowModal } from '@/features/pos/components/ReturnOverflowModal';
import { InvoiceReceipt } from '@/features/pos/components/invoice/InvoiceReceipt';
import { usePosStore } from '@/features/pos/store/usePosStore';
import { toast } from 'react-hot-toast';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { Store } from 'lucide-react';

export function POSPage() {
  const { saleTabs } = usePosStore();
  const { viewMode } = useOrganizationStore();
  const [mounted, setMounted] = useState(false);
  const notified = useRef(false);

  // Fix hydration mismatch by only rendering after mount, and handle recovery toast
  useEffect(() => {
    setMounted(true);
    
    if (!notified.current) {
      notified.current = true;
      // If we boot up and there is more than 1 tab, OR the 1 tab has items, we consider it a recovery
      const hasRecoveredData = saleTabs.length > 1 || saleTabs[0].cart.length > 0 || saleTabs[0].status !== 'draft';
      if (hasRecoveredData) {
        toast.success(`Recovered Previous POS Session (${saleTabs.length} active sales restored)`, {
          duration: 4000,
          position: 'top-center',
          style: {
            background: '#006970',
            color: '#fff',
            fontWeight: '600'
          }
        });
      }
    }
  }, [saleTabs]);

  if (!mounted) return null;

  if (viewMode === 'organization') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full w-full bg-gray-50 dark:bg-gray-900">
        <Store className="w-16 h-16 text-gray-400 mb-4" />
        <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200">Select a shop to start selling</h2>
        <p className="text-gray-500 mt-2">The POS system requires a specific shop context.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 h-full w-full min-h-0 relative">
      <PosHeader />
      <SaleWorkspace />
      <ReturnOverflowModal />
      <InvoiceReceipt />
    </div>
  );
}

export default POSPage;
