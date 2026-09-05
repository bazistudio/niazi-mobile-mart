'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useRoles } from '../hooks/useRoles';

const CREATE_NEW_ROLE_VALUE = '__create_new_role__';

interface RoleSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  label?: string;
  placeholder?: string;
}

export const RoleSelect: React.FC<RoleSelectProps> = ({
  value,
  onChange,
  disabled = false,
  error,
  label = 'Role',
  placeholder = 'Select a role',
}) => {
  const { data: roles = [], isLoading } = useRoles();
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === CREATE_NEW_ROLE_VALUE) {
      router.push('/dashboard/shop-admin/settings/roles');
      return;
    }
    onChange(selected);
  };

  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-text-secondary select-none">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={handleChange}
        disabled={disabled || isLoading}
        aria-label={label}
        className={`w-full h-10 px-3 text-sm bg-surface text-text-primary border rounded-md transition-all duration-fast focus:outline-none focus:ring-2 focus:ring-focus-ring disabled:opacity-disabled disabled:cursor-not-allowed ${
          error
            ? 'border-danger focus:border-danger focus:ring-danger/20'
            : 'border-border hover:border-primary/50 focus:border-primary'
        }`}
      >
        <option value="" disabled>
          {isLoading ? 'Loading roles...' : placeholder}
        </option>
        {roles.map((role) => (
          <option key={role._id} value={role._id}>
            {role.name}
          </option>
        ))}
        {roles.length > 0 && (
          <option value="" disabled>──────────────</option>
        )}
        <option value={CREATE_NEW_ROLE_VALUE}>+ Create New Role...</option>
      </select>
      {error && (
        <span className="text-xs font-medium text-danger">{error}</span>
      )}
    </div>
  );
};