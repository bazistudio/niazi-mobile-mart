import React, { useEffect, useState } from 'react';
import { RotateCcw, AlertCircle, Calendar, Hash, Truck, DollarSign } from 'lucide-react';
import { returnsApi } from '@/services/returns.api';
import { PurchaseReturn } from '@/lib/tauri/tauriClient';

interface Props {
  purchaseId?: string;
}

export const PurchaseReturnsTable: React.FC<Props> = ({ purchaseId }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);

  useEffect(() => {
    async function loadReturns() {
      try {
        setLoading(true);
        setError(null);
        if (purchaseId) {
          const list = await returnsApi.getPurchaseReturnsByPurchase(purchaseId);
          setReturns(list);
        } else {
          const list = await returnsApi.listPurchaseReturns();
          setReturns(list);
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load purchase returns');
      } finally {
        setLoading(false);
      }
    }
    loadReturns();
  }, [purchaseId]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading purchase returns history...</div>;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-2">
        <AlertCircle className="w-5 h-5" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/40">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-[#2a9d8f]" />
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Purchase Returns History</h3>
        </div>
        <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold px-2.5 py-1 rounded-full">
          {returns.length} Return{returns.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-6 py-3.5">
                <span className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" /> Return #</span>
              </th>
              <th className="px-4 py-3.5">
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Date</span>
              </th>
              <th className="px-4 py-3.5">
                <span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> Supplier</span>
              </th>
              <th className="px-4 py-3.5">Settlement Method</th>
              <th className="px-4 py-3.5 text-center">Status</th>
              <th className="px-4 py-3.5">Reason</th>
              <th className="px-6 py-3.5 text-right">
                <span className="flex items-center justify-end gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Amount</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {returns.map((ret) => (
              <tr key={ret.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <td className="px-6 py-4 font-mono font-bold text-[#2a9d8f]">
                  {ret.return_number}
                </td>
                <td className="px-4 py-4 text-gray-600 dark:text-gray-300 whitespace-nowrap text-xs">
                  {new Date(ret.created_at).toLocaleDateString()}
                  <span className="text-gray-400 block">{new Date(ret.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </td>
                <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">
                  {ret.supplier_name_snapshot || <span className="text-gray-400 italic">Supplier</span>}
                </td>
                <td className="px-4 py-4">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    ret.settlement_method === 'CASH'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                  }`}>
                    {ret.settlement_method.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-semibold">
                    {ret.status}
                  </span>
                </td>
                <td className="px-4 py-4 text-xs text-gray-500 max-w-xs truncate">
                  {ret.reason || <span className="text-gray-400 italic">—</span>}
                </td>
                <td className="px-6 py-4 text-right font-bold text-teal-600 dark:text-teal-400">
                  Rs {ret.total_amount.toLocaleString()}
                </td>
              </tr>
            ))}
            {returns.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No purchase returns found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
