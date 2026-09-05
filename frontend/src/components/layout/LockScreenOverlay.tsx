'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Delete, LogOut, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { useTerminalStore } from '@/store/useTerminalStore';

/**
 * Extract 1-2 letter uppercase initials from display name
 */
function getInitials(name?: string | null): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const LockScreenOverlay: React.FC = () => {
  const isTerminalLocked = useTerminalStore((s) => s.isTerminalLocked);
  const unlockTerminal = useTerminalStore((s) => s.unlockTerminal);

  const user = useAuthStore((s) => s.user);
  const logoutAsync = useAuthStore((s) => s.logoutAsync);

  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const displayName = (user as any)?.name || (user as any)?.username || 'Active Cashier';
  const role = user?.role || 'SHOP_ADMIN';
  const initials = getInitials(displayName);

  // Clear pin and errors on lock/unlock transition
  useEffect(() => {
    if (isTerminalLocked) {
      setPin('');
      setError(null);
      setIsShaking(false);
    }
  }, [isTerminalLocked]);

  const handleVerifyPin = useCallback(
    (pinToVerify: string) => {
      // Step 1: Follow Phase 0.5 contract fast PIN check
      // If user object has a cached PIN, verify against it.
      // Otherwise verify against standard terminal fallback PINs ('1234' or '0000' or 4-digit entry)
      const userPin = (user as any)?.pin;

      let isValid = false;
      if (userPin) {
        isValid = pinToVerify === String(userPin);
      } else {
        // Fallback: Default terminal unlock passcode or any non-empty 4-digit code if unset
        isValid = pinToVerify === '1234' || pinToVerify === '0000' || pinToVerify.length === 4;
      }

      if (isValid) {
        setError(null);
        setPin('');
        unlockTerminal();
      } else {
        setError('Incorrect PIN. Please try again.');
        setIsShaking(true);
        setPin('');
        setTimeout(() => setIsShaking(false), 500);
      }
    },
    [user, unlockTerminal]
  );

  const handleDigitPress = useCallback(
    (digit: string) => {
      if (pin.length >= 4) return;
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(null);

      if (nextPin.length === 4) {
        // Auto-verify on 4th digit
        setTimeout(() => handleVerifyPin(nextPin), 80);
      }
    },
    [pin, handleVerifyPin]
  );

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  }, []);

  const handleClear = useCallback(() => {
    setPin('');
    setError(null);
  }, []);

  // Handle physical keyboard input while terminal is locked
  useEffect(() => {
    if (!isTerminalLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcut interference while terminal is locked
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigitPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape' || e.key === 'Delete') {
        e.preventDefault();
        handleClear();
      } else if (e.key === 'Enter' && pin.length === 4) {
        e.preventDefault();
        handleVerifyPin(pin);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTerminalLocked, pin, handleDigitPress, handleBackspace, handleClear, handleVerifyPin]);

  if (!isTerminalLocked) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="terminal-locked-title"
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-background/95 backdrop-blur-lg p-4 select-none animate-in fade-in duration-200"
    >
      <div
        className={`w-full max-w-sm rounded-2xl bg-surface border border-border p-6 sm:p-8 shadow-modal text-center transition-transform ${
          isShaking ? 'animate-bounce' : ''
        }`}
      >
        {/* Terminal Lock Icon & Branding */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 shadow-sm">
          <Lock className="h-7 w-7" aria-hidden="true" />
        </div>

        <h2 id="terminal-locked-title" className="text-lg sm:text-xl font-bold text-text-primary tracking-tight">
          Terminal Locked
        </h2>
        <p className="text-xs sm:text-sm text-text-muted mt-0.5">
          Enter 4-digit PIN to resume session
        </p>

        {/* Active Cashier Card */}
        <div className="mt-4 mb-5 flex items-center justify-center gap-3 rounded-xl bg-surface-hover/60 border border-border/70 p-2.5 px-4">
          <div className="h-9 w-9 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shadow-sm flex-shrink-0">
            {initials}
          </div>
          <div className="text-left min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-semibold text-text-primary truncate">
              {displayName}
            </p>
            <span className="inline-block text-[11px] font-medium text-text-secondary bg-background/70 px-1.5 py-0.2 rounded border border-border/50">
              {role.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* PIN Dot Indicators */}
        <div className="flex justify-center items-center gap-3.5 mb-5" aria-label="PIN Entry Progress">
          {[0, 1, 2, 3].map((index) => {
            const isFilled = index < pin.length;
            return (
              <div
                key={index}
                className={`h-4 w-4 rounded-full transition-all duration-fast ${
                  isFilled
                    ? 'bg-primary scale-110 shadow-sm'
                    : 'border-2 border-border bg-surface-hover'
                }`}
              />
            );
          })}
        </div>

        {/* Error Feedback */}
        {error && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-danger font-medium mb-4 animate-in fade-in">
            <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mb-5 max-w-[280px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigitPress(digit)}
              className="h-12 sm:h-13 rounded-xl border border-border bg-surface hover:bg-surface-hover active:bg-primary/10 active:border-primary text-base sm:text-lg font-bold text-text-primary shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              {digit}
            </button>
          ))}

          {/* Clear Button */}
          <button
            type="button"
            onClick={handleClear}
            className="h-12 sm:h-13 rounded-xl border border-border bg-surface hover:bg-surface-hover active:bg-surface text-xs font-semibold text-text-secondary shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Clear
          </button>

          {/* 0 Button */}
          <button
            type="button"
            onClick={() => handleDigitPress('0')}
            className="h-12 sm:h-13 rounded-xl border border-border bg-surface hover:bg-surface-hover active:bg-primary/10 active:border-primary text-base sm:text-lg font-bold text-text-primary shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            0
          </button>

          {/* Backspace Button */}
          <button
            type="button"
            onClick={handleBackspace}
            aria-label="Backspace"
            className="h-12 sm:h-13 rounded-xl border border-border bg-surface hover:bg-surface-hover active:bg-surface flex items-center justify-center text-text-secondary shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Delete className="h-5 w-5" />
          </button>
        </div>

        {/* Footer Actions: Switch Cashier / Sign Out */}
        <div className="pt-2 border-t border-border flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            disabled={isSigningOut}
            onClick={async () => {
              if (isSigningOut) return;
              setIsSigningOut(true);
              unlockTerminal();
              await logoutAsync();
            }}
            className="inline-flex items-center gap-1.5 text-text-secondary hover:text-danger p-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-disabled"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Switch Cashier / Sign Out</span>
          </button>

          <span className="text-[11px] text-text-muted">
            TijaratPro POS
          </span>
        </div>
      </div>
    </div>
  );
};

export default LockScreenOverlay;
