import React, { useState } from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { 
  History, 
  ShoppingCart, 
  Package, 
  Store, 
  UserCheck, 
  Truck, 
  Users, 
  Receipt,
  Search,
  Calendar
} from 'lucide-react';

export function OrganizationHistoryPage() {
  const [activeTab, setActiveTab] = useState('sales');

  const historySections = [
    { id: 'sales', label: 'Sales History', icon: Receipt, desc: 'Historical customer sales and checkout records across all branches.' },
    { id: 'purchase', label: 'Purchase History', icon: ShoppingCart, desc: 'Historical vendor orders and goods received notes.' },
    { id: 'inventory', label: 'Inventory History', icon: Package, desc: 'Historical stock adjustments, write-offs, and batch histories.' },
    { id: 'branch', label: 'Branch History', icon: Store, desc: 'Historical branch opening, status updates, and transfer records.' },
    { id: 'customer', label: 'Customer History', icon: UserCheck, desc: 'Historical customer orders, returns, and payment settlements.' },
    { id: 'supplier', label: 'Supplier History', icon: Truck, desc: 'Historical supplier transactions, returns, and payables history.' },
    { id: 'employee', label: 'Employee History', icon: Users, desc: 'Historical staffing assignments, role changes, and shift summaries.' },
  ];

  const currentSection = historySections.find((s) => s.id === activeTab) || historySections[0];

  return (
    <OrganizationPageShell
      title="Organization History"
      description="Consolidated historical business activity and operational records across all organization branches (distinct from security Audit Logs)."
      badge="Event Archives"
    >
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200 dark:border-gray-800">
        {historySections.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeTab === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveTab(sec.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
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

      {/* Filter / Search Bar (Placeholder) */}
      <div className="bg-white dark:bg-gray-800/90 rounded-xl p-4 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-auto flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${currentSection.label.toLowerCase()}...`}
              disabled
              className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-500 cursor-not-allowed"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-500">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            <span>All Dates</span>
          </div>
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-500">
            <span>All Branches</span>
          </div>
        </div>
      </div>

      {/* History Records Container (Empty State) */}
      <div className="bg-white dark:bg-gray-800/90 rounded-xl p-12 border border-gray-200/80 dark:border-gray-700/80 shadow-sm text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 mx-auto flex items-center justify-center text-primary mb-4">
          <History className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {currentSection.label} Records
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1.5 leading-relaxed">
          {currentSection.desc}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 italic">
          Historical event records will appear here as business operations occur across branches.
        </p>
      </div>
    </OrganizationPageShell>
  );
}

export default OrganizationHistoryPage;
