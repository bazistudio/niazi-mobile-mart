import React, { useMemo } from 'react';
import { Users, CreditCard, TrendingUp, UserPlus, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { customerApi } from '@/services/customer.api';
import { useTenantQueryKeys } from '@/lib/react-query/useTenantQueryKeys';

export const AnalyticsTab = () => {
  const keys = useTenantQueryKeys();
  const { data: customerResponse } = useQuery({
    queryKey: keys.customers,
    queryFn: () => customerApi.getCustomers(),
    staleTime: 30000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const customers = customerResponse?.data || [];
  
  const totalCustomers = customers.length;
  
  const outstandingReceivables = useMemo(() => {
    return customers.reduce((sum, c) => {
      return c.currentBalance > 0 ? sum + c.currentBalance : sum;
    }, 0);
  }, [customers]);

  const topDebtors = useMemo(() => {
    return [...customers]
      .filter(c => c.currentBalance > 0)
      .sort((a, b) => b.currentBalance - a.currentBalance)
      .slice(0, 5); // Top 5
  }, [customers]);

  // For V1, these require more complex queries and Date logic, defaulting to placeholders
  const collectedThisMonth = 0; 
  const newThisMonth = 0; 

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-8 space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Customers</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{totalCustomers}</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Outstanding Receivables</p>
              <h3 className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">Rs {outstandingReceivables.toLocaleString()}</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
              <FileText className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm opacity-70 relative overflow-hidden">
          <div className="absolute top-2 right-2 bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full dark:bg-yellow-900/50 dark:text-yellow-400">
            Coming Soon
          </div>
          <div className="flex items-center justify-between mt-2">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Collected This Month</p>
              <h3 className="text-2xl font-bold text-gray-400 dark:text-gray-500 mt-1">Rs ---</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm opacity-70 relative overflow-hidden">
          <div className="absolute top-2 right-2 bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full dark:bg-yellow-900/50 dark:text-yellow-400">
            Coming Soon
          </div>
          <div className="flex items-center justify-between mt-2">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">New This Month</p>
              <h3 className="text-2xl font-bold text-gray-400 dark:text-gray-500 mt-1">---</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <UserPlus className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Top Debtors Section */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#006970] dark:text-[#00B4BB]" />
            Top Credit Customers
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Customers with the highest outstanding balances.</p>
        </div>
        
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {topDebtors.map((debtor, index) => (
            <div key={debtor.id} className="flex items-center justify-between p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-400 font-bold text-sm">
                  {index + 1}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">{debtor.name}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{debtor.mobile}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-red-600 dark:text-red-400">
                  Rs {debtor.currentBalance.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
          {topDebtors.length === 0 && (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No outstanding balances found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
