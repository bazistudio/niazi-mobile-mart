'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SlideOverDrawer } from '@/components/ui/SlideOverDrawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionMatrix } from './PermissionMatrix';
import { Role, CreateRoleDto, UpdateRoleDto } from '../types/role.types';
import { useCreateRole, useUpdateRole } from '../hooks/useRoles';
import toast from 'react-hot-toast';

interface RoleFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  editingRole?: Role | null;
}

export const RoleFormDrawer: React.FC<RoleFormDrawerProps> = ({
  isOpen,
  onClose,
  editingRole,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [nameError, setNameError] = useState('');

  const createRole = useCreateRole();
  const updateRole = useUpdateRole();

  const isEditing = !!editingRole;
  const isPending = createRole.isPending || updateRole.isPending;

  useEffect(() => {
    if (isOpen) {
      if (editingRole) {
        setName(editingRole.name);
        setDescription(editingRole.description || '');
        setPermissions(editingRole.permissions || {});
      } else {
        setName('');
        setDescription('');
        setPermissions({});
      }
      setNameError('');
    }
  }, [isOpen, editingRole]);

  const handleTogglePermission = useCallback((permissionKey: string) => {
    setPermissions((prev) => ({
      ...prev,
      [permissionKey]: !prev[permissionKey],
    }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Role name is required');
      return;
    }
    setNameError('');

    try {
      if (isEditing && editingRole) {
        const data: UpdateRoleDto = {
          name: trimmedName,
          description: description.trim() || undefined,
          permissions,
        };
        await updateRole.mutateAsync({ id: editingRole._id, data });
        toast.success('Role updated successfully');
      } else {
        const data: CreateRoleDto = {
          name: trimmedName,
          description: description.trim() || undefined,
          permissions,
        };
        await createRole.mutateAsync(data);
        toast.success('Role created successfully');
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save role');
    }
  };

  const handleClose = () => {
    if (!isPending) {
      onClose();
    }
  };

  return (
    <SlideOverDrawer
      isOpen={isOpen}
      onClose={handleClose}
      title={isEditing ? 'Edit Role' : 'Create Role'}
      width="max-w-lg md:max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <div className="flex-1 space-y-6">
          {/* Role Name */}
          <Input
            label="Role Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value.trim()) setNameError('');
            }}
            error={nameError}
            placeholder="e.g. Senior Cashier"
            disabled={isPending}
            required
          />

          {/* Description */}
          <div className="w-full flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary select-none">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of this role"
              disabled={isPending}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-surface text-text-primary placeholder-text-muted border border-border rounded-md transition-all duration-fast focus:outline-none focus:border-primary focus:ring-2 focus:ring-focus-ring disabled:opacity-disabled disabled:cursor-not-allowed resize-none"
            />
          </div>

          {/* Permission Matrix */}
          <div>
            <label className="text-sm font-medium text-text-secondary select-none block mb-2">
              Permissions
            </label>
            <PermissionMatrix
              permissions={permissions}
              onToggle={handleTogglePermission}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isPending}
          >
            {isEditing ? 'Save Changes' : 'Create Role'}
          </Button>
        </div>
      </form>
    </SlideOverDrawer>
  );
};