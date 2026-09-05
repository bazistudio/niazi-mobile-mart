import React from 'react';
import { HistoryItem } from '../types/history.types';
import { X, Printer, Download } from 'lucide-react';

import { useOrganizationStore } from '@/store/useOrganizationStore';

interface Props {
  item: HistoryItem;
  onClose: () => void;
}

export const InvoicePreviewModal: React.FC<Props> = ({ item, onClose }) => {
  const activeShop = useOrganizationStore(state => state.activeShop);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              Document Preview
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold uppercase">{item.type}</span>
            </h2>
            <p className="text-sm text-gray-500">{item.referenceId}</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <Printer className="w-5 h-5" />
            </button>
            <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <Download className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-gray-700 rounded-lg transition-colors ml-2">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto bg-gray-100 dark:bg-gray-900">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mx-auto max-w-2xl min-h-[500px]">
            <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-700 pb-6 mb-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white uppercase tracking-wider">INVOICE</h1>
                <p className="text-sm text-gray-500 mt-1"># {item.referenceId}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900 dark:text-white">{activeShop?.name || 'TijaratPro Store'}</p>
                <p className="text-sm text-gray-500">{activeShop?.address || 'Main Branch'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Billed To</p>
                <p className="font-bold text-gray-900 dark:text-white">{item.party.name}</p>
                <p className="text-sm text-gray-500 capitalize">{item.party.type || 'Walk-in'}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Date</p>
                <p className="font-medium text-gray-900 dark:text-white">{new Date(item.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-300">Description</th>
                    <th className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-300 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr>
                    <td className="px-4 py-4 text-gray-600 dark:text-gray-400">
                      <div className="font-medium text-gray-900 dark:text-white capitalize">
                        {item.type.replace('_', ' ')}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Ref: {item.referenceId} &bull; Source: {item.source.toUpperCase()}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right font-medium text-gray-900 dark:text-white">Rs {item.amount.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
              <div className="w-64 space-y-3">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Subtotal</span>
                  <span>Rs {item.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Tax (0%)</span>
                  <span>Rs 0.00</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span>Total</span>
                  <span>Rs {item.amount.toLocaleString()}</span>
                </div>
              </div>
            </div>
            
            <div className="mt-12 text-center text-sm text-gray-400 italic">
              System generated document.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
