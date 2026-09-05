'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RoleWithPermissions } from '../types/role.types';
import { useDeleteRole, useDuplicateRole } from '../hooks/useRoles';
import { RoleFormDrawer } from './RoleFormDrawer';
import { Role } from '../types/role.types';
import {
  Shield,
  Plus,
  Edit3,
  Copy,
  Trash2,
  Loader2,
  Users,
  Layers,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface RoleListProps {
  roles: RoleWithPermissions[];
  isLoading: boolean;
}

export const RoleList: React.FC<RoleListProps> = ({ roles, isLoading }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  const deleteRole = useDeleteRole();
  const duplicateRole = useDuplicateRole();

  const handleCreate = () => {
    setEditingRole(null);
    setIsDrawerOpen(true);
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setIsDrawerOpen(true);
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateRole.mutateAsync(id);
      toast.success('Role duplicated successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to duplicate role');
    }
  };

  const handleDelete = async (role: RoleWithPermissions) => {
    if (role.isSystem) {
      toast.error('System roles cannot be deleted');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete "${role.name}"?`)) {
      return;
    }
    try {
      await deleteRole.mutateAsync(role._id);
      toast.success('Role deleted successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete role');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-text-secondary">Loading roles...</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Roles</h3>
          <p className="text-sm text-text-muted">
            {roles.length} role{roles.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={handleCreate}
        >
          Add Role
        </Button>
      </div>

      {roles.length === 0 ? (
        <Card variant="flat" padding="lg">
          <div className="text-center py-8">
            <Shield className="w-12 h-12 text-text-muted mx-auto mb-3" />
            <p className="text-sm font-medium text-text-secondary">No roles created yet</p>
            <p className="text-xs text-text-muted mt-1">
              Create your first role to start managing permissions.
            </p>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={handleCreate}
              className="mt-4"
            >
              Create Role
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((role) => {
            const permissionCount = role.permissionCount ?? Object.keys(role.permissions).length;
            const isDeleting = deleteRole.isPending && deleteRole.variables === role._id;
            const isDuplicating = duplicateRole.isPending && duplicateRole.variables === role._id;

            return (
              <Card
                key={role._id}
                variant="interactive"
                padding="md"
                className="relative group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Shield
                      className={`w-5 h-5 flex-shrink-0 ${
                        role.isSystem ? 'text-primary' : 'text-text-muted'
                      }`}
                    />
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-text-primary truncate">
                        {role.name}
                      </h4>
                      {role.description && (
                        <p className="text-xs text-text-muted truncate mt-0.5">
                          {role.description}
                        </p>
                      )}
                    </div>
                  </div>
                  {role.isSystem && (
                    <Badge variant="primary" size="sm" className="flex-shrink-0">
                      System
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs text-text-muted mb-4">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5" />
                    {permissionCount} permission{permissionCount !== 1 ? 's' : ''}
                  </span>
                  {role.userCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {role.userCount} user{role.userCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <IconButton
                    icon={<Edit3 className="w-4 h-4" />}
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${role.name}`}
                    onClick={() => handleEdit(role)}
                  />
                  <IconButton
                    icon={isDuplicating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                    variant="ghost"
                    size="sm"
                    aria-label={`Duplicate ${role.name}`}
                    onClick={() => handleDuplicate(role._id)}
                    disabled={isDuplicating}
                  />
                  {!role.isSystem && (
                    <IconButton
                      icon={isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${role.name}`}
                      onClick={() => handleDelete(role)}
                      disabled={isDeleting}
                      className="text-danger hover:text-danger"
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <RoleFormDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        editingRole={editingRole}
      />
    </>
  );
};