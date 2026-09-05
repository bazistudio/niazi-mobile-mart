'use client';

import React from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SettingsSelectProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
}

export function SettingsSelect({
  label,
  description,
  value,
  onChange,
  options,
  disabled = false,
}: SettingsSelectProps) {
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
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-48 px-3 py-2 text-sm rounded-xl border border-[--color-border] bg-[--color-surface] text-[--color-text-primary] focus:outline-none focus:ring-2 focus:ring-[--color-focus-ring] focus:border-transparent transition-colors ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}