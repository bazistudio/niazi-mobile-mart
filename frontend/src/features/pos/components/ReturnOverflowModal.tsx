import React from 'react';
import { usePosStore } from '../store/usePosStore';
import { HandCoins, PiggyBank, AlertTriangle, Wallet } from 'lucide-react';

export const ReturnOverflowModal = () => {
  const returnOverflowState = usePosStore(state => state.returnOverflowState);

  if (!returnOverflowState || !returnOverflowState.isOpen) {
    return null;
  }

  const { currentBalance, refundAmount, overflowAmount, shopCashBalance, onKeepCredit, onRefundCash, onCancel } = returnOverflowState;
  const isCashInsufficient = shopCashBalance < overflowAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white flex flex-col items-center">
          <div className="bg-white/20 p-3 rounded-full mb-3">
            <HandCoins className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold">Invoice Return Overflow</h2>
          <p className="text-blue-100 text-sm mt-1 text-center">
            Return amount exceeds customer's debt.
          </p>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 space-y-4">
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-2 border border-gray-100 dark:border-gray-800">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Customer Debt:</span>
              <span className="font-semibold text-gray-900 dark:text-white">Rs {currentBalance}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Return Amount:</span>
              <span className="font-semibold text-red-600 dark:text-red-400">Rs {refundAmount}</span>
            </div>
            <div className="h-px bg-gray-200 dark:bg-gray-700 my-2" />
            <div className="flex justify-between font-bold text-lg">
              <span className="text-gray-900 dark:text-white">Excess Credit:</span>
              <span className="text-green-600 dark:text-green-400">Rs {overflowAmount}</span>
            </div>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
            How would you like to handle the extra Rs {overflowAmount}?
          </p>

          <div className="space-y-3">
            <button
              onClick={onKeepCredit}
              className="w-full flex items-center p-3 rounded-xl border-2  dark:/30 hover: bg-blue-50/50 dark:bg-blue-900/10 transition-all text-left group"
            >
              <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg mr-3 group-hover:scale-110 transition-transform">
                <PiggyBank className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-blue-900 dark:text-blue-100">Keep As Customer Credit</div>
                <div className="text-xs text-blue-600/70 dark:text-blue-400/70">Shop owes customer Rs {overflowAmount}</div>
              </div>
            </button>

            <button
              onClick={onRefundCash}
              disabled={isCashInsufficient}
              className={`w-full flex items-center p-3 rounded-xl border-2 transition-all text-left group ${
                isCashInsufficient 
                  ? ' dark:/30 /30 dark:/10 opacity-70 cursor-not-allowed'
                  : 'border-green-100 dark:border-green-900/30 hover:border-green-500 bg-green-50/50 dark:bg-green-900/10'
              }`}
            >
              <div className={`p-2 rounded-lg mr-3 transition-transform ${
                isCashInsufficient ? ' dark:/50' : 'bg-green-100 dark:bg-green-900/50 group-hover:scale-110'
              }`}>
                <Wallet className={`w-5 h-5 ${isCashInsufficient ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
              </div>
              <div className="flex-1">
                <div className={`font-semibold ${isCashInsufficient ? 'text-red-900 dark:text-red-100' : 'text-green-900 dark:text-green-100'}`}>
                  Refund Rs {overflowAmount} Cash
                </div>
                {isCashInsufficient ? (
                  <div className="text-xs text-red-600 flex items-center mt-0.5">
                    <AlertTriangle className="w-3 h-3 mr-1 inline" />
                    Insufficient Cash (Available: Rs {shopCashBalance})
                  </div>
                ) : (
                  <div className="text-xs text-green-600/70 dark:text-green-400/70">Pay out cash directly from drawer</div>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={onCancel}
            className="w-full py-2.5 rounded-lg text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel Return
          </button>
        </div>

      </div>
    </div>
  );
};
