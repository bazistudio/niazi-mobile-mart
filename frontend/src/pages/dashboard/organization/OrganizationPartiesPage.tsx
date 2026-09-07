import React, { useState } from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { 
  Contact2, 
  UserCheck, 
  Truck, 
  Users, 
  Scale, 
  Receipt, 
  History,
  Search,
  Plus
} from 'lucide-react';

export function OrganizationPartiesPage() {
  const [activeTab, setActiveTab] = useState('all');

  const partySections = [
    { id: 'all', label: 'All Parties', icon: Contact2, desc: 'Consolidated commercial contacts across customers, vendors, and strategic partners.' },
    { id: 'customers', label: 'Customers', icon: UserCheck, desc: 'Registered customer parties with linked retail and wholesale accounts.' },
    { id: 'suppliers', label: 'Suppliers', icon: Truck, desc: 'Commercial supplier entities with active trade accounts.' },
    { id: 'other', label: 'Other Parties', icon: Users, desc: 'Third-party logistics, contractors, and secondary commercial contacts.' },
    { id: 'balances', label: 'Balances', icon: Scale, desc: 'Net credit/debit balances across all commercial relationships.' },
    { id: 'transactions', label: 'Transactions', icon: Receipt, desc: 'Commercial transaction entries and payment allocation history.' },
    { id: 'history', label: 'History', icon: History, desc: 'Chronological party engagement and account activity log.' },
  ];

  const currentSection = partySections.find((s) => s.id === activeTab) || partySections[0];

  return (
    <OrganizationPageShell
      title="Parties & Stakeholders"
      description="Unified organization directory of commercial parties, business partners, customers, and suppliers."
      badge="Party Directory"
      action={
        <button
          disabled
          className="flex items-center gap-2 px-3.5 py-2 bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-medium cursor-not-allowed shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Party</span>
        </button>
      }
    >
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200 dark:border-gray-800">
        {partySections.map((sec) => {
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

      {/* Filter / Search Bar */}
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

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-md">Scope: Entire Enterprise</span>
        </div>
      </div>

      {/* Main Empty State View */}
      <div className="bg-white dark:bg-gray-800/90 rounded-xl p-12 border border-gray-200/80 dark:border-gray-700/80 shadow-sm text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 mx-auto flex items-center justify-center text-primary mb-4">
          <Contact2 className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {currentSection.label} Directory
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1.5 leading-relaxed">
          {currentSection.desc}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 italic">
          Consolidated party profiles, contact hierarchies, and combined balances will appear here.
        </p>
      </div>
    </OrganizationPageShell>
  );
}

export default OrganizationPartiesPage;
