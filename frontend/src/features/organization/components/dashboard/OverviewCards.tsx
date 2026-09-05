import React from 'react';
import { DashboardData } from '@/lib/api/organization.api';
import { AlertTriangle, Activity, Package } from 'lucide-react';

export const InventoryAlertCard = ({ inventory }: { inventory: DashboardData['inventory'] }) => {
  const isAlert = inventory.lowStockProducts > 0;
  
  return (
    <div className={`bg-white rounded-lg shadow p-6 border ${isAlert ? 'border-orange-200' : 'border-gray-100'} flex flex-col justify-between`}>
      <div>
        <div className="flex items-center mb-6">
          <div className={`p-2 rounded-lg mr-3 ${isAlert ? 'bg-orange-50' : 'bg-gray-50'}`}>
            <AlertTriangle className={isAlert ? 'text-orange-500' : 'text-gray-400'} size={24} />
          </div>
          <h3 className="text-lg font-semibold text-gray-800">Inventory Alerts</h3>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 mb-1">Low Stock Products</p>
            <p className={`text-2xl font-bold ${isAlert ? 'text-orange-600' : 'text-gray-900'}`}>
              {inventory.lowStockProducts}
            </p>
          </div>
        </div>
      </div>
      
      <div className="pt-4 mt-4 border-t border-gray-100">
        <button className="text-sm font-medium text-blue-600 hover:text-blue-700">
          View Inventory →
        </button>
      </div>
    </div>
  );
};

export const RecentActivity = ({ activity }: { activity: DashboardData['recentActivity'] }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6 border border-gray-100 h-full">
      <div className="flex items-center mb-6">
        <div className="p-2 bg-purple-50 rounded-lg mr-3">
          <Activity className="text-purple-600" size={24} />
        </div>
        <h3 className="text-lg font-semibold text-gray-800">Recent Activity</h3>
      </div>

      <div className="space-y-6">
        {activity.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No recent activity to show
          </div>
        ) : (
          activity.map((item, index) => (
            <div key={index} className="flex relative">
              {index !== activity.length - 1 && (
                <div className="absolute top-8 bottom-[-24px] left-[11px] w-px bg-gray-200"></div>
              )}
              <div className="relative z-10 w-6 h-6 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center mr-4 mt-1">
                <div className="w-2 h-2 rounded-full bg-blue-600"></div>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{item.action}</p>
                <p className="text-sm text-gray-500 mt-1">{item.details}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(item.date).toLocaleString()}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
