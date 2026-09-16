"use client";

import React, { InputHTMLAttributes } from 'react';

interface FloatingLabelInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  success?: boolean;
}

export const FloatingLabelInput = React.forwardRef<HTMLInputElement, FloatingLabelInputProps>(
  ({ label, error, success, className = '', ...props }, ref) => {
    let borderClass = 'border-border hover:border-divider focus:border-primary focus:ring-focus-ring';
    
    if (error) {
      borderClass = 'border-danger hover:border-danger focus:border-danger focus:ring-danger/20';
    } else if (success) {
      borderClass = 'border-success hover:border-success focus:border-success focus:ring-success/20';
    }

    return (
      <div className="relative mb-1 w-full">
        <input
          ref={ref}
          {...props}
          placeholder=" "
          className={`peer block w-full appearance-none rounded-lg border bg-surface px-4 pb-2 pt-6 text-sm text-text-primary focus:outline-none focus:ring-1 transition-colors ${borderClass} ${className}`}
        />
        <label
          className={`absolute left-4 top-4 z-10 origin-[0] -translate-y-3 scale-75 transform text-sm text-text-muted duration-150 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 cursor-text ${
            error ? 'text-danger peer-focus:text-danger' : success ? 'text-success peer-focus:text-success' : 'peer-focus:text-primary'
          }`}
        >
          {label}
        </label>
        {error && <p className="mt-1 text-xs text-danger px-1">{error}</p>}
      </div>
    );
  }
);

FloatingLabelInput.displayName = 'FloatingLabelInput';
