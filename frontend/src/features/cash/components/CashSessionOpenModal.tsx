import React, { useState } from 'react';
import { useCashStore } from '../store/cash.store';
import { X, Unlock } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const CashSessionOpenModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { openSession, isActionLoading } = useCashStore();
  const [openingCash, setOpeningCash] = useState('0');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(openingCash);
    if (isNaN(amount) || amount < 0) {
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    await openSession({
      opening_cash: amount,
      business_date: todayStr,
      notes: notes.trim() ? notes.trim() : null,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-neutral-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Unlock className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
              Open Daily Cash Session
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
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Opening Cash Amount (PKR) *
            </label>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800 text-base font-bold text-neutral-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="0.00"
            />
            <p className="text-xs text-neutral-400 mt-1">
              Physical cash counted in the drawer at the start of business.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Notes / Remarks (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none text-neutral-900 dark:text-white"
              rows={3}
              placeholder="e.g. Morning float verified by cashier"
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
              disabled={isActionLoading}
              className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {isActionLoading ? 'Opening...' : 'Confirm & Open Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
