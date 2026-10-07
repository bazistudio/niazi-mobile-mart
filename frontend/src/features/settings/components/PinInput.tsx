'use client';

import React, { useRef, useCallback, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  error?: string;
  label?: string;
  /** Show an eye icon button to toggle digit visibility */
  showToggle?: boolean;
}

export const PinInput: React.FC<PinInputProps> = ({
  value,
  onChange,
  length = 4,
  disabled = false,
  error,
  label,
  showToggle = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, '').slice(0, length);
      onChange(raw);
    },
    [onChange, length]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
      if (pasted) {
        onChange(pasted);
      }
    },
    [onChange, length]
  );

  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="w-full flex flex-col gap-1.5">
      {(label || showToggle) && (
        <div className="flex items-center justify-between">
          {label && (
            <label className="text-sm font-medium text-text-secondary select-none">
              {label}
            </label>
          )}
          {showToggle && (
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              disabled={disabled}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors disabled:opacity-50"
              aria-label={visible ? 'Hide PIN digits' : 'Show PIN digits'}
            >
              {visible ? (
                <><EyeOff className="w-3.5 h-3.5" /><span>Hide</span></>
              ) : (
                <><Eye className="w-3.5 h-3.5" /><span>Show</span></>
              )}
            </button>
          )}
        </div>
      )}
      <div
        role="group"
        aria-label={label || 'PIN input'}
        className="relative"
      >
        {/* Hidden native input for mobile keyboard */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          maxLength={length}
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          disabled={disabled}
          aria-label={label || 'Enter PIN'}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        {/* Visual PIN display */}
        <div
          onClick={handleContainerClick}
          className={`flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg border bg-surface transition-all duration-fast cursor-text ${
            error
              ? 'border-danger ring-1 ring-danger/20'
              : 'border-border hover:border-primary/50 focus-within:border-primary focus-within:ring-2 focus-within:ring-focus-ring'
          } ${disabled ? 'opacity-disabled cursor-not-allowed' : ''}`}
        >
          {Array.from({ length }).map((_, index) => (
            <span
              key={index}
              className={`w-10 h-12 flex items-center justify-center rounded-md border text-lg font-bold transition-all duration-fast ${
                value[index]
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-surface-hover border-border text-text-muted'
              }`}
              aria-hidden="true"
            >
              {value[index] ? (visible ? value[index] : '•') : '_'}
            </span>
          ))}
        </div>
      </div>
      {error && (
        <span className="text-xs font-medium text-danger">{error}</span>
      )}
    </div>
  );
};