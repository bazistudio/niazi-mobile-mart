/**
 * SetOpeningBalanceModal
 *
 * Allows an organization administrator to post the single opening-balance
 * ledger entry for a customer who has no prior ledger activity.
 *
 * Permissions:
 *   - Visible / accessible only when `user?.role === 'ADMIN'` (org-admin).
 *   - Backend enforces the same guard; the UI gate is an additional defence-
 *     in-depth layer, not the primary control.
 *
 * Accounting effects (mirroring backend ledger conventions):
 *   - direction = 'debit'  → customer owes shop  (debit entry = amount, credit = 0)
 *   - direction = 'credit' → shop owes customer  (credit entry = amount, debit = 0)
 *   - Zero amounts are rejected — a zero balance requires no ledger entry.
 *
 * On success:
 *   - Invalidates customer and ledger React-Query caches.
 *   - Calls `onSuccess` so the parent can refresh the profile.
 *   - Does NOT add an optimistic balance entry; waits for server confirmation.
 */

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { X, Scale } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ledgerApi, OpeningBalanceDirection } from '@/services/ledger.api';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { invalidateQueries } from '@/lib/react-query/invalidate';

interface SetOpeningBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  /** Called after the server confirms success so the parent can re-fetch. */
  onSuccess?: () => void;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function isDateInFuture(value: string): boolean {
  // Compare date strings directly (YYYY-MM-DD) to avoid timezone edge cases.
  const today = new Date().toISOString().slice(0, 10);
  return value > today;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const SetOpeningBalanceModal: React.FC<SetOpeningBalanceModalProps> = ({
  isOpen,
  onClose,
  customerId,
  customerName,
  onSuccess,
}) => {
  // ── Form state ────────────────────────────────────────────────────────────
  const [amountStr, setAmountStr]     = useState('');
  const [direction, setDirection]     = useState<OpeningBalanceDirection>('debit');
  const [balanceAsOf, setBalanceAsOf] = useState('');
  const [notes, setNotes]             = useState('');
  const [reference, setReference]     = useState('');

  // ── Auth + query client ───────────────────────────────────────────────────
  const queryClient = useQueryClient();
  const { user }    = useAuthStore();

  // ── Mutation ──────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () =>
      ledgerApi.setCustomerOpeningBalance(customerId, {
        amount:           Math.round(Number(amountStr)),
        direction,
        balance_as_of:    balanceAsOf.trim(),
        notes:            notes.trim(),
        reference_number: reference.trim() || null,
      }),
    onSuccess: () => {
      invalidateQueries.customers(queryClient, user);
      invalidateQueries.ledger(queryClient, user, 'CUSTOMER', customerId);
      toast.success('Opening balance posted successfully');
      handleClose();
      if (onSuccess) onSuccess();
    },
    onError: (err: any) => {
      const status  = err?.response?.status;
      const message = err?.response?.data?.message ?? err?.message ?? 'Unexpected error';

      if (status === 409) {
        toast.error(`Conflict: ${message}`);
      } else if (status === 403) {
        toast.error('Permission denied: only organization administrators may post opening balances');
      } else if (status === 404) {
        toast.error(`Customer not found: ${message}`);
      } else {
        toast.error(`Failed to post opening balance: ${message}`);
      }
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const resetForm = () => {
    setAmountStr('');
    setDirection('debit');
    setBalanceAsOf('');
    setNotes('');
    setReference('');
    mutation.reset();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // ── Client-side validation ────────────────────────────────────────────────

  const amountNum = Number(amountStr);
  const amountError = (() => {
    if (amountStr === '') return null;
    if (isNaN(amountNum) || amountNum <= 0)     return 'Amount must be a positive number';
    if (!Number.isInteger(amountNum))            return 'Amount must be a whole number (no decimals)';
    if (amountNum > 999_999_999)                 return 'Amount is too large';
    return null;
  })();

  const dateError = (() => {
    if (balanceAsOf === '') return null;
    if (!isValidIsoDate(balanceAsOf)) return 'Date must be in YYYY-MM-DD format';
    if (isDateInFuture(balanceAsOf))  return 'Cut-off date may not be in the future';
    return null;
  })();

  const canSubmit =
    !mutation.isPending &&
    amountStr !== '' &&
    amountError === null &&
    balanceAsOf !== '' &&
    dateError === null &&
    notes.trim().length > 0;

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate();
  };

  if (!isOpen) return null;

  // ── Accounting effect summary displayed in the form ───────────────────────
  const effectLabel =
    direction === 'debit'
      ? `Customer owes the shop ── debit Rs ${amountNum > 0 ? amountNum.toLocaleString() : '0'}`
      : `Shop owes the customer ── credit Rs ${amountNum > 0 ? amountNum.toLocaleString() : '0'}`;

  const isSaving = mutation.isPending;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-[#006970] dark:text-[#00B4BB]" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Set Opening Balance
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="p-6 space-y-5">

            {/* Customer name */}
            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Customer</p>
              <p className="font-semibold text-gray-900 dark:text-white">{customerName}</p>
            </div>

            {/* Direction */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Direction
              </label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'debit',  label: 'Customer owes shop',  sub: '(receivable)' },
                  { value: 'credit', label: 'Shop owes customer',  sub: '(advance / credit)' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDirection(opt.value)}
                    className={`flex flex-col items-start p-3 rounded-xl border text-sm transition-all ${
                      direction === opt.value
                        ? 'border-[#006970] bg-[#006970]/5 text-[#006970] dark:border-[#00B4BB] dark:bg-[#00B4BB]/10 dark:text-[#00B4BB]'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">Rs</span>
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  className={`block w-full pl-9 pr-3 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006970] focus:border-transparent text-lg font-semibold transition-colors ${
                    amountError
                      ? 'border-red-400 dark:border-red-500'
                      : 'border-gray-300 dark:border-gray-700'
                  }`}
                  placeholder="0"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  autoFocus
                />
              </div>
              {amountError && (
                <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">{amountError}</p>
              )}
            </div>

            {/* Balance as of */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Balance as of (cut-off date) <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className={`block w-full px-3 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970] focus:border-transparent transition-colors ${
                  dateError
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-700'
                }`}
                value={balanceAsOf}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setBalanceAsOf(e.target.value)}
              />
              {dateError && (
                <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">{dateError}</p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notes <span className="text-red-500">*</span>
              </label>
              <textarea
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006970] focus:border-transparent resize-none transition-colors text-sm"
                placeholder="e.g. Opening balance migrated from old POS — verified by owner on 2024-01-01"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              {notes.trim().length === 0 && notes !== '' && (
                <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">Notes are required</p>
              )}
            </div>

            {/* Reference number (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Legacy Reference <span className="text-xs text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006970] focus:border-transparent transition-colors text-sm"
                placeholder="Old POS customer code or reference number"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>

            {/* Accounting effect summary */}
            {amountNum > 0 && !amountError && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
                <p className="font-semibold mb-0.5">Accounting effect</p>
                <p>{effectLabel}</p>
              </div>
            )}

          </div>

          {/* ── Footer ──────────────────────────────────────────────────────── */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-6 py-2 text-sm font-medium text-white bg-[#006970] hover:bg-[#00585e] rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving ? 'Posting…' : 'Post Opening Balance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
