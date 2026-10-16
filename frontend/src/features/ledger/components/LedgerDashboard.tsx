'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLedger, SelectedParty } from '../hooks/useLedger';
import {
  Search, ArrowLeft, Building2, User, Receipt,
  TrendingUp, TrendingDown, DollarSign, AlertCircle
} from 'lucide-react';
import { LedgerBook } from './LedgerBook';
import { httpClient } from '@/lib/http/httpClient';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { usePermissions } from '@/lib/auth/usePermissions';

// ─── REST types ────────────────────────────────────────────────────────────────

interface CustomerSummary {
  id: string;
  customer_code: string;
  name: string;
  phone: string;
  outstanding_balance: number;
  credit_limit: number;
  is_active: boolean;
}

interface SupplierSummary {
  id: string;
  supplier_code: string;
  name: string;
  phone: string;
  outstanding_balance: number;
  credit_limit: number;
  is_active: boolean;
}

interface ExpenseRecord {
  id: string;
  expense_number: string;
  amount: number;
  description: string | null;
  notes: string | null;
  expense_date: string;
  category_name?: string | null;
  payment_method: string;
  status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRs(n: number): string {
  return `Rs ${Math.abs(n).toLocaleString('en-PK')}`;
}

function BalancePill({ balance, partyType }: { balance: number; partyType: 'CUSTOMER' | 'SUPPLIER' }) {
  if (balance === 0) {
    return <span className="text-base font-bold text-gray-400">Settled</span>;
  }
  if (partyType === 'CUSTOMER') {
    // Customer: positive balance = receivable (DR), negative = overpaid (CR)
    return (
      <span className={`text-base font-bold ${balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
        {formatRs(balance)}{' '}
        <span className="text-xs font-bold opacity-70">{balance > 0 ? 'DR' : 'CR'}</span>
      </span>
    );
  } else {
    // Supplier: positive = payable (CR), negative = overpaid (DR)
    return (
      <span className={`text-base font-bold ${balance > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
        {formatRs(balance)}{' '}
        <span className="text-xs font-bold opacity-70">{balance > 0 ? 'Payable' : 'Advance'}</span>
      </span>
    );
  }
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, icon: Icon, colorClass
}: {
  label: string; value: string; sub?: string;
  icon: React.FC<{ className?: string }>;
  colorClass: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4 shadow-sm">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClass}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-black text-gray-900 dark:text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs font-medium text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const LedgerDashboard: React.FC = () => {
  const { selectedParty, setSelectedParty } = useLedger();
  const [directoryTab, setDirectoryTab] = useState<'CUSTOMER' | 'SUPPLIER' | 'EXPENSE'>('CUSTOMER');
  const [searchTerm, setSearchTerm] = useState('');

  // ── Branch context ───────────────────────────────────────────────────────────
  // activeShop._id: the branch currently selected in the topbar switcher.
  // null means org-admin is viewing "All Shops" (org-wide rollup).
  // Branch users are always locked to their own branch by the backend;
  // passing their activeShopId is redundant but harmless (resolveBranch()
  // validates it matches identity.branch_id and rejects mismatches).
  const activeShopId = useOrganizationStore((state) => state.activeShop?._id ?? null);
  const { role } = usePermissions();
  const isOrgAdmin =
    role === 'OWNER' || role === 'SUPER_ADMIN' || role === 'MULTI_ADMIN' || role === 'ADMIN';

  // Effective branch for expense filtering:
  // - Org admin with a specific branch selected: pass that branch_id to the API.
  // - Org admin viewing "All Shops" (activeShopId === null): omit branch_id → org-wide.
  // - Branch user: backend ignores the param and locks to identity.branch_id anyway.
  const effectiveBranchId: string | null = activeShopId;

  // Build the expense URL with an optional branch_id query parameter.
  // The backend's resolveBranch() will enforce authorization server-side.
  const expenseUrl =
    effectiveBranchId
      ? `/api/v1/expenses?limit=200&branch_id=${encodeURIComponent(effectiveBranchId)}`
      : '/api/v1/expenses?limit=200';

  // ── Queries ─────────────────────────────────────────────────────────────────
  // Query keys include the branch context so that switching branches triggers
  // a fresh fetch and never reuses another branch's cached result.
  // Customers and suppliers are org-wide entities; their directories do not
  // change by branch, so their keys use a static 'all' sentinel. The expense
  // key includes the effective branch so a branch switch refetches.

  // Fetch customers via REST (org-wide — intentional)
  const { data: customersRaw = [], isLoading: isLoadingCustomers } = useQuery<CustomerSummary[]>({
    queryKey: ['ledger', 'customers', 'all'],
    queryFn: () => httpClient.get<CustomerSummary[]>('/api/customers?limit=500&is_active=true'),
    staleTime: 2 * 60 * 1000,
  });

  // Fetch suppliers via REST (org-wide — intentional)
  const { data: suppliersRaw = [], isLoading: isLoadingSuppliers } = useQuery<SupplierSummary[]>({
    queryKey: ['ledger', 'suppliers', 'all'],
    queryFn: () => httpClient.get<SupplierSummary[]>('/api/suppliers?limit=500&is_active=true'),
    staleTime: 2 * 60 * 1000,
  });

  // Fetch expenses via REST (branch-scoped when a specific branch is active)
  const { data: expensesRaw = [], isLoading: isLoadingExpenses } = useQuery<ExpenseRecord[]>({
    queryKey: ['ledger', 'expenses', effectiveBranchId ?? 'all'],
    queryFn: () => httpClient.get<ExpenseRecord[]>(expenseUrl),
    staleTime: 2 * 60 * 1000,
  });

  // If a party is selected, show its ledger book
  if (selectedParty) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-in fade-in">
        <button
          onClick={() => setSelectedParty(null)}
          className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Directory
        </button>
        <LedgerBook initialParty={selectedParty} />
      </div>
    );
  }

  // ── Search filter ────────────────────────────────────────────────────────────
  const customers = customersRaw.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      c.customer_code.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const suppliers = suppliersRaw.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone.includes(searchTerm) ||
      s.supplier_code.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const expenses = expensesRaw.filter(
    (e) =>
      (e.description ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.category_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.expense_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── Summary stats ────────────────────────────────────────────────────────────
  const totalReceivable = customers.reduce((s, c) => s + Math.max(0, c.outstanding_balance), 0);
  const totalPayable = suppliers.reduce((s, c) => s + Math.max(0, c.outstanding_balance), 0);
  const totalExpenses = expenses
    .filter((e) => e.status === 'ACTIVE')
    .reduce((s, e) => s + e.amount, 0);

  const isLoading =
    (directoryTab === 'CUSTOMER' && isLoadingCustomers) ||
    (directoryTab === 'SUPPLIER' && isLoadingSuppliers) ||
    (directoryTab === 'EXPENSE' && isLoadingExpenses);

  const TABS = [
    { key: 'CUSTOMER', label: 'Customers', sub: 'Receivables', icon: User, color: 'blue' },
    { key: 'SUPPLIER', label: 'Suppliers', sub: 'Payables', icon: Building2, color: 'teal' },
    { key: 'EXPENSE', label: 'Expenses', sub: 'Ledger', icon: Receipt, color: 'orange' },
  ] as const;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">General Ledger</h1>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">
          {isOrgAdmin && !effectiveBranchId
            ? 'Receivables, payables, and expense tracking across all branches'
            : 'Receivables, payables, and expense tracking'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="Total Receivable"
          value={`Rs ${totalReceivable.toLocaleString('en-PK')}`}
          sub={`${customers.length} customer${customers.length !== 1 ? 's' : ''}`}
          icon={TrendingUp}
          colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <SummaryCard
          label="Total Payable"
          value={`Rs ${totalPayable.toLocaleString('en-PK')}`}
          sub={`${suppliers.length} supplier${suppliers.length !== 1 ? 's' : ''}`}
          icon={TrendingDown}
          colorClass="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
        />
        <SummaryCard
          label="Total Expenses"
          value={`Rs ${totalExpenses.toLocaleString('en-PK')}`}
          sub={`${expenses.length} entries`}
          icon={DollarSign}
          colorClass="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
        />
      </div>

      {/* Directory panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">

        {/* Tabs + search */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 flex-wrap">
            {TABS.map(({ key, label, sub, icon: Icon, color }) => {
              const active = directoryTab === key;
              const activeColors: Record<string, string> = {
                blue: 'bg-blue-600 text-white shadow-md',
                teal: 'bg-teal-700 text-white shadow-md',
                orange: 'bg-orange-600 text-white shadow-md',
              };
              return (
                <button
                  key={key}
                  onClick={() => { setDirectoryTab(key); setSearchTerm(''); }}
                  className={`px-4 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-all ${
                    active
                      ? activeColors[color]
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                  <span className={`text-xs font-medium ${active ? 'opacity-80' : 'text-gray-400 dark:text-gray-500'}`}>
                    ({sub})
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder={`Search ${directoryTab.toLowerCase()}s…`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto min-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm font-medium">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-3" />
              Loading…
            </div>
          ) : directoryTab === 'EXPENSE' ? (
            /* ── Expense table ── */
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3 font-bold">Date</th>
                  <th className="px-6 py-3 font-bold">Number</th>
                  <th className="px-6 py-3 font-bold">Description</th>
                  <th className="px-6 py-3 font-bold">Category</th>
                  <th className="px-6 py-3 font-bold">Method</th>
                  <th className="px-6 py-3 font-bold text-right">Amount</th>
                  <th className="px-6 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-400 font-medium">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      No expenses found.
                    </td>
                  </tr>
                )}
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400 whitespace-nowrap font-medium">
                      {new Date(exp.expense_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {exp.expense_number}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-gray-900 dark:text-white">{exp.description || '—'}</span>
                      {exp.notes && <p className="text-xs text-gray-400 mt-0.5">{exp.notes}</p>}
                    </td>
                    <td className="px-6 py-4">
                      {exp.category_name ? (
                        <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 capitalize">
                          {exp.category_name}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400 font-medium capitalize">
                      {exp.payment_method.toLowerCase()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-base font-black text-red-600 dark:text-red-400">
                        Rs {exp.amount.toLocaleString('en-PK')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        exp.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 line-through'
                      }`}>
                        {exp.status === 'ACTIVE' ? 'Active' : 'Cancelled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* ── Customer / Supplier table ── */
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3 font-bold">{directoryTab === 'CUSTOMER' ? 'Customer' : 'Supplier'}</th>
                  <th className="px-6 py-3 font-bold">Code</th>
                  <th className="px-6 py-3 font-bold">Contact</th>
                  <th className="px-6 py-3 font-bold text-right">
                    {directoryTab === 'CUSTOMER' ? 'Receivable (DR)' : 'Payable (CR)'}
                  </th>
                  <th className="px-6 py-3 font-bold text-right">Credit Limit</th>
                  <th className="px-6 py-3 font-bold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {(directoryTab === 'CUSTOMER' ? customers : suppliers).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400 font-medium">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      No {directoryTab.toLowerCase()}s found.
                    </td>
                  </tr>
                )}
                {(directoryTab === 'CUSTOMER' ? customers : suppliers).map((party) => {
                  const bal = party.outstanding_balance;
                  return (
                    <tr
                      key={party.id}
                      className="hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <span className="font-black text-gray-900 dark:text-white text-base">{party.name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                          {directoryTab === 'CUSTOMER'
                            ? (party as CustomerSummary).customer_code
                            : (party as SupplierSummary).supplier_code}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400">{party.phone}</td>
                      <td className="px-6 py-4 text-right">
                        <BalancePill balance={bal} partyType={directoryTab as 'CUSTOMER' | 'SUPPLIER'} />
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-gray-500 dark:text-gray-400">
                        {party.credit_limit > 0 ? `Rs ${party.credit_limit.toLocaleString('en-PK')}` : '—'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() =>
                            setSelectedParty({
                              id: party.id,
                              type: directoryTab as 'CUSTOMER' | 'SUPPLIER',
                              name: party.name,
                              balance: party.outstanding_balance,
                              creditLimit: party.credit_limit,
                            })
                          }
                          className="px-4 py-1.5 text-sm font-bold text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg border border-blue-200 dark:border-blue-800 opacity-0 group-hover:opacity-100 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all"
                        >
                          View Ledger →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default LedgerDashboard;
