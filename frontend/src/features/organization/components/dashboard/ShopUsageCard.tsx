import React from 'react';
import { DashboardData } from '@/lib/api/organization.api';
import { Store, Users } from 'lucide-react';

export const ShopUsageCard = ({ shops, employees }: { shops: DashboardData['shops'], employees: DashboardData['employees'] }) => {
  const percentage = shops.limit === 'Unlimited' ? 0 : Math.min(100, Math.round((shops.current / shops.limit) * 100));
  
  return (
    <div className="bg-white rounded-lg shadow p-6 border border-gray-100 flex flex-col justify-between">
      <div>
        <div className="flex items-center mb-4">
          <div className="p-2 bg-indigo-50 rounded-lg mr-3">
            <Store className="text-indigo-600" size={24} />
          </div>
          <h3 className="text-lg font-semibold text-gray-800">Usage Limits</h3>
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-end mb-2">
            <span className="text-sm text-gray-500 font-medium">Shops</span>
            <span className="text-lg font-bold text-gray-900">
              {shops.current} / {shops.limit}
            </span>
          </div>
          {shops.limit !== 'Unlimited' && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${percentage > 90 ? '' : percentage > 75 ? 'bg-yellow-500' : 'bg-indigo-600'}`}
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
        <div className="flex items-center text-gray-600">
          <Users size={16} className="mr-2" />
          <span className="text-sm font-medium">Employees</span>
        </div>
        <span className="font-bold text-gray-900">{employees.total}</span>
      </div>
    </div>
  );
};
