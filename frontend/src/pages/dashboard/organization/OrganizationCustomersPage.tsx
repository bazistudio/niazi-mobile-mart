import React, { useState } from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { 
  UserCheck, 
  CreditCard, 
  BarChart3, 
  Store
} from 'lucide-react';
import { CustomersTab } from '@/features/customers/components/CustomersTab';
import { CreditLedgerTab } from '@/features/customers/components/CreditLedgerTab';
import { AnalyticsTab } from '@/features/customers/components/AnalyticsTab';
import { useOrganizationStore } from '@/store/useOrganizationStore';

export function OrganizationCustomersPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'balances' | 'activity'>('all');
  const activeShop = useOrganizationStore((s) => s.activeShop);

  const customerSections = [
    { id: 'all', label: 'All Customers', icon: UserCheck, desc: 'Central organization customer profiles, contact info, and registration status.' },
    { id: 'balances', label: 'Customer Credit Ledger', icon: CreditCard, desc: 'Outstanding balances, credit limits, and aging ledger summary.' },
    { id: 'activity', label: 'Customer Analytics', icon: BarChart3, desc: 'Top debtors, credit distribution, and customer metrics.' },
  ];

  return (
    <OrganizationPageShell
      title="Organization Customers"
      description="Unified customer directory, cross-branch activity, and credit balances across the organization."
      badge={activeShop ? `Scope: ${activeShop.name}` : 'Scope: All Branches'}
    >
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200 dark:border-gray-800">
        {customerSections.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeTab === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveTab(sec.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200/60 dark:border-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Views */}
      {activeTab === 'all' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
          <CustomersTab />
        </div>
      )}

      {activeTab === 'balances' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
          <CreditLedgerTab />
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
          <AnalyticsTab />
        </div>
      )}
    </OrganizationPageShell>
  );
}

export default OrganizationCustomersPage;
