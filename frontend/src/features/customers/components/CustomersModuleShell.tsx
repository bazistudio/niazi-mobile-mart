'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Users, BookOpen, BarChart3 } from 'lucide-react';
import { CustomersTab } from './CustomersTab';
import { CreditLedgerTab } from './CreditLedgerTab';
import { AnalyticsTab } from './AnalyticsTab';

export const CustomersModuleShell = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<'customers' | 'ledger' | 'analytics'>('customers');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'ledger' || tab === 'analytics' || tab === 'customers') {
      setActiveTab(tab as any);
    }
  }, [searchParams]);

  const handleTabChange = (tab: 'customers' | 'ledger' | 'analytics') => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Module Header & Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Customers
        </h1>
        
        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          <button
            onClick={() => handleTabChange('customers')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'customers'
                ? 'bg-white dark:bg-gray-700 text-[#006970] dark:text-[#00B4BB] shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <Users className="w-4 h-4" />
            Customers
          </button>
          <button
            onClick={() => handleTabChange('ledger')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'ledger'
                ? 'bg-white dark:bg-gray-700 text-[#006970] dark:text-[#00B4BB] shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Credit Ledger
          </button>
          <button
            onClick={() => handleTabChange('analytics')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'analytics'
                ? 'bg-white dark:bg-gray-700 text-[#006970] dark:text-[#00B4BB] shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Analytics
          </button>
        </div>
      </div>

      {/* Active Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'customers' && <CustomersTab />}
        {activeTab === 'ledger' && <CreditLedgerTab />}
        {activeTab === 'analytics' && <AnalyticsTab />}
      </div>
    </div>
  );
};
