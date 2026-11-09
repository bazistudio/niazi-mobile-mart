'use client';

import React, { useState, useCallback } from 'react';
import { X, ShieldAlert, UserX, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { settingsApi } from '@/features/settings/services/settings.api';
import { customerApi } from '@/services/customer.api';
import type { DBCustomer } from '@/types/db.types';

type Stage = 'authorize' | 'confirm';

interface DeleteCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: DBCustomer | null;
  onSuccess: () => void;
}

export const DeleteCustomerModal: React.FC<DeleteCustomerModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSuccess,
}) => {
  const [stage, setStage] = useState<Stage>('authorize');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const resetState = useCallback(() => {
    setStage('authorize');
    setPassword('');
    setAuthError(null);
    setIsVerifying(false);
    setIsDeactivating(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  // Stage 1 — verify admin password
  const handleVerifyPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError(null);

      if (!password.trim()) {
        setAuthError('Please enter your administrator password.');
        return;
      }

      setIsVerifying(true);
      try {
        await settingsApi.verifyAdminPassword(password.trim());
        // Correct password — advance to final confirmation
        setStage('confirm');
      } catch (err: any) {
        setAuthError(err?.message || 'Incorrect administrator password.');
      } finally {
        setIsVerifying(false);
      }
    },
    [password]
  );

  // Stage 2 — final explicit deactivation
  const handleDeactivate = useCallback(async () => {
    if (!customer) return;

    setIsDeactivating(true);
    try {
      await customerApi.deleteCustomer(customer.id ?? customer._id, password.trim());
      toast.success(
        `Customer "${customer.name}" has been deactivated. Historical records & ledger remain preserved.`
      );
      resetState();
      onSuccess();
      onClose();
    } catch (err: any) {
      const errMsg = err instanceof Error ? err.message : 'Failed to deactivate customer.';
      toast.error(errMsg);
    } finally {
      setIsDeactivating(false);
    }
  }, [customer, password, resetState, onSuccess, onClose]);

  if (!isOpen || !customer) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden transform transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-customer-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl">
              <UserX className="w-5 h-5" />
            </div>
            <div>
              <h3 id="delete-customer-title" className="font-bold text-gray-900 dark:text-white text-base">
                Deactivate Customer
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ADMIN Authorization Gate
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {stage === 'authorize' ? (
            <form onSubmit={handleVerifyPassword} className="space-y-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-200 text-sm">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Security Verification:</span> You are about to deactivate{' '}
                    <span className="font-bold underline">{customer.name}</span>. Please enter your Administrator password to proceed.
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                  Admin Password
                </label>
                <input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your administrator password"
                  disabled={isVerifying}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all outline-none"
                />
                {authError && (
                  <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                    {authError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isVerifying}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifying || !password.trim()}
                  className="px-5 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-sm transition-all"
                >
                  {isVerifying ? 'Verifying...' : 'Authorize Deactivation'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800/40 text-red-900 dark:text-red-200 text-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Final Confirmation:</span> Are you sure you want to deactivate{' '}
                    <span className="font-bold underline">{customer.name}</span>?
                    <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                      • The customer will be deactivated from active POS lists.<br />
                      • All sales history, ledger balances, and audit records will remain permanently intact.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isDeactivating}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeactivate}
                  disabled={isDeactivating}
                  className="px-5 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-sm transition-all"
                >
                  {isDeactivating ? 'Deactivating...' : 'Confirm & Deactivate'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

