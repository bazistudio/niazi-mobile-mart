'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Shield,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  User,
  Building2,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StaffUser } from '../types/staff.types';
import { settingsApi } from '../services/settings.api';
import { useUpdateUserPermissions } from '../hooks/useStaff';
import {
  PERMISSIONS,
  PERMISSION_METADATA,
  ROLE_PERMISSION_DECISIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PermissionDecision,
} from '@/constants/permissions';
import { mapRoleIdToStaffRole } from '../services/settings.api';

interface UserPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: StaffUser | null;
}

interface GroupedPermissionItem {
  key: string;
  label: string;
  description: string;
  module: string;
  decision?: PermissionDecision;
}

export const UserPermissionsModal: React.FC<UserPermissionsModalProps> = ({
  isOpen,
  onClose,
  staff,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active user access profile state
  const [allowedActions, setAllowedActions] = useState<string[]>([]);
  const [allowedPages, setAllowedPages] = useState<string[]>([]);

  // Original state tracking for unsaved changes detection
  const [originalActions, setOriginalActions] = useState<string[]>([]);
  const [originalPages, setOriginalPages] = useState<string[]>([]);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);

  const updatePermissionsMutation = useUpdateUserPermissions();

  const userId = staff?.id || staff?._id || '';
  const staffRole = useMemo(() => {
    return mapRoleIdToStaffRole(staff?.roleId || '');
  }, [staff?.roleId]);

  const roleDecisions = useMemo(() => {
    return ROLE_PERMISSION_DECISIONS[staffRole] || {};
  }, [staffRole]);

  const roleDefaultPerms = useMemo(() => {
    return DEFAULT_ROLE_PERMISSIONS[staffRole] || [];
  }, [staffRole]);

  // Group canonical permissions by module
  const groupedPermissions = useMemo(() => {
    const groups: Record<string, GroupedPermissionItem[]> = {};

    for (const [key, meta] of Object.entries(PERMISSION_METADATA)) {
      const moduleName = meta.module || 'General';
      if (!groups[moduleName]) {
        groups[moduleName] = [];
      }
      groups[moduleName].push({
        key: meta.key,
        label: meta.label,
        description: meta.description,
        module: moduleName,
        decision: roleDecisions[key as keyof typeof roleDecisions],
      });
    }

    return groups;
  }, [roleDecisions]);

  // Load user access profile when modal opens
  useEffect(() => {
    if (!isOpen || !userId) {
      setLoadError(null);
      setSaveSuccess(false);
      setErrorMessage(null);
      setShowUnsavedWarning(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);
    setSaveSuccess(false);
    setErrorMessage(null);
    setShowUnsavedWarning(false);

    settingsApi
      .getUserPermissions(userId)
      .then((data) => {
        if (!isMounted) return;
        const profile = data.access_profile || {};
        const actions = Array.isArray(profile.allowed_actions)
          ? [...profile.allowed_actions]
          : [];
        const pages = Array.isArray(profile.allowed_pages)
          ? [...profile.allowed_pages]
          : [];

        setAllowedActions(actions);
        setAllowedPages(pages);
        setOriginalActions(actions);
        setOriginalPages(pages);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        const msg = err?.message || 'Failed to load user permissions from server';
        setLoadError(msg);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, userId]);

  // Check if there are unsaved edits
  const hasUnsavedChanges = useMemo(() => {
    if (allowedActions.length !== originalActions.length) return true;
    const actionsSet = new Set(originalActions);
    for (const a of allowedActions) {
      if (!actionsSet.has(a)) return true;
    }
    return false;
  }, [allowedActions, originalActions]);

  const handleSafeClose = useCallback(() => {
    if (hasUnsavedChanges && !showUnsavedWarning) {
      setShowUnsavedWarning(true);
      return;
    }
    setShowUnsavedWarning(false);
    onClose();
  }, [hasUnsavedChanges, showUnsavedWarning, onClose]);

  const handleToggleAction = useCallback((permKey: string) => {
    setAllowedActions((prev) => {
      if (prev.includes(permKey)) {
        return prev.filter((k) => k !== permKey);
      } else {
        return [...prev, permKey];
      }
    });
    setSaveSuccess(false);
    setErrorMessage(null);
  }, []);

  const handleSave = async () => {
    if (!userId) return;
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      // Derive relevant allowed_pages from allowed_actions modules
      const derivedPagesSet = new Set<string>(allowedPages);
      for (const act of allowedActions) {
        if (act.includes(':')) {
          const prefix = act.split(':')[0];
          derivedPagesSet.add(prefix);
        } else if (act.includes('.')) {
          const prefix = act.split('.')[0];
          derivedPagesSet.add(prefix);
        }
      }

      const payload = {
        allowed_pages: Array.from(derivedPagesSet),
        allowed_actions: allowedActions,
      };

      await updatePermissionsMutation.mutateAsync({
        userId,
        permissions: payload,
      });

      setOriginalActions([...allowedActions]);
      setOriginalPages(payload.allowed_pages);
      setSaveSuccess(true);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          'Failed to update permissions. Ensure you have administrative authority.'
      );
    }
  };

  if (!isOpen || !staff) {
    return null;
  }

  const isSaving = updatePermissionsMutation.isPending;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-permissions-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none animate-in fade-in duration-150"
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-surface border border-border shadow-modal overflow-hidden">
        {/* Modal Header with User Identity */}
        <div className="p-5 sm:p-6 border-b border-border bg-surface-hover/30 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="h-11 w-11 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="user-permissions-title"
                className="text-base sm:text-lg font-bold text-text-primary truncate"
              >
                Manage Permissions: {staff.name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-text-muted">
                <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-background/80 px-2 py-0.5 rounded border border-border">
                  <User className="h-3 w-3" />
                  @{staff.username || 'user'}
                </span>
                <Badge variant="info" size="sm">
                  {staff.roleName || staffRole}
                </Badge>
                {staff.branchName && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-text-secondary">
                    <Building2 className="h-3 w-3" />
                    {staff.branchName}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSafeClose}
            className="text-text-muted hover:text-text-primary p-1.5 rounded-lg hover:bg-surface transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Unsaved Changes Confirmation Warning Banner */}
        {showUnsavedWarning && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-3 flex items-center justify-between gap-3 text-xs text-amber-600 dark:text-amber-400">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>You have unsaved permission changes. Close without saving?</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="font-bold underline hover:opacity-80 cursor-pointer"
              >
                Discard & Close
              </button>
              <button
                type="button"
                onClick={() => setShowUnsavedWarning(false)}
                className="px-2 py-0.5 rounded bg-surface border border-border text-text-primary font-medium cursor-pointer"
              >
                Keep Editing
              </button>
            </div>
          </div>
        )}

        {/* Modal Body / Permission Matrix */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-muted">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs">Loading authoritative user profile...</p>
            </div>
          ) : loadError ? (
            <div className="rounded-xl bg-danger/10 border border-danger/20 p-4 text-center">
              <p className="text-sm font-semibold text-danger">Failed to load permissions</p>
              <p className="text-xs text-danger/80 mt-1">{loadError}</p>
            </div>
          ) : (
            <>
              {/* Feedback Alerts */}
              {errorMessage && (
                <div className="rounded-xl bg-danger/10 border border-danger/20 p-3 text-xs text-danger flex items-center gap-2 animate-in fade-in">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {saveSuccess && (
                <div className="rounded-xl bg-success/10 border border-success/20 p-3 text-xs text-success flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span>User permissions updated successfully!</span>
                </div>
              )}

              {/* Grouped Permissions by Module */}
              <div className="space-y-5">
                {Object.entries(groupedPermissions).map(([moduleName, items]) => (
                  <div
                    key={moduleName}
                    className="rounded-xl border border-border bg-surface-hover/20 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                        {moduleName}
                      </h3>
                      <span className="text-[11px] text-text-muted">
                        {items.filter((i) => allowedActions.includes(i.key)).length} granted
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {items.map((item) => {
                        const isGranted = allowedActions.includes(item.key);
                        const isRoleDefault = roleDefaultPerms.includes(item.key);
                        const isPolicySelect = item.decision === 'SELECT';
                        const isPolicyReject = item.decision === 'REJECT';
                        const isPolicyAdminOnly = item.decision === 'ADMIN_ONLY';

                        return (
                          <div
                            key={item.key}
                            onClick={() => {
                              if (isSaving) return;
                              handleToggleAction(item.key);
                            }}
                            className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer ${
                              isGranted
                                ? 'bg-primary/5 border-primary/30 text-text-primary'
                                : 'bg-surface border-border text-text-secondary hover:bg-surface-hover'
                            } ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isGranted}
                              onChange={() => {}} // Controlled via parent div onClick
                              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-semibold leading-tight text-text-primary">
                                  {item.label}
                                </span>
                                {isPolicySelect && (
                                  <span className="text-[9px] px-1 py-0.2 bg-blue-500/10 text-blue-600 rounded">
                                    Role Default
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-text-muted mt-0.5 leading-normal">
                                {item.description}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-border bg-surface-hover/20 flex items-center justify-between gap-3">
          <div className="text-[11px] text-text-muted">
            {allowedActions.length} total granted actions
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isSaving}
              onClick={handleSafeClose}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isSaving || isLoading || !hasUnsavedChanges}
              onClick={handleSave}
              leftIcon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            >
              {isSaving ? 'Saving...' : 'Save Permissions'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

