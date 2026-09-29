'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StaffUser } from '../types/staff.types';
import { useUpdateStaffStatus, useChangeStaffRole } from '../hooks/useStaff';
import { UserFormDrawer } from './UserFormDrawer';
import { ChangePinModal } from './ChangePinModal';
import { DeleteUserModal } from './DeleteUserModal';
import {
  Users,
  Plus,
  Edit3,
  MoreHorizontal,
  Loader2,
  KeyRound,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface UserListProps {
  staff: StaffUser[];
  isLoading: boolean;
}

export const UserList: React.FC<UserListProps> = ({ staff, isLoading }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [changePinStaff, setChangePinStaff] = useState<StaffUser | null>(null);
  const [deleteTargetStaff, setDeleteTargetStaff] = useState<StaffUser | null>(null);

  const updateStatus = useUpdateStaffStatus();
  const changeRole = useChangeStaffRole();

  const handleCreate = () => {
    setEditingStaff(null);
    setIsDrawerOpen(true);
  };

  const handleEdit = (user: StaffUser) => {
    setEditingStaff(user);
    setIsDrawerOpen(true);
    setOpenActionsId(null);
  };

  const handleStatusToggle = async (user: StaffUser) => {
    const isSuspended = user.status === 'suspended';
    const newStatus = isSuspended ? 'active' : 'suspended';
    try {
      await updateStatus.mutateAsync({ id: user.id ?? user._id, status: newStatus });
      toast.success(
        isSuspended ? `${user.name} has been unsuspended.` : `${user.name} has been suspended.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      toast.error(msg);
    }
    setOpenActionsId(null);
  };

  const handleOpenChangePin = (user: StaffUser) => {
    setOpenActionsId(null);
    setChangePinStaff(user);
  };

  const handleOpenDeleteUser = (user: StaffUser) => {
    setOpenActionsId(null);
    setDeleteTargetStaff(user);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'success' as const;
      case 'suspended': return 'warning' as const;
      default: return 'neutral' as const;
    }
  };

  const getPinBadgeVariant = (hasPin: boolean) => {
    return hasPin ? 'success' as const : 'neutral' as const;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-text-secondary">Loading users...</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Users</h3>
          <p className="text-sm text-text-muted">
            {staff.length} user{staff.length !== 1 ? 's' : ''} in the system
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={handleCreate}
        >
          Add User
        </Button>
      </div>

      {staff.length === 0 ? (
        <Card variant="flat" padding="lg">
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-text-muted mx-auto mb-3" />
            <p className="text-sm font-medium text-text-secondary">No users found</p>
            <p className="text-xs text-text-muted mt-1">
              Add your first user to get started.
            </p>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={handleCreate}
              className="mt-4"
            >
              Add User
            </Button>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-hover border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Branch
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  PIN
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {staff.map((user) => (
                <tr key={user._id} className="hover:bg-surface-hover/50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-medium text-text-primary">{user.name}</div>
                    <div className="text-xs text-text-muted">{user.username}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-text-primary">{user.phone || '—'}</div>
                    <div className="text-xs text-text-muted">{user.email || ''}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge variant="info" size="sm" dot>
                      {user.roleName || 'Unknown'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {user.branchId ? (
                      <span className="text-sm text-text-primary">
                        {user.branchName || user.branchId}
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted italic">Main Branch</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    <Badge variant={getPinBadgeVariant(user.hasPin)} size="sm">
                      {user.hasPin ? 'Set' : 'Not Set'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    <Badge variant={getStatusBadgeVariant(user.status)} size="sm" dot>
                      {user.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right relative">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        icon={<Edit3 className="w-4 h-4" />}
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${user.name}`}
                        onClick={() => handleEdit(user)}
                      />
                      <div className="relative">
                        <IconButton
                          icon={<MoreHorizontal className="w-4 h-4" />}
                          variant="ghost"
                          size="sm"
                          aria-label="More actions"
                          onClick={() =>
                            setOpenActionsId(openActionsId === user._id ? null : user._id)
                          }
                        />
                        {openActionsId === user._id && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setOpenActionsId(null)}
                            />
                            <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-surface rounded-lg shadow-dropdown border border-border p-1">
                              {/* Suspend / Unsuspend */}
                              <button
                                type="button"
                                onClick={() => handleStatusToggle(user)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-hover rounded-md transition-colors"
                              >
                                {user.status === 'active' ? (
                                  <>
                                    <ToggleRight className="w-4 h-4 text-warning" />
                                    Suspend User
                                  </>
                                ) : (
                                  <>
                                    <ToggleLeft className="w-4 h-4 text-success" />
                                    Unsuspend User
                                  </>
                                )}
                              </button>

                              {/* Change PIN */}
                              <button
                                type="button"
                                onClick={() => handleOpenChangePin(user)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-hover rounded-md transition-colors"
                              >
                                <KeyRound className="w-4 h-4" />
                                Change PIN
                              </button>

                              <div className="my-1 border-t border-border" />

                              {/* Delete User */}
                              <button
                                type="button"
                                onClick={() => handleOpenDeleteUser(user)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10 rounded-md transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete User
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserFormDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        editingStaff={editingStaff}
      />

      <ChangePinModal
        isOpen={changePinStaff !== null}
        onClose={() => setChangePinStaff(null)}
        staff={changePinStaff}
      />

      <DeleteUserModal
        isOpen={deleteTargetStaff !== null}
        onClose={() => setDeleteTargetStaff(null)}
        staff={deleteTargetStaff}
      />
    </>
  );
};
