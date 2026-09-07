import React, { useState } from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { 
  BookOpen, 
  Store, 
  UserCheck, 
  Truck, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Receipt, 
  Scale,
  Search,
  Download
} from 'lucide-react';

export function OrganizationLedgerPage() {
  const [activeTab, setActiveTab] = useState('org');

  const ledgerSections = [
    { id: 'org', label: 'Organization Ledger', icon: BookOpen, desc: 'Enterprise chart of accounts and consolidated general ledger.' },
    { id: 'branches', label: 'Branch Ledgers', icon: Store, desc: 'Shop-specific sub-ledgers and inter-branch balance accounts.' },
    { id: 'customers', label: 'Customer Ledger', icon: UserCheck, desc: 'Central customer credit, debit lines, and outstanding balances.' },
    { id: 'suppliers', label: 'Supplier Ledger', icon: Truck, desc: 'Vendor payables, procurement dues, and payment records.' },
    { id: 'receivables', label: 'Receivables', icon: ArrowDownLeft, desc: 'Pending enterprise receivables and credit aging buckets.' },
    { id: 'payables', label: 'Payables', icon: ArrowUpRight, desc: 'Upcoming liabilities, vendor terms, and pending settlements.' },
    { id: 'transactions', label: 'Transactions', icon: Receipt, desc: 'Consolidated double-entry transaction journal across branches.' },
    { id: 'balance', label: 'Balance Summary', icon: Scale, desc: 'Consolidated trial balance and organization liquidity summary.' },
  ];

  const currentSection = ledgerSections.find((s) => s.id === activeTab) || ledgerSections[0];

  return (
    <OrganizationPageShell
      title="Organization Ledger"
      description="Consolidated financial ledger overview and cross-branch accounts reconciliation."
      badge="Financial Control"
      action={
        <button
          disabled
          className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-400 cursor-not-allowed shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Ledger</span>
        </button>
      }
    >
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200 dark:border-gray-800">
        {ledgerSections.map((sec) => {
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

      {/* Control / Filter Bar */}
      <div className="bg-white dark:bg-gray-800/90 rounded-xl p-4 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-auto flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${currentSection.label.toLowerCase()} entries...`}
              disabled
              className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-500 cursor-not-allowed"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-md">Currency: PKR</span>
          <span className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-md">Fiscal Year: Current</span>
        </div>
      </div>

      {/* Main Empty State View */}
      <div className="bg-white dark:bg-gray-800/90 rounded-xl p-12 border border-gray-200/80 dark:border-gray-700/80 shadow-sm text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 mx-auto flex items-center justify-center text-primary mb-4">
          <BookOpen className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {currentSection.label}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1.5 leading-relaxed">
          {currentSection.desc}
        </p>
        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs text-gray-500">
          <span>Consolidated ledger statements and cross-branch reconciliation will appear here.</span>
        </div>
      </div>
    </OrganizationPageShell>
  );
}

export default OrganizationLedgerPage;
