import React, { useState, useMemo } from 'react';
import { useCashStore } from '../store/cash.store';
import { X, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const CashSessionCloseModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { currentSession, summary, closeSession, isActionLoading } = useCashStore();
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes] = useState('');

  const expectedCash = summary?.expected_closing_cash ?? 0;

  const actualNum = parseFloat(actualCash);
  const variance = useMemo(() => {
    if (isNaN(actualNum)) return null;
    return actualNum - expectedCash;
  }, [actualNum, expectedCash]);

  if (!isOpen || !currentSession) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(actualNum) || actualNum < 0) {
      return;
    }

    await closeSession({
      session_id: currentSession.id,
      actual_closing_cash: actualNum,
      notes: notes.trim() ? notes.trim() : null,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-neutral-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
              Close Cash Session & Reconcile
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Expected vs Actual Breakdown */}
          <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">
                Authoritative Expected Cash:
              </span>
              <span className="font-bold text-neutral-900 dark:text-white tabular-nums">
                PKR {expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="border-t border-neutral-200 dark:border-neutral-700 pt-2 flex justify-between items-center text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Physical Actual Count:</span>
              <span className="font-bold text-neutral-900 dark:text-white tabular-nums">
                {isNaN(actualNum)
                  ? '—'
                  : `PKR ${actualNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              </span>
            </div>

            {variance !== null && (
              <div
                className={`p-3 rounded-lg border text-sm flex items-center justify-between font-bold ${
                  variance === 0
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                    : variance > 0
                    ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800'
                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {variance !== 0 && <AlertTriangle className="w-4 h-4" />}
                  {variance === 0
                    ? 'Drawer Perfectly Balanced'
                    : variance > 0
                    ? 'Cash Surplus (+)'
                    : 'Cash Shortage (-)'}
                </span>
                <span className="tabular-nums">
                  {variance > 0 ? '+' : ''}
                  PKR {variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Physical Cash Count (PKR) *
            </label>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={actualCash}
              onChange={(e) => setActualCash(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800 text-lg font-black text-neutral-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none"
              placeholder="Enter physically counted cash"
              autoFocus
            />
            <p className="text-xs text-neutral-400 mt-1">
              Physically count all cash in drawer and enter the total.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Closing Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800 text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none text-neutral-900 dark:text-white"
              rows={2}
              placeholder="e.g. Variance explained by drawer discrepancy / bank deposit notes"
            />
          </div>

          <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isActionLoading || isNaN(actualNum) || actualNum < 0}
              className="px-5 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {isActionLoading ? 'Closing...' : 'Confirm & Close Day'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
