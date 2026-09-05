'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { salesApi } from '@/services/sales.api';
import { Search, Printer, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useTenantQueryKeys } from '@/lib/react-query/useTenantQueryKeys';

export const TransactionTimeline = () => {
  const keys = useTenantQueryKeys();
  const [searchTerm, setSearchTerm] = useState('');
  
  const { data: ordersResponse, isLoading } = useQuery({
    queryKey: keys.orders,
    queryFn: () => salesApi.getOrders(),
    staleTime: 30000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const orders = ordersResponse?.data || [];

  const filteredTransactions = orders.map((order: any) => ({
    transactionId: order.orderNumber,
    createdAt: new Date(order.createdAt).getTime(),
    transactionType: 'sale', // Default to sale
    customer: order.customerId ? { name: order.customerId.name } : null,
    grandTotal: order.grandTotal ?? order.totalAmount ?? 0,
    status: order.status
  })).filter(t => 
    t.transactionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.customer?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Transaction Audit Log</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search TXN ID or Customer..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:ring-[#006970] focus:border-[#006970]"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 uppercase tracking-wider text-xs">
            <tr>
              <th className="px-4 py-1.5 font-semibold">Date & Time</th>
              <th className="px-4 py-1.5 font-semibold">Transaction ID</th>
              <th className="px-4 py-1.5 font-semibold">Type</th>
              <th className="px-4 py-1.5 font-semibold">Customer</th>
              <th className="px-4 py-1.5 font-semibold text-right">Amount</th>
              <th className="px-4 py-1.5 font-semibold text-center">Status</th>
              <th className="px-4 py-1.5 font-semibold text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {filteredTransactions.map((txn: any) => (
              <tr key={txn.transactionId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-1.5 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {format(new Date(txn.createdAt), 'dd MMM, yy hh:mm a')}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-1.5 whitespace-nowrap font-mono text-xs text-gray-500">
                  {txn.transactionId}
                </td>
                <td className="px-4 py-1.5 whitespace-nowrap">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    txn.transactionType === 'sale' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    txn.transactionType === 'replace_exchange' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {txn.transactionType.toUpperCase().replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-1.5 whitespace-nowrap text-gray-700 dark:text-gray-300">
                  {txn.customer?.name || 'Walk-In Customer'}
                </td>
                <td className="px-4 py-1.5 whitespace-nowrap text-right font-bold tabular-nums">
                  ₨ {(txn.grandTotal || 0).toLocaleString()}
                </td>
                <td className="px-4 py-1.5 whitespace-nowrap text-center">
                  {txn.status === 'locked' ? (
                    <div className="flex items-center justify-center gap-1 text-green-600 dark:text-green-400" title="Securely Locked & Hashed">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-xs font-semibold">LOCKED</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1 text-yellow-600 dark:text-yellow-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs font-semibold">{txn.status.toUpperCase()}</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-1.5 whitespace-nowrap text-center">
                  <button className="p-1.5 text-gray-400 hover:text-[#006970] hover:bg-[#006970]/10 rounded-lg transition-colors" title="Reprint Invoice">
                    <Printer className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {filteredTransactions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-1.5 text-center text-gray-500">
                  {isLoading ? 'Loading transactions...' : 'No transactions found matching your search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
