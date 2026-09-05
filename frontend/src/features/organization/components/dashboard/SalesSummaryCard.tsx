import React from 'react';
import { DashboardData } from '@/lib/api/organization.api';
import { TrendingUp, DollarSign } from 'lucide-react';

export const SalesSummaryCard = ({ sales }: { sales: DashboardData['sales'] }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6 border border-gray-100 flex flex-col justify-between">
      <div>
        <div className="flex items-center mb-6">
          <div className="p-2 bg-emerald-50 rounded-lg mr-3">
            <TrendingUp className="text-emerald-600" size={24} />
          </div>
          <h3 className="text-lg font-semibold text-gray-800">Sales Performance</h3>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500 font-medium">Today</span>
            <div className="flex items-center text-gray-900 font-bold">
              <span className="text-emerald-600 mr-1 text-sm">PKR</span>
              <span>{sales.today.toLocaleString()}</span>
            </div>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500 font-medium">This Month</span>
            <div className="flex items-center text-gray-900 font-bold">
              <span className="text-emerald-600 mr-1 text-sm">PKR</span>
              <span>{sales.month.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="pt-4 mt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 flex items-center">
          <DollarSign size={14} className="mr-1" />
          Analytics powered by Sales Module
        </p>
      </div>
    </div>
  );
};
