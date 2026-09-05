'use client';

import React, { useMemo, useCallback } from 'react';
import { useGroupedPermissions } from '../hooks/usePermissions';
import { Shield, Loader2 } from 'lucide-react';

const ACTION_COLUMNS = ['view', 'create', 'update', 'delete', 'export', 'approve'] as const;

export type ActionColumn = (typeof ACTION_COLUMNS)[number];

interface PermissionMatrixProps {
  /** Current permission state: { [permissionKey]: boolean } */
  permissions: Record<string, boolean>;
  /** Callback when a permission is toggled (only used in editable mode) */
  onToggle?: (permissionKey: string) => void;
  /** Read-only mode disables all checkboxes */
  readOnly?: boolean;
  /** Whether to show the action column header row */
  showActions?: boolean;
}

const ACTION_LABELS: Record<ActionColumn, string> = {
  view: 'View',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  export: 'Export',
  approve: 'Approve',
};

export const PermissionMatrix: React.FC<PermissionMatrixProps> = ({
  permissions,
  onToggle,
  readOnly = false,
  showActions = true,
}) => {
  const { grouped, modules, isLoading, error } = useGroupedPermissions();

  // Build a map of module -> action -> permission keys
  const moduleActionMap = useMemo(() => {
    const map: Record<string, Record<string, string[]>> = {};
    for (const [module, perms] of Object.entries(grouped)) {
      map[module] = {};
      for (const perm of perms) {
        if (!map[module][perm.action]) {
          map[module][perm.action] = [];
        }
        map[module][perm.action].push(perm.key);
      }
    }
    return map;
  }, [grouped]);

  // Check if all permissions for a module+action are enabled
  const isActionEnabled = useCallback(
    (module: string, action: string): boolean | 'mixed' => {
      const keys = moduleActionMap[module]?.[action];
      if (!keys || keys.length === 0) return false;
      const enabled = keys.filter((k) => permissions[k]);
      if (enabled.length === 0) return false;
      if (enabled.length === keys.length) return true;
      return 'mixed';
    },
    [moduleActionMap, permissions]
  );

  // Check if all permissions in a module are enabled
  const isModuleAllEnabled = useCallback(
    (module: string): boolean | 'mixed' => {
      const actions = moduleActionMap[module];
      if (!actions) return false;
      const allKeys = Object.values(actions).flat();
      if (allKeys.length === 0) return false;
      const enabled = allKeys.filter((k) => permissions[k]);
      if (enabled.length === 0) return false;
      if (enabled.length === allKeys.length) return true;
      return 'mixed';
    },
    [moduleActionMap, permissions]
  );

  // Toggle all permissions in a module for a specific action
  const handleActionToggle = useCallback(
    (module: string, action: string) => {
      if (readOnly || !onToggle) return;
      const keys = moduleActionMap[module]?.[action];
      if (!keys) return;
      const currentState = isActionEnabled(module, action);
      // If all are enabled, disable all; otherwise enable all
      const newState = currentState !== true;
      for (const key of keys) {
        if (permissions[key] !== newState) {
          onToggle(key);
        }
      }
    },
    [moduleActionMap, isActionEnabled, permissions, onToggle, readOnly]
  );

  // Toggle all permissions in a module
  const handleModuleToggle = useCallback(
    (module: string) => {
      if (readOnly || !onToggle) return;
      const actions = moduleActionMap[module];
      if (!actions) return;
      const currentState = isModuleAllEnabled(module);
      const newState = currentState !== true;
      for (const keys of Object.values(actions)) {
        for (const key of keys) {
          if (permissions[key] !== newState) {
            onToggle(key);
          }
        }
      }
    },
    [moduleActionMap, isModuleAllEnabled, permissions, onToggle, readOnly]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" aria-hidden="true" />
        <span className="ml-2 text-sm text-text-secondary">Loading permissions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger/10 border border-danger/20 rounded-lg p-4 text-center">
        <p className="text-sm text-danger font-medium">Failed to load permissions</p>
        <p className="text-xs text-danger/70 mt-1">{error.message}</p>
      </div>
    );
  }

  if (modules.length === 0) {
    return (
      <div className="bg-surface-hover border border-border rounded-lg p-6 text-center">
        <Shield className="w-8 h-8 text-text-muted mx-auto mb-2" />
        <p className="text-sm font-medium text-text-secondary">No permissions configured</p>
        <p className="text-xs text-text-muted mt-1">Permissions will appear here once configured.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" role="grid" aria-label="Permission matrix">
        <thead>
          <tr className="bg-surface-hover border-b border-border">
            <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider w-48">
              Module
            </th>
            {showActions &&
              ACTION_COLUMNS.map((action) => (
                <th
                  key={action}
                  className="px-3 py-3 text-center text-xs font-semibold text-text-secondary uppercase tracking-wider"
                >
                  {ACTION_LABELS[action]}
                </th>
              ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {modules.map((module) => {
            const moduleState = isModuleAllEnabled(module);
            return (
              <tr key={module} className="hover:bg-surface-hover/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {!readOnly && onToggle && (
                      <button
                        type="button"
                        onClick={() => handleModuleToggle(module)}
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          moduleState === true
                            ? 'bg-primary border-primary text-white'
                            : moduleState === 'mixed'
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'border-border hover:border-primary/50'
                        }`}
                        aria-label={`Toggle all ${module} permissions`}
                        title={`Toggle all ${module} permissions`}
                      >
                        {moduleState === true && (
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {moduleState === 'mixed' && (
                          <span className="w-2 h-0.5 bg-current rounded-full" />
                        )}
                      </button>
                    )}
                    <span className="font-medium text-text-primary">{module}</span>
                  </div>
                </td>
                {showActions &&
                  ACTION_COLUMNS.map((action) => {
                    const actionState = isActionEnabled(module, action);
                    const keys = moduleActionMap[module]?.[action];
                    if (!keys || keys.length === 0) {
                      return (
                        <td key={action} className="px-3 py-3 text-center text-text-muted">
                          <span className="text-xs">—</span>
                        </td>
                      );
                    }
                    return (
                      <td key={action} className="px-3 py-3 text-center">
                        {readOnly ? (
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
                              actionState
                                ? 'bg-success/10 text-success'
                                : 'bg-surface-hover text-text-muted'
                            }`}
                            aria-label={actionState ? `${ACTION_LABELS[action]} enabled` : `${ACTION_LABELS[action]} disabled`}
                          >
                            {actionState ? (
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            )}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleActionToggle(module, action)}
                            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors mx-auto ${
                              actionState === true
                                ? 'bg-primary border-primary text-white'
                                : actionState === 'mixed'
                                ? 'bg-primary/20 border-primary text-primary'
                                : 'border-border hover:border-primary/50'
                            }`}
                            aria-label={`${ACTION_LABELS[action]} ${module}`}
                            title={`${ACTION_LABELS[action]} ${module}`}
                          >
                            {actionState === true && (
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            {actionState === 'mixed' && (
                              <span className="w-2 h-0.5 bg-current rounded-full" />
                            )}
                          </button>
                        )}
                      </td>
                    );
                  })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};