import React, { useEffect, useState } from 'react';
import { X, AlertCircle, RotateCcw, Check, ShoppingBag, Banknote, CreditCard } from 'lucide-react';
import { returnsApi } from '@/services/returns.api';
import { PurchaseReturnableInfoDto, CreatePurchaseReturnLineDto } from '@/lib/tauri/tauriClient';

interface Props {
  purchaseId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const PurchaseReturnModal: React.FC<Props> = ({ purchaseId, onClose, onSuccess }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<PurchaseReturnableInfoDto | null>(null);

  // Return line selections: purchase_line_id -> quantity
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [settlementMethod, setSettlementMethod] = useState<'CASH' | 'SUPPLIER_CREDIT'>('SUPPLIER_CREDIT');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    async function loadReturnable() {
      try {
        setLoading(true);
        setError(null);
        const res = await returnsApi.getPurchaseReturnableInfo(purchaseId);
        setInfo(res);

        // Initialize zero return quantities
        const initQty: Record<string, number> = {};
        for (const line of res.lines) {
          initQty[line.purchase_line_id] = 0;
        }
        setQuantities(initQty);
      } catch (err: any) {
        setError(err?.message || 'Failed to load purchase return details');
      } finally {
        setLoading(false);
      }
    }
    loadReturnable();
  }, [purchaseId]);

  const handleQtyChange = (lineId: string, maxQty: number, value: string) => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0) {
      setQuantities((prev) => ({ ...prev, [lineId]: 0 }));
      return;
    }
    const clamped = Math.min(parsed, maxQty);
    setQuantities((prev) => ({ ...prev, [lineId]: clamped }));
  };

  // Calculate total return valuation using immutable historical purchase unit cost
  const totalReturnAmount = (info?.lines || []).reduce((acc, line) => {
    const qty = quantities[line.purchase_line_id] || 0;
    return acc + qty * line.original_unit_cost;
  }, 0);

  const selectedLinesCount = Object.values(quantities).filter((q) => q > 0).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedLinesCount === 0) {
      setError('Please specify at least 1 product to return.');
      return;
    }

    const lines: CreatePurchaseReturnLineDto[] = Object.entries(quantities)
      .filter(([_, q]) => q > 0)
      .map(([purchase_line_id, quantity]) => ({
        purchase_line_id,
        quantity,
      }));

    try {
      setSubmitting(true);
      setError(null);
      await returnsApi.createPurchaseReturn({
        purchase_id: purchaseId,
        lines,
        settlement_method: settlementMethod,
        reason: reason.trim() ? reason.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to process purchase return');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] border border-gray-100 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#2a9d8f]/10 text-[#2a9d8f] rounded-xl">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                Purchase Return
                {info && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                    {info.purchase_number}
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-500">
                Return purchased inventory back to supplier and reduce payable or receive cash.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="py-12 text-center text-gray-500">Loading purchase details...</div>
          ) : error && !info ? (
            <div className="p-4 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-xl flex items-center gap-3 border border-red-200 dark:border-red-900">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          ) : info ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-xl flex items-center gap-2 text-sm border border-red-200 dark:border-red-900">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Supplier Snapshot */}
              <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex justify-between items-center text-sm">
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-medium">Supplier</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {info.supplier_name || 'Generic / Unknown Supplier'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-400 block uppercase font-medium">Original Purchase</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{info.purchase_number}</span>
                </div>
              </div>

              {/* Returnable Items Table */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-gray-500" />
                  Select Products to Return
                </h3>
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-3">Product / SKU</th>
                        <th className="px-3 py-3 text-center">Purchased</th>
                        <th className="px-3 py-3 text-center">Physical Stock</th>
                        <th className="px-3 py-3 text-center">Returnable</th>
                        <th className="px-3 py-3 text-right">Unit Cost</th>
                        <th className="px-4 py-3 text-right w-28">Return Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {info.lines.map((l) => {
                        // Returnable cannot exceed remaining purchase quantity OR currently available on-hand stock
                        const maxAllowed = Math.min(l.returnable_quantity, l.current_available_stock);
                        const currentQty = quantities[l.purchase_line_id] || 0;
                        const isExhausted = maxAllowed <= 0;

                        return (
                          <tr
                            key={l.purchase_line_id}
                            className={isExhausted ? 'bg-gray-50/50 dark:bg-gray-900/30 opacity-60' : 'hover:bg-gray-50/70 dark:hover:bg-gray-700/30'}
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900 dark:text-white">{l.product_name}</div>
                              <div className="text-xs text-gray-500">SKU: {l.sku}</div>
                            </td>
                            <td className="px-3 py-3 text-center font-medium">{l.original_quantity}</td>
                            <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">
                              {l.current_available_stock}
                            </td>
                            <td className="px-3 py-3 text-center font-bold text-[#2a9d8f]">
                              {maxAllowed}
                            </td>
                            <td className="px-3 py-3 text-right">Rs {l.original_unit_cost.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                              {isExhausted ? (
                                <span className="text-xs text-gray-400 italic">
                                  {l.current_available_stock <= 0 ? 'No Stock' : 'Fully Returned'}
                                </span>
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  max={maxAllowed}
                                  value={currentQty === 0 ? '' : currentQty}
                                  placeholder="0"
                                  onChange={(e) => handleQtyChange(l.purchase_line_id, maxAllowed, e.target.value)}
                                  className="w-20 px-2.5 py-1 text-right font-bold text-gray-900 dark:text-white bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#006970] focus:border-transparent outline-none"
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Settlement Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 uppercase">
                    Settlement Method
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSettlementMethod('SUPPLIER_CREDIT')}
                      className={`py-2 px-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                        settlementMethod === 'SUPPLIER_CREDIT'
                          ? 'border-[#006970] bg-[#006970]/10 text-[#006970] font-bold shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      Supplier Credit
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettlementMethod('CASH')}
                      className={`py-2 px-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                        settlementMethod === 'CASH'
                          ? 'border-[#006970] bg-[#006970]/10 text-[#006970] font-bold shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <Banknote className="w-4 h-4" />
                      Cash Refund
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 uppercase">
                    Return Reason
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Defective batch, supplier recall"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-[#006970] outline-none"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 uppercase">
                  Additional Notes (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional internal remarks..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-[#006970] outline-none"
                />
              </div>

              {/* Total Calculation Card */}
              <div className="p-4 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <div>
                  <span className="text-xs text-gray-500 uppercase font-semibold">Total Purchase Cost Valuation</span>
                  <div className="text-xs text-gray-400">
                    {selectedLinesCount} line item{selectedLinesCount !== 1 ? 's' : ''} selected
                  </div>
                </div>
                <div className="text-2xl font-black text-[#2a9d8f]">
                  Rs {totalReturnAmount.toLocaleString()}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || selectedLinesCount === 0 || totalReturnAmount <= 0}
                  className="px-6 py-2.5 bg-[#2a9d8f] hover:bg-[#238276] text-white text-sm font-bold rounded-xl shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all cursor-pointer"
                >
                  {submitting ? (
                    'Processing Return...'
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Confirm Return (Rs {totalReturnAmount.toLocaleString()})
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
};
