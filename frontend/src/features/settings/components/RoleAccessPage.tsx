'use client';

import React, { useState } from 'react';
import { useRoles } from '../hooks/useRoles';
import { useStaff } from '../hooks/useStaff';
import { useGroupedPermissions } from '../hooks/usePermissions';
import { RoleList } from './RoleList';
import { UserList } from './UserList';
import { PermissionMatrix } from './PermissionMatrix';
import { Shield, Users, Lock, Loader2 } from 'lucide-react';

type TabId = 'users' | 'roles' | 'permissions';

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabConfig[] = [
  { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
  { id: 'roles', label: 'Roles', icon: <Shield className="w-4 h-4" /> },
  { id: 'permissions', label: 'Permissions', icon: <Lock className="w-4 h-4" /> },
];

export const RoleAccessPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('roles');

  const {
    data: roles = [],
    isLoading: rolesLoading,
    error: rolesError,
  } = useRoles();

  const {
    data: staff = [],
    isLoading: staffLoading,
    error: staffError,
  } = useStaff();

  const {
    isLoading: permsLoading,
    error: permsError,
  } = useGroupedPermissions();

  const renderTabContent = () => {
    switch (activeTab) {
      case 'users':
        if (staffError) {
          return (
            <div className="bg-danger/10 border border-danger/20 rounded-lg p-6 text-center">
              <p className="text-sm font-medium text-danger">Failed to load users</p>
              <p className="text-xs text-danger/70 mt-1">{staffError.message}</p>
            </div>
          );
        }
        return <UserList staff={staff} isLoading={staffLoading} />;

      case 'roles':
        if (rolesError) {
          return (
            <div className="bg-danger/10 border border-danger/20 rounded-lg p-6 text-center">
              <p className="text-sm font-medium text-danger">Failed to load roles</p>
              <p className="text-xs text-danger/70 mt-1">{rolesError.message}</p>
            </div>
          );
        }
        return <RoleList roles={roles} isLoading={rolesLoading} />;

      case 'permissions':
        if (permsError) {
          return (
            <div className="bg-danger/10 border border-danger/20 rounded-lg p-6 text-center">
              <p className="text-sm font-medium text-danger">Failed to load permissions</p>
              <p className="text-xs text-danger/70 mt-1">{permsError.message}</p>
            </div>
          );
        }
        if (permsLoading) {
          return (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-text-secondary">Loading permissions...</span>
            </div>
          );
        }
        return (
          <div>
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Permission Library</h3>
              <p className="text-sm text-text-muted">
                Complete list of all available permissions in the system. This view is read-only.
              </p>
            </div>
            <PermissionMatrix
              permissions={{}}
              readOnly
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto pb-12">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Roles & Access
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Manage users, roles, and permissions for your organization.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-hover p-1 rounded-lg w-full max-w-md" role="tablist" aria-label="Roles & Access sections">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                isActive
                  ? 'bg-surface text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={activeTab}
        className="min-h-[300px]"
      >
        {renderTabContent()}
      </div>
    </div>
  );
};