import React from 'react';
import { DashboardData } from '@/features/organization/types/dashboard.types';
import { ArrowDownToLine, ArrowUpFromLine, DollarSign } from 'lucide-react';

export const ReceivablesCard = ({ amount }: { amount: number }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6 border border-gray-100 flex flex-col justify-between">
      <div>
        <div className="flex items-center mb-6">
          <div className="p-2 bg-blue-50 rounded-lg mr-3">
            <ArrowDownToLine className="text-blue-600" size={24} />
          </div>
          <h3 className="text-lg font-semibold text-gray-800">Customer Receivables</h3>
        </div>

        <div className="flex items-center text-gray-900 font-bold text-2xl">
          <span className="text-blue-600 mr-2 text-lg">PKR</span>
          <span>{amount.toLocaleString()}</span>
        </div>
      </div>
      
      <div className="pt-4 mt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 flex items-center">
          <DollarSign size={14} className="mr-1" />
          Global Organization Balance
        </p>
      </div>
    </div>
  );
};

export const PayablesCard = ({ amount }: { amount: number }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6 border border-gray-100 flex flex-col justify-between">
      <div>
        <div className="flex items-center mb-6">
          <div className="p-2 bg-rose-50 rounded-lg mr-3">
            <ArrowUpFromLine className="text-rose-600" size={24} />
          </div>
          <h3 className="text-lg font-semibold text-gray-800">Supplier Payables</h3>
        </div>

        <div className="flex items-center text-gray-900 font-bold text-2xl">
          <span className="text-rose-600 mr-2 text-lg">PKR</span>
          <span>{amount.toLocaleString()}</span>
        </div>
      </div>
      
      <div className="pt-4 mt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 flex items-center">
          <DollarSign size={14} className="mr-1" />
          Global Organization Balance
        </p>
      </div>
    </div>
  );
};
