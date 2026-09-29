'use client';

import React, { useState, useCallback } from 'react';
import { X, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { PinInput } from './PinInput';
import { useChangeStaffPin } from '../hooks/useStaff';
import type { StaffUser } from '../types/staff.types';

interface ChangePinModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: StaffUser | null;
}

export const ChangePinModal: React.FC<ChangePinModalProps> = ({
  isOpen,
  onClose,
  staff,
}) => {
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { mutate: changePin, isPending } = useChangeStaffPin();

  const resetState = useCallback(() => {
    setNewPin('');
    setConfirmPin('');
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (newPin.length !== 4) {
        setError('PIN must be exactly 4 digits.');
        return;
      }
      if (!/^\d{4}$/.test(newPin)) {
        setError('PIN must contain only digits.');
        return;
      }
      if (newPin !== confirmPin) {
        setError('PINs do not match.');
        return;
      }

      if (!staff) return;

      changePin(
        { id: staff.id ?? staff._id, pin: newPin },
        {
          onSuccess: () => {
            toast.success('PIN changed successfully.');
            resetState();
            onClose();
          },
          onError: (err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Failed to change PIN.';
            setError(msg);
          },
        }
      );
    },
    [newPin, confirmPin, staff, changePin, resetState, onClose]
  );

  if (!isOpen || !staff) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-text-primary">Change PIN</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isPending}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-text-secondary">
          Setting a new 4-digit PIN for{' '}
          <span className="font-medium text-text-primary">{staff.name}</span>.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <PinInput
            label="New PIN"
            value={newPin}
            onChange={(v) => {
              setNewPin(v);
              setError(null);
            }}
            disabled={isPending}
          />

          <PinInput
            label="Confirm PIN"
            value={confirmPin}
            onChange={(v) => {
              setConfirmPin(v);
              setError(null);
            }}
            disabled={isPending}
            error={error ?? undefined}
          />

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="flex-1 py-2 px-4 rounded-lg border border-border text-text-secondary hover:bg-surface-hover transition-colors text-sm font-medium disabled:opacity-disabled"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || newPin.length !== 4 || confirmPin.length !== 4}
              className="flex-1 py-2 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-disabled"
            >
              {isPending ? 'Saving…' : 'Change PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
