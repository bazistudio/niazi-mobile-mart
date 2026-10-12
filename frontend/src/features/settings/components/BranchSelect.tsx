'use client';

import React, { useEffect, useState } from 'react';
import { tauriClient, isTauriEnvironment } from '@/lib/tauri/tauriClient';
import { shopApi } from '@/services/shop.api';

interface BranchOption {
  id: string;
  name: string;
  code?: string;
}

interface BranchSelectProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  error?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

export const BranchSelect: React.FC<BranchSelectProps> = ({
  value,
  onChange,
  disabled = false,
  error,
  label = 'Branch',
  placeholder = 'Select a branch',
  required = false,
}) => {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadBranches() {
      setIsLoading(true);
      try {
        let list = await tauriClient.branchList().catch(() => []);
        if (!list || list.length === 0) {
          const res = await shopApi.getAllShops().catch(() => ({ success: false, data: [] }));
          if (res.success && res.data && res.data.length > 0) {
            list = res.data.map((s) => ({
              id: s._id,
              organization_id: '00000000-0000-0000-0000-000000000001',
              name: s.name,
              code: s.name.substring(0, 4).toUpperCase(),
              is_active: s.status === 'active' || s.status === 'ACTIVE',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }));
          }
        }
        if (!cancelled && list && list.length > 0) {
          // Blocker 3: Exclude inactive branches from new user assignments
          const selectableBranches = list.filter((b: any) => {
            // If an existing user already belongs to this branch, preserve it so it remains visible
            if (value && b.id === value) return true;
            // Otherwise exclude branches whose is_active is explicitly false or numeric 0
            return b.is_active !== false && b.is_active !== 0;
          });

          setBranches(
            selectableBranches.map((b: any) => ({
              id: b.id,
              name: b.name + (b.is_active === false || b.is_active === 0 ? ' (Inactive)' : ''),
              code: b.code,
            }))
          );
        }
      } catch (err) {
        console.warn('[BranchSelect] Failed to load branches:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadBranches();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    onChange(selected === '' ? undefined : selected);
  };

  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-text-secondary select-none">
          {label}
          {!required && (
            <span className="ml-1 text-text-muted font-normal">(optional)</span>
          )}
        </label>
      )}
      <select
        value={value ?? ''}
        onChange={handleChange}
        disabled={disabled || isLoading}
        aria-label={label}
        className={`w-full h-10 px-3 text-sm bg-surface text-text-primary border rounded-md transition-all duration-fast focus:outline-none focus:ring-2 focus:ring-focus-ring disabled:opacity-disabled disabled:cursor-not-allowed ${
          error
            ? 'border-danger focus:border-danger focus:ring-danger/20'
            : 'border-border hover:border-primary/50 focus:border-primary'
        }`}
      >
        {!required && (
          <option value="">
            {isLoading ? 'Loading branches...' : placeholder}
          </option>
        )}
        {required && (
          <option value="" disabled>
            {isLoading ? 'Loading branches...' : placeholder}
          </option>
        )}
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
            {branch.code ? ` (${branch.code})` : ''}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-xs font-medium text-danger">{error}</span>
      )}
    </div>
  );
};
