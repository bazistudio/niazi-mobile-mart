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
  Download,
  Info
} from 'lucide-react';
import { LedgerDashboard } from '@/features/ledger/components/LedgerDashboard';
import { CreditLedgerTab } from '@/features/customers/components/CreditLedgerTab';
import { HistoryTable, HistoryStatsCards, HistoryFilters, useHistoryStore } from '@/features/history';
import { useOrganizationStore } from '@/store/useOrganizationStore';

export function OrganizationLedgerPage() {
  const [activeTab, setActiveTab] = useState<string>('org');
  const activeBranchId = useOrganizationStore((state) => state.activeShop?._id ?? null);
  const activeShop = useOrganizationStore((state) => state.activeShop);

  const ledgerSections = [
    { id: 'org', label: 'Organization Ledger', icon: BookOpen, desc: 'Enterprise chart of accounts and consolidated general ledger.' },
    { id: 'branches', label: 'Branch Ledgers', icon: Store, desc: 'Shop-specific sub-ledgers and inter-branch balance accounts.' },
    { id: 'customers', label: 'Customer Ledger', icon: UserCheck, desc: 'Central customer credit, debit lines, and outstanding balances.' },
    { id: 'suppliers', label: 'Supplier Ledger', icon: Truck, desc: 'Vendor payables, procurement dues, and payment records.' },
    { id: 'receivables', label: 'Receivables & Payables', icon: ArrowDownLeft, desc: 'Pending enterprise receivables and supplier liabilities.' },
    { id: 'transactions', label: 'Transactions Journal', icon: Receipt, desc: 'Consolidated double-entry transaction journal across branches.' },
    { id: 'balance', label: 'Balance Summary', icon: Scale, desc: 'Consolidated trial balance and organization liquidity summary.' },
  ];

  const currentSection = ledgerSections.find((s) => s.id === activeTab) || ledgerSections[0];

  return (
    <OrganizationPageShell
      title="Organization Ledger"
      description="Consolidated financial ledger overview, customer credit accounts, and cross-branch accounts reconciliation."
      badge={activeShop ? `Scope: ${activeShop.name}` : 'Scope: All Branches'}
      action={
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Print / Export</span>
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

      {/* Tab 1: Organization Ledger & Balance Summary */}
      {(activeTab === 'org' || activeTab === 'balance' || activeTab === 'receivables') && (
        <div className="space-y-4">
          <LedgerDashboard />
        </div>
      )}

      {/* Tab 2: Branch Ledgers */}
      {activeTab === 'branches' && (
        <div className="space-y-4">
          <div className="bg-blue-50/70 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-900 dark:text-blue-200">
              <p className="font-semibold">Branch Sub-Ledger View</p>
              <p className="text-xs mt-0.5 text-blue-700 dark:text-blue-300">
                Viewing ledger for: <strong>{activeShop ? activeShop.name : 'Consolidated (All Branches)'}</strong>. Use the topbar branch switcher to inspect individual physical branch ledgers.
              </p>
            </div>
          </div>
          <LedgerDashboard />
        </div>
      )}

      {/* Tab 3: Customer Ledger */}
      {activeTab === 'customers' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
          <CreditLedgerTab />
        </div>
      )}

      {/* Tab 4: Supplier Ledger (Truthful phase status) */}
      {activeTab === 'suppliers' && (
        <div className="bg-white dark:bg-gray-800/90 rounded-xl p-12 border border-gray-200/80 dark:border-gray-700/80 shadow-sm text-center">
          <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 mx-auto flex items-center justify-center text-orange-600 dark:text-orange-400 mb-4">
            <Truck className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Supplier Ledger Module
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1.5 leading-relaxed">
            Central vendor procurement and supplier ledger statements are scheduled for full rollout in Phase 6. Customer credit and operational expense ledgers are fully active in the Organization Ledger tab.
          </p>
        </div>
      )}

      {/* Tab 5: Transactions Journal */}
      {activeTab === 'transactions' && (
        <div className="space-y-6">
          <HistoryStatsCards />
          <HistoryFilters />
          <HistoryTable />
        </div>
      )}
    </OrganizationPageShell>
  );
}

export default OrganizationLedgerPage;
