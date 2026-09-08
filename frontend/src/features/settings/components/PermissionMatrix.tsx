'use client';

import React, { useMemo } from 'react';
import { useGroupedPermissions } from '../hooks/usePermissions';
import {
  PERMISSIONS,
  PermissionKey,
  PermissionDecision,
  ROLE_PERMISSION_DECISIONS,
  PERMISSION_METADATA,
} from '@/constants/permissions';
import { mapRoleIdToStaffRole } from '../services/settings.api';
import { Shield, Lock, CheckCircle2, UserCheck, XCircle, AlertCircle, Loader2, Circle } from 'lucide-react';

interface PermissionMatrixProps {
  /** Current permission state: { [permissionKey]: boolean } */
  permissions: Record<string, boolean>;
  /** Callback when a permission is toggled (only used in editable mode) */
  onToggle?: (permissionKey: string) => void;
  /** Read-only mode disables all checkboxes */
  readOnly?: boolean;
  /** Optional role ID being viewed or edited (e.g. 'accountant', 'manager', 'cashier') */
  roleId?: string;
}

export const PermissionMatrix: React.FC<PermissionMatrixProps> = ({
  permissions,
  onToggle,
  readOnly = false,
  roleId,
}) => {
  const { grouped, modules, isLoading, error } = useGroupedPermissions();

  const normalizedRole = useMemo(() => {
    if (!roleId) return null;
    return mapRoleIdToStaffRole(roleId);
  }, [roleId]);

  const roleDecisions = useMemo(() => {
    if (!normalizedRole) return null;
    return ROLE_PERMISSION_DECISIONS[normalizedRole] || null;
  }, [normalizedRole]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" aria-hidden="true" />
        <span className="ml-2 text-sm text-text-secondary">Loading canonical permissions...</span>
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
    <div className="space-y-4">
      {/* ─── Security Model Legend ────────────────────────────────────── */}
      <div className="bg-surface-hover/60 border border-border/70 rounded-lg p-3 text-xs">
        <div className="font-semibold text-text-primary mb-2 flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-primary" />
          <span>Four-State Security Model</span>
          {normalizedRole && (
            <span className="ml-auto font-mono text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              Role: {normalizedRole}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-medium">SELECT (Default)</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
            <UserCheck className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-medium">INDIVIDUAL</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-medium">REJECT (Denied)</span>
          </div>
          <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-medium">ADMIN ONLY</span>
          </div>
        </div>
      </div>

      {/* ─── Permission Modules List ──────────────────────────────────── */}
      <div className="space-y-3">
        {modules.map((moduleName) => {
          const perms = grouped[moduleName] || [];
          return (
            <div
              key={moduleName}
              className="rounded-lg border border-border bg-surface overflow-hidden shadow-xs"
            >
              <div className="bg-surface-hover/80 px-4 py-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
                  {moduleName}
                </span>
                <span className="text-[11px] text-text-muted">
                  {perms.length} permission{perms.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="divide-y divide-border/60">
                {perms.map((perm) => {
                  const permKey = perm.key as PermissionKey;
                  const metadata = PERMISSION_METADATA[permKey];
                  const decision: PermissionDecision = roleDecisions
                    ? roleDecisions[permKey] || (perm.adminOnly ? 'ADMIN_ONLY' : 'REJECT')
                    : perm.adminOnly
                    ? 'ADMIN_ONLY'
                    : 'SELECT';

                  // Determine effective state
                  const isIndividual = decision === 'INDIVIDUAL';
                  const isSelect = decision === 'SELECT';
                  const isReject = decision === 'REJECT';
                  const isAdminOnly = decision === 'ADMIN_ONLY';

                  // Explicit grant for individual, always true for SELECT, always false for REJECT and ADMIN_ONLY
                  const isEnabled = isSelect
                    ? true
                    : isIndividual
                    ? !!permissions[permKey]
                    : false;

                  return (
                    <div
                      key={perm.key}
                      className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-surface-hover/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text-primary">
                            {perm.label || metadata?.label || perm.key}
                          </span>
                          <span className="font-mono text-[11px] text-text-muted">
                            {perm.key}
                          </span>
                        </div>
                        {(perm.description || metadata?.description) && (
                          <p className="text-xs text-text-muted mt-0.5 truncate">
                            {perm.description || metadata?.description}
                          </p>
                        )}
                      </div>

                      {/* Decision Badges & Controls */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isAdminOnly && (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                            title="This permission is reserved for organization administrators."
                          >
                            <Lock className="w-3 h-3" />
                            🔒 Admin Only
                          </span>
                        )}

                        {isReject && (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                            title="This permission is permanently denied for this role."
                          >
                            <Lock className="w-3 h-3" />
                            🔒 Denied
                          </span>
                        )}

                        {isSelect && (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            title="Default permission for this role."
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            ✓ Default
                          </span>
                        )}

                        {isIndividual && isEnabled && (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            title="Individually granted permission for this role."
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            ✓ Granted
                          </span>
                        )}

                        {isIndividual && !isEnabled && (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border border-neutral-500/20"
                            title="Discretionary permission not currently granted."
                          >
                            <Circle className="w-3 h-3" />
                            ○ Not Granted
                          </span>
                        )}

                        {/* Interactive Toggle for editable mode */}
                        {!readOnly && onToggle && (
                          <>
                            {isIndividual ? (
                              <button
                                type="button"
                                onClick={() => onToggle(permKey)}
                                title={
                                  isEnabled
                                    ? `Revoke individual grant for ${perm.label || perm.key}`
                                    : `Grant individual permission for ${perm.label || perm.key}`
                                }
                                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                  isEnabled ? 'bg-primary' : 'bg-neutral-300 dark:bg-neutral-700'
                                }`}
                                aria-label={`Toggle ${perm.label}`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                    isEnabled ? 'translate-x-4' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            ) : isSelect ? (
                              <button
                                type="button"
                                disabled={true}
                                title="Default permission for this role. Cannot be revoked through individual role overrides."
                                className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-not-allowed opacity-60 rounded-full border-2 border-transparent bg-primary focus:outline-none"
                                aria-label={`${perm.label} (Default)`}
                              >
                                <span className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 translate-x-4 transition duration-200 ease-in-out" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={true}
                                title={
                                  isAdminOnly
                                    ? 'This permission is reserved for organization administrators.'
                                    : 'This permission is permanently denied for this role.'
                                }
                                className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-not-allowed opacity-30 rounded-full border-2 border-transparent bg-neutral-300 dark:bg-neutral-700 focus:outline-none"
                                aria-label={`${perm.label} (Locked)`}
                              >
                                <span className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 translate-x-0 transition duration-200 ease-in-out" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};