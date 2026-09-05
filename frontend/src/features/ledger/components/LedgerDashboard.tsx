'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLedger, SelectedParty } from '../hooks/useLedger';
import { customerApi } from '@/services/customer.api';
import { supplierApi } from '@/services/supplier.api';
import { Search, ArrowLeft, Building2, User, Wallet, History, FileText, Download, Receipt } from 'lucide-react';
import { LedgerBook } from './LedgerBook'; // We will create this
import { useTenantQueryKeys } from '@/lib/react-query/useTenantQueryKeys';
import { partyApi } from '@/services/party.api';
import { expensesApi } from '@/features/expenses/services/expenses.api';
import { Users } from 'lucide-react';

export const LedgerDashboard: React.FC = () => {
  const keys = useTenantQueryKeys();
  const { selectedParty, setSelectedParty } = useLedger();
  const [directoryTab, setDirectoryTab] = useState<'CUSTOMER' | 'SUPPLIER' | 'PARTY' | 'EXPENSE'>('CUSTOMER');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch directories
  const { data: customersData, isLoading: isLoadingCustomers } = useQuery({
    queryKey: keys.customers,
    queryFn: () => customerApi.getCustomers(1, 1000)
  });

  const { data: suppliersData, isLoading: isLoadingSuppliers } = useQuery({
    queryKey: keys.suppliers,
    queryFn: () => supplierApi.getSuppliers(1, 1000)
  });

  const { data: partiesData, isLoading: isLoadingParties } = useQuery({
    queryKey: ['parties'],
    queryFn: () => partyApi.getParties(1, 1000)
  });

  const { data: expensesData, isLoading: isLoadingExpenses } = useQuery({
    queryKey: ['expensesList'],
    queryFn: () => expensesApi.getExpenses({ limit: 100 })
  });

  if (selectedParty) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-in fade-in">
        <button 
          onClick={() => setSelectedParty(null)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Directory
        </button>
        <LedgerBook initialParty={selectedParty} />
      </div>
    );
  }

  const isExpenseTab = directoryTab === 'EXPENSE';

  // Directory View
  const listToRender = directoryTab === 'CUSTOMER' ? (customersData?.data || []) 
    : directoryTab === 'SUPPLIER' ? (suppliersData?.data || []) 
    : directoryTab === 'PARTY' ? (partiesData?.data || [])
    : (expensesData?.data || []);

  const filteredList = listToRender.filter((item: any) => {
    if (isExpenseTab) {
      return item.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
             item.category?.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return item.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
           item.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           item.phone?.includes(searchTerm);
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">General Ledger</h1>
        <p className="text-gray-500 dark:text-gray-400">Manage receivable and payable accounts</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        
        {/* Directory Header Tabs & Search */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-4 sm:space-y-0 sm:flex sm:items-center sm:justify-between bg-gray-50 dark:bg-gray-800/50">
          <div className="flex gap-2">
            <button
              onClick={() => setDirectoryTab('CUSTOMER')}
              className={`px-4 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-colors ${
                directoryTab === 'CUSTOMER' 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <User className="w-4 h-4" /> Customers (Receivables)
            </button>
            <button
              onClick={() => setDirectoryTab('SUPPLIER')}
              className={`px-4 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-colors ${
                directoryTab === 'SUPPLIER' 
                ? 'bg-[#006970] text-white shadow-md' 
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Building2 className="w-4 h-4" /> Suppliers (Payables)
            </button>
            <button
              onClick={() => setDirectoryTab('PARTY')}
              className={`px-4 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-colors ${
                directoryTab === 'PARTY' 
                ? 'bg-purple-600 text-white shadow-md' 
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Users className="w-4 h-4" /> Parties (Unified)
            </button>
            <button
              onClick={() => setDirectoryTab('EXPENSE')}
              className={`px-4 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-colors ${
                directoryTab === 'EXPENSE' 
                ? ' text-white shadow-md' 
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Receipt className="w-4 h-4" /> Expenses
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${directoryTab.toLowerCase()}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            />
          </div>
        </div>

        {/* Directory List */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              {isExpenseTab ? (
                <tr>
                  <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Date</th>
                  <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Expense Details</th>
                  <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Category</th>
                  <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white text-right">Amount</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Party Name</th>
                  <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Contact</th>
                  <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white text-right">Current Balance</th>
                  <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white text-right">Action</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredList.map((item: any) => {
                if (isExpenseTab) {
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group">
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                        {new Date(item.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900 dark:text-white">{item.title}</div>
                        {item.note && <div className="text-xs text-gray-500">{item.note}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 capitalize">
                          {item.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-bold text-red-600 dark:text-red-400">
                          Rs {item.amount?.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                }

                const party = item;
                const bal = party.currentBalance || 0;
                const isCredit = bal < 0;
                
                return (
                  <tr key={party.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900 dark:text-white">{party.name || party.contactPerson}</div>
                      {party.companyName && <div className="text-xs text-gray-500">{party.companyName}</div>}
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{party.phone}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-bold ${
                        isCredit 
                          ? 'text-green-600 dark:text-green-400' 
                          : bal > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'
                      }`}>
                        Rs {Math.abs(bal).toLocaleString()} {isCredit ? '(CR)' : bal > 0 ? '(DR)' : ''}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          if (directoryTab === 'PARTY') {
                            window.location.href = `/dashboard/shop-admin/parties/${party.id}`;
                          } else {
                            setSelectedParty({
                              id: party.id,
                              type: directoryTab,
                              name: party.name || party.contactPerson,
                              balance: party.currentBalance,
                              creditLimit: party.creditLimit
                            });
                          }
                        }}
                        className="px-4 py-1.5 text-sm font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        View Ledger
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredList.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    No {directoryTab.toLowerCase()}s found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
