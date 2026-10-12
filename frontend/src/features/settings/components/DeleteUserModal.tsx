'use client';

import React, { useState, useCallback } from 'react';
import { X, ShieldAlert, UserX } from 'lucide-react';
import toast from 'react-hot-toast';
import { settingsApi } from '../services/settings.api';
import { useDeleteStaff } from '../hooks/useStaff';
import type { StaffUser } from '../types/staff.types';

type Stage = 'authorize' | 'confirm';

interface DeleteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: StaffUser | null;
}

export const DeleteUserModal: React.FC<DeleteUserModalProps> = ({
  isOpen,
  onClose,
  staff,
}) => {
  const [stage, setStage] = useState<Stage>('authorize');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const { mutate: deleteStaff, isPending: isDeactivating } = useDeleteStaff();

  const resetState = useCallback(() => {
    setStage('authorize');
    setPassword('');
    setAuthError(null);
    setIsVerifying(false);
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
        await settingsApi.verifyAdminPassword(password);
        // Correct password — advance to final confirmation. Do NOT deactivate yet.
        setStage('confirm');
      } catch {
        setAuthError('Incorrect administrator password.');
      } finally {
        setIsVerifying(false);
      }
    },
    [password]
  );

  // Stage 2 — final explicit deactivation
  const handleDeactivate = useCallback(() => {
    if (!staff) return;

    deleteStaff(staff.id ?? staff._id, {
      onSuccess: () => {
        toast.success(
          `${staff.name}'s account has been deactivated. Historical records are preserved.`
        );
        resetState();
        onClose();
      },
      onError: (err: unknown) => {
        const errMsg =
          err instanceof Error ? err.message : 'Failed to deactivate account.';
        // Handle already-deactivated (409) gracefully — not a fatal error
        if (
          errMsg.toLowerCase().includes('already deactivated') ||
          errMsg.toLowerCase().includes('already inactive')
        ) {
          toast(`${staff.name}'s account is already inactive.`, { icon: 'ℹ️' });
          resetState();
          onClose();
        } else {
          toast.error(errMsg);
        }
      },
    });
  }, [staff, deleteStaff, resetState, onClose]);

  if (!isOpen || !staff) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-warning" />
            <h2 className="text-lg font-semibold text-text-primary">
              {stage === 'authorize' ? 'Authorization Required' : 'Deactivate Account'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isVerifying || isDeactivating}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stage 1 — Admin password */}
        {stage === 'authorize' && (
          <form onSubmit={handleVerifyPassword} className="flex flex-col gap-4">
            <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-sm text-warning-dark">
              Deactivating{' '}
              <span className="font-semibold">{staff.name}</span>'s account requires
              administrator password verification.
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="admin-password"
                className="text-sm font-medium text-text-secondary select-none"
              >
                Administrator Password
              </label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setAuthError(null);
                }}
                disabled={isVerifying}
                placeholder="Enter your password"
                className={`w-full px-3 py-2 rounded-lg border bg-surface text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-focus-ring transition-all ${
                  authError
                    ? 'border-danger ring-1 ring-danger/20'
                    : 'border-border focus:border-primary'
                } disabled:opacity-disabled`}
              />
              {authError && (
                <span className="text-xs font-medium text-danger">{authError}</span>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                disabled={isVerifying}
                className="flex-1 py-2 px-4 rounded-lg border border-border text-text-secondary hover:bg-surface-hover transition-colors text-sm font-medium disabled:opacity-disabled"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isVerifying || !password.trim()}
                className="flex-1 py-2 px-4 rounded-lg bg-warning text-white text-sm font-medium hover:bg-warning/90 transition-colors disabled:opacity-disabled"
              >
                {isVerifying ? 'Verifying…' : 'Verify Password'}
              </button>
            </div>
          </form>
        )}

        {/* Stage 2 — Final confirmation */}
        {stage === 'confirm' && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-sm text-warning-dark">
              <p className="font-semibold mb-1">Deactivate this account?</p>
              <p>
                <span className="font-semibold">{staff.name}</span> will lose access to
                the system. All historical business records — sales, invoices, stock
                movements — will remain attributed to their account.
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                disabled={isDeactivating}
                className="flex-1 py-2 px-4 rounded-lg border border-border text-text-secondary hover:bg-surface-hover transition-colors text-sm font-medium disabled:opacity-disabled"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={isDeactivating}
                className="flex-1 py-2 px-4 rounded-lg bg-warning text-white text-sm font-medium hover:bg-warning/90 transition-colors disabled:opacity-disabled flex items-center justify-center gap-1.5"
              >
                {isDeactivating ? (
                  'Deactivating…'
                ) : (
                  <>
                    <UserX className="w-4 h-4" />
                    Deactivate Account
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
