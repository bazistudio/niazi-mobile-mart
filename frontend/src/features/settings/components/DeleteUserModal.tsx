'use client';

import React, { useState, useCallback } from 'react';
import { X, ShieldAlert, UserX, Hash } from 'lucide-react';
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
  const [credTab, setCredTab] = useState<'password' | 'pin'>('password');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const { mutate: deleteStaff, isPending: isDeactivating } = useDeleteStaff();

  const resetState = useCallback(() => {
    setStage('authorize');
    setCredTab('password');
    setPassword('');
    setPin('');
    setAuthError(null);
    setIsVerifying(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  // Stage 1 — verify admin credential (password or PIN)
  const handleVerifyPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError(null);

      if (credTab === 'pin') {
        if (!pin.trim() || !/^\d{4}$/.test(pin.trim())) {
          setAuthError('Please enter your 4-digit administrator PIN.');
          return;
        }
      } else {
        if (!password.trim()) {
          setAuthError('Please enter your administrator password.');
          return;
        }
      }

      setIsVerifying(true);
      try {
        await settingsApi.verifyAdminCredential(
          credTab === 'pin' ? { admin_pin: pin.trim() } : { admin_password: password.trim() }
        );
        // Credential verified — advance to final confirmation. Do NOT deactivate yet.
        setStage('confirm');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('LOCKED_OUT') || msg.includes('locked')) {
          setAuthError('Too many failed attempts. PIN entry locked for 5 minutes.');
        } else if (msg.includes('NO_PIN_CONFIGURED')) {
          setAuthError('No PIN is configured on this admin account. Use password instead.');
        } else {
          setAuthError(credTab === 'pin' ? 'Incorrect administrator PIN.' : 'Incorrect administrator password.');
        }
      } finally {
        setIsVerifying(false);
      }
    },
    [credTab, password, pin]
  );

  // Stage 2 — final explicit deactivation
  const handleDeactivate = useCallback(() => {
    if (!staff) return;

    const credential = credTab === 'pin'
      ? { admin_pin: pin.trim() }
      : { admin_password: password.trim() };

    deleteStaff({ id: staff.id ?? staff._id, credential }, {
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
  }, [staff, credTab, password, pin, deleteStaff, resetState, onClose]);

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
              administrator credential verification.
            </div>

            {/* Credential tab switcher */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => { setCredTab('password'); setAuthError(null); }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${ credTab === 'password' ? 'bg-warning text-white' : 'bg-surface text-text-muted hover:text-text-primary' }`}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => { setCredTab('pin'); setAuthError(null); }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 ${ credTab === 'pin' ? 'bg-warning text-white' : 'bg-surface text-text-muted hover:text-text-primary' }`}
              >
                <Hash className="w-3.5 h-3.5" /> PIN
              </button>
            </div>

            {credTab === 'password' ? (
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
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="admin-pin"
                  className="text-sm font-medium text-text-secondary select-none"
                >
                  Administrator PIN (4 digits)
                </label>
                <input
                  id="admin-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                    setAuthError(null);
                  }}
                  disabled={isVerifying}
                  placeholder="••••"
                  className={`w-full px-3 py-2 rounded-lg border bg-surface text-text-primary text-sm text-center tracking-[0.5em] placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-focus-ring transition-all ${
                    authError
                      ? 'border-danger ring-1 ring-danger/20'
                      : 'border-border focus:border-primary'
                  } disabled:opacity-disabled`}
                />
              </div>
            )}
            {authError && (
              <span className="text-xs font-medium text-danger">{authError}</span>
            )}

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
                disabled={isVerifying || (credTab === 'password' ? !password.trim() : pin.length !== 4)}
                className="flex-1 py-2 px-4 rounded-lg bg-warning text-white text-sm font-medium hover:bg-warning/90 transition-colors disabled:opacity-disabled"
              >
                {isVerifying ? 'Verifying…' : (credTab === 'pin' ? 'Verify PIN' : 'Verify Password')}
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
