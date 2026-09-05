import React, { useState } from 'react';
import { AlertTriangle, X, Check, ArrowRight } from 'lucide-react';
import { DBCustomer } from '@/types/db.types';
import { customerApi } from '@/services/customer.api';
import toast from 'react-hot-toast';

interface CreditLimitWarningModalProps {
  customer: DBCustomer;
  projectedBalance: number;
  onProceed: () => void;
  onCancel: () => void;
  onLimitUpdated: (updatedCustomer: DBCustomer) => void;
}

export const CreditLimitWarningModal: React.FC<CreditLimitWarningModalProps> = ({
  customer,
  projectedBalance,
  onProceed,
  onCancel,
  onLimitUpdated
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [newLimit, setNewLimit] = useState<string>(customer.creditLimit.toString());
  const [showUpdateField, setShowUpdateField] = useState(false);

  const handleUpdateLimit = async () => {
    const limitValue = parseFloat(newLimit);
    if (isNaN(limitValue) || limitValue < 0) {
      toast.error('Please enter a valid credit limit');
      return;
    }

    try {
      setIsUpdating(true);
      const res = await customerApi.updateCustomer(customer._id || customer.id, { creditLimit: limitValue });
      if (res.success) {
        toast.success(`Credit limit updated to Rs ${limitValue.toLocaleString()}`);
        onLimitUpdated({ ...customer, creditLimit: limitValue });
        setShowUpdateField(false);
      } else {
        toast.error(res.message || 'Failed to update credit limit');
      }
    } catch (error) {
      toast.error('An error occurred while updating credit limit');
    } finally {
      setIsUpdating(false);
    }
  };

  const isStillOverLimit = projectedBalance > customer.creditLimit;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-neutral-900/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-red-200 dark:border-red-900/50 flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/50">
          <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-full text-red-600 dark:text-red-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-red-700 dark:text-red-400">Credit Limit Exceeded</h2>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <p className="text-gray-700 dark:text-gray-300">
            This transaction exceeds the allowed credit limit for <span className="font-bold">{customer.name}</span>.
          </p>
          
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 dark:text-gray-400 font-medium">Current Limit</span>
              <span className="font-bold text-gray-900 dark:text-white">Rs {customer.creditLimit.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 dark:text-gray-400 font-medium">Projected Balance</span>
              <span className="font-black text-red-600 dark:text-red-400">Rs {projectedBalance.toLocaleString()}</span>
            </div>
          </div>

          <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/30 rounded-lg p-3 text-sm text-orange-800 dark:text-orange-300">
            <strong>Suggestion:</strong> Ask an administrator to increase the customer's credit limit before proceeding.
          </div>

          {/* Limit Adjustment Section */}
          {!showUpdateField ? (
            <button 
              onClick={() => setShowUpdateField(true)}
              className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              Adjust limit instantly <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-2 mt-4 animate-in slide-in-from-top-2">
              <input
                type="number"
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
                placeholder="New Limit"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleUpdateLimit}
                disabled={isUpdating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-colors flex items-center gap-2"
              >
                {isUpdating ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-neutral-950/50 border-t border-gray-100 dark:border-gray-800">
          <button 
            onClick={onCancel}
            className="px-5 py-2.5 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
          {!isStillOverLimit && (
            <button 
              onClick={onProceed}
              className="px-5 py-2.5 font-bold rounded-lg transition-colors text-sm shadow-sm flex items-center gap-2 bg-green-600 text-white hover:bg-green-700"
            >
              <Check className="w-4 h-4" /> Proceed Safely
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
