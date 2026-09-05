'use client';

import React from 'react';

interface SettingsInputProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number' | 'email' | 'password';
  disabled?: boolean;
  suffix?: string;
}

export function SettingsInput({
  label,
  description,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  suffix,
}: SettingsInputProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className={`text-sm font-medium text-[--color-text-primary] ${disabled ? 'opacity-50' : ''}`}>
          {label}
        </p>
        {description && (
          <p className={`text-xs text-[--color-text-muted] mt-0.5 ${disabled ? 'opacity-50' : ''}`}>
            {description}
          </p>
        )}
      </div>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-48 px-3 py-2 text-sm rounded-xl border border-[--color-border] bg-[--color-surface] text-[--color-text-primary] placeholder:text-[--color-text-muted] focus:outline-none focus:ring-2 focus:ring-[--color-focus-ring] focus:border-transparent transition-colors ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          } ${suffix ? 'pr-10' : ''}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[--color-text-muted]">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}