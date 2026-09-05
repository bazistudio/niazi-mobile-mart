import React from 'react';
import { Building2, ShieldCheck } from 'lucide-react';

export const SubscriptionCard = () => {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-gray-800">
      <div className="flex items-center mb-4">
        <div className="p-2.5 bg-[#006970]/10 dark:bg-[#00B4BB]/10 rounded-xl mr-3">
          <Building2 className="text-[#006970] dark:text-[#00B4BB]" size={22} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Enterprise Status</h3>
          <p className="text-xs text-gray-400">Headquarters Control</p>
        </div>
      </div>
      
      <div className="mb-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Deployment Model</p>
        <p className="text-base font-bold text-gray-900 dark:text-white">Dedicated Business ERP</p>
      </div>

      <div className="flex justify-between items-center pt-3 border-t border-gray-100 dark:border-gray-800">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <ShieldCheck size={16} /> Operational
        </span>
        <span className="text-xs text-gray-400 font-medium">Multi-Branch Sync</span>
      </div>
    </div>
  );
};
