'use client';

import React, { useEffect } from 'react';
import { useSettingsStore } from '../store/settings.store';
import { Shield, Save } from 'lucide-react';

const PERMISSION_KEYS = [
  { key: 'POS_ACCESS', label: 'POS Access' },
  { key: 'VIEW_PRODUCTS', label: 'View Products' },
  { key: 'CREATE_SALE', label: 'Create Sale Invoice' },
  { key: 'VIEW_INVENTORY', label: 'View Inventory' },
  { key: 'VIEW_LEDGER', label: 'View Ledger' },
  { key: 'VIEW_EXPENSES', label: 'View Expenses' },
  { key: 'CREATE_EXPENSE', label: 'Create Expense' },
  { key: 'VIEW_REPORTS', label: 'View Reports' },
  { key: 'MANAGE_USERS', label: 'Manage Users' },
  { key: 'MANAGE_SETTINGS', label: 'Manage Settings' },
  { key: 'DELETE_RECORDS', label: 'Delete Records' }
];

export const RolePermissionMatrix: React.FC = () => {
  const { roleList, fetchRoles, updateRole, isLoading } = useSettingsStore();

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const handleToggle = async (roleId: string, currentPermissions: Record<string, boolean>, permissionKey: string) => {
    const updatedPermissions = {
      ...currentPermissions,
      [permissionKey]: !currentPermissions[permissionKey]
    };
    await updateRole(roleId, updatedPermissions);
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-800 overflow-hidden">
      <div className="p-6 border-b border-neutral-100 dark:border-neutral-800">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-500" />
          Role Permission Matrix
        </h2>
        <p className="text-sm text-neutral-500 mt-1">Configure exactly what each staff role can see and do.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400">
            <tr>
              <th className="px-6 py-4 font-semibold w-1/3">Permission</th>
              {roleList.map(role => (
                <th key={role._id} className="px-6 py-4 font-semibold text-center">{role.role}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {isLoading && roleList.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-neutral-500">Loading...</td></tr>
            ) : PERMISSION_KEYS.map(perm => (
              <tr key={perm.key} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                <td className="px-6 py-4 font-medium text-neutral-900 dark:text-neutral-200">
                  {perm.label}
                  <div className="text-xs text-neutral-400 font-mono mt-0.5">{perm.key}</div>
                </td>
                {roleList.map(role => (
                  <td key={role._id} className="px-6 py-4 text-center">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={role.permissions[perm.key] || false}
                        onChange={() => handleToggle(role._id, role.permissions, perm.key)}
                      />
                      <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-purple-600"></div>
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
