"use client";

import React, { useState, useMemo } from 'react';
import { Plus, Search, Edit, Trash2, BookOpen, Users, DollarSign, Activity } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customerApi } from '@/services/customer.api';
import { useRouter } from 'next/navigation';
import { CustomerFormDrawer } from './modals/AddCustomerDrawer';
import toast from 'react-hot-toast';
import { useTenantQueryKeys } from '@/lib/react-query/useTenantQueryKeys';
import { invalidateQueries } from '@/lib/react-query/invalidate';
import { useAuthStore } from '@/lib/auth/core/auth.store';

export const CustomersTab = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const keys = useTenantQueryKeys();
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);

  const { data: customerResponse, isLoading } = useQuery({
    queryKey: keys.customers,
    queryFn: () => customerApi.getCustomers(),
    staleTime: 30000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const customers = customerResponse?.data || [];

  const filteredCustomers = useMemo(() => {
    return customers.filter((c: any) => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (c.phone || c.mobile || '').includes(searchTerm)
    );
  }, [customers, searchTerm]);

  const kpis = useMemo(() => {
    return customers.reduce((acc: any, c: any) => {
      acc.totalBalance += (c.currentBalance || 0);
      acc.totalCreditLimit += (c.creditLimit || 0);
      return acc;
    }, { totalBalance: 0, totalCreditLimit: 0 });
  }, [customers]);

  const navigateToLedger = (customerId: string) => {
    router.push(`/dashboard/shop-admin/customers/${customerId}`);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      try {
        await customerApi.deleteCustomer(id);
        invalidateQueries.customers(queryClient, user);
        toast.success('Customer deleted successfully');
      } catch (error: any) {
        toast.error(error?.response?.data?.message || 'Failed to delete customer');
      }
    }
  };

  const handleEdit = (customer: any) => {
    setEditingCustomer(customer);
    setIsAddModalOpen(true);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      
      {/* KPI Dashboard Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-[#006970]/5 dark:bg-[#006970]/10 rounded-full group-hover:scale-110 transition-transform duration-500" />
          <div className="flex items-center gap-4 relative">
            <div className="p-3 bg-[#006970]/10 text-[#006970] dark:bg-[#006970]/20 dark:text-[#00B4BB] rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Total Customers</p>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-1">{customers.length}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-orange-500/5 dark:bg-orange-500/10 rounded-full group-hover:scale-110 transition-transform duration-500" />
          <div className="flex items-center gap-4 relative">
            <div className="p-3 bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 rounded-xl">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Total Balance</p>
              <h3 className="text-2xl font-black text-orange-600 dark:text-orange-400 mt-1 tabular-nums">Rs {kpis.totalBalance.toLocaleString()}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/5 dark:bg-blue-500/10 rounded-full group-hover:scale-110 transition-transform duration-500" />
          <div className="flex items-center gap-4 relative">
            <div className="p-3 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-xl">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Total Credit Limit</p>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-1 tabular-nums">Rs {kpis.totalCreditLimit.toLocaleString()}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex-1 flex flex-col overflow-hidden">
        
        {/* Toolbar */}
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50/50 dark:bg-gray-800/20">
          <div className="relative w-full sm:w-96">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006970] focus:border-transparent text-sm transition-all shadow-sm"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => {
              setEditingCustomer(null);
              setIsAddModalOpen(true);
            }}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-linear-to-r from-[#006970] to-[#008990] hover:from-[#00585e] hover:to-[#00767c] text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            <Plus className="w-5 h-5" />
            New Customer
          </button>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50/80 dark:bg-gray-800/80 sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Customer Details</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Contact Info</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Current Balance</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Credit Limit</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Status</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-50 dark:divide-gray-800/50">
              {filteredCustomers.map((customer: any) => (
                <tr key={customer.id} className="hover:bg-[#006970]/5 dark:hover:bg-[#006970]/10 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="shrink-0 h-10 w-10 bg-[#006970]/10 dark:bg-[#006970]/20 rounded-xl flex items-center justify-center text-[#006970] dark:text-[#00B4BB] font-black text-lg shadow-sm">
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="ml-4">
                        <button 
                          onClick={() => navigateToLedger(customer.id)}
                          className="text-sm font-bold text-gray-900 dark:text-white hover:text-[#006970] dark:hover:text-[#00B4BB] transition-colors"
                        >
                          {customer.name}
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white font-medium">{customer.phone || customer.mobile || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-black tabular-nums ${customer.currentBalance > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-gray-300'}`}>
                      Rs {(customer.currentBalance || 0).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-gray-300 font-medium tabular-nums">
                      Rs {(customer.creditLimit || 0).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-black uppercase tracking-wider rounded-full shadow-sm ${
                      customer.currentBalance > customer.creditLimit 
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800/50' 
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50'
                    }`}>
                      {customer.currentBalance > customer.creditLimit ? 'Over Limit' : 'Active'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all" 
                        title="Edit Customer"
                        onClick={() => handleEdit(customer)}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        className="p-2 text-gray-400 hover:text-[#006970] hover:bg-[#006970]/10 dark:hover:bg-[#006970]/30 rounded-lg transition-all" 
                        title="View Ledger & Profile"
                        onClick={() => navigateToLedger(customer.id)}
                      >
                        <BookOpen className="w-4 h-4" />
                      </button>
                      <button 
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all" 
                        title="Delete Customer"
                        onClick={() => handleDelete(customer.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
                      <Users className="w-12 h-12 mb-3 opacity-20" />
                      <p className="text-sm font-medium">{isLoading ? 'Loading customers...' : 'No customers found matching your search.'}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CustomerFormDrawer 
        isOpen={isAddModalOpen} 
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingCustomer(null);
        }} 
        customers={customers}
        editingCustomer={editingCustomer}
      />
    </div>
  );
};

