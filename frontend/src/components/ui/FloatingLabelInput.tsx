"use client";

import React, { InputHTMLAttributes } from 'react';

interface FloatingLabelInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  success?: boolean;
}

export const FloatingLabelInput = React.forwardRef<HTMLInputElement, FloatingLabelInputProps>(
  ({ label, error, success, className = '', ...props }, ref) => {
    let borderClass = 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 focus:border-[#006970] focus:ring-[#006970]';
    
    if (error) {
      borderClass = ' hover: focus: focus:ring-red-500';
    } else if (success) {
      borderClass = 'border-green-500 hover:border-green-600 focus:border-green-500 focus:ring-green-500';
    }

    return (
      <div className="relative mb-1 w-full">
        <input
          ref={ref}
          {...props}
          placeholder=" "
          className={`peer block w-full appearance-none rounded-lg border bg-transparent px-4 pb-2 pt-6 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 transition-colors ${borderClass} ${className}`}
        />
        <label
          className={`absolute left-4 top-4 z-10 origin-[0] -translate-y-3 scale-75 transform text-sm text-gray-500 duration-150 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 cursor-text ${
            error ? 'text-red-500 peer-focus:text-red-500' : success ? 'text-green-600 peer-focus:text-green-600' : 'peer-focus:text-[#006970]'
          }`}
        >
          {label}
        </label>
        {error && <p className="mt-1 text-xs text-red-500 px-1">{error}</p>}
      </div>
    );
  }
);

FloatingLabelInput.displayName = 'FloatingLabelInput';
