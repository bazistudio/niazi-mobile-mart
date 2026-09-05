'use client';

import React, { useState } from 'react';
import { Users, UserCheck, UserX, Mail, Activity, Eye, Edit, MapPin, Key, Ban, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { KpiCard } from '@/features/settings/components/KpiCard';
import { SettingsCard } from '@/features/settings/components/SettingsCard';
import { DataTable, TableColumn } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SlideOverDrawer } from '@/components/ui/SlideOverDrawer';
import { useStaff, useUpdateStaffStatus, useResetStaffPin } from '@/features/settings/hooks/useStaff';
import { StaffUser } from '@/features/settings/types/staff.types';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import toast from 'react-hot-toast';

export default function WorkforcePage() {
  const { data: staffList = [], isLoading, isError, error } = useStaff();
  const updateStatus = useUpdateStaffStatus();
  const resetPin = useResetStaffPin();
  const activeShop = useOrganizationStore(state => state.activeShop);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit'>('view');

  const handleAction = async (staff: StaffUser, mode: 'view' | 'edit' | 'pin' | 'disable') => {
    if (mode === 'view' || mode === 'edit') {
      setSelectedStaff(staff);
      setDrawerMode(mode);
      setIsDrawerOpen(true);
    } else if (mode === 'pin') {
      try {
        const res = await resetPin.mutateAsync(staff._id);
        toast.success(`New PIN generated: ${res.pin || 'Updated'}`);
      } catch (err: any) {
        toast.error(err.message || 'Failed to reset PIN');
      }
    } else if (mode === 'disable') {
      try {
        const nextStatus = staff.status === 'active' ? 'suspended' : 'active';
        await updateStatus.mutateAsync({ id: staff._id, status: nextStatus });
        toast.success(`Employee status changed to ${nextStatus}`);
      } catch (err: any) {
        toast.error(err.message || 'Failed to update employee status');
      }
    }
  };

  const renderActionMenu = (row: StaffUser) => (
    <div className="flex items-center gap-2">
      <button onClick={() => handleAction(row, 'view')} className="text-text-muted hover:text-primary transition-colors cursor-pointer" title="View Profile"><Eye className="h-4 w-4" /></button>
      <button onClick={() => handleAction(row, 'edit')} className="text-text-muted hover:text-primary transition-colors cursor-pointer" title="Edit Profile"><Edit className="h-4 w-4" /></button>
      <button onClick={() => handleAction(row, 'pin')} className="text-text-muted hover:text-primary transition-colors cursor-pointer" title="Reset PIN"><Key className="h-4 w-4" /></button>
      <button onClick={() => handleAction(row, 'disable')} className="text-text-muted hover:text-warning transition-colors cursor-pointer" title={row.status === 'active' ? 'Disable Account' : 'Enable Account'}><Ban className="h-4 w-4" /></button>
    </div>
  );

  const employeeColumns: TableColumn<StaffUser>[] = [
    { key: 'name', label: 'Employee', render: (row) => (
      <div>
        <div className="font-medium text-text-primary">{row.name}</div>
        <div className="text-xs text-text-muted">{row.email || row.phone || row.username || 'No email provided'}</div>
      </div>
    )},
    { key: 'roleName', label: 'Role', render: (row) => row.roleName || 'Staff' },
    { key: 'branch', label: 'Branch', render: () => activeShop?.name || 'Assigned Branch' },
    { key: 'status', label: 'Status', render: (row) => (
      <Badge variant={row.status === 'active' ? 'success' : 'danger'}>{row.status.toUpperCase()}</Badge>
    )},
    { key: 'createdAt', label: 'Joined', render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : 'N/A' },
    { key: 'actions', label: 'Actions', render: renderActionMenu },
  ];

  return (
    <div className="flex flex-col gap-8 w-full max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--color-primary)', opacity: 0.12 }}
          >
            <Users className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Workforce</h1>
            <p className="text-sm text-text-muted">
              Manage employees, invitations, and view workforce activity
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Employees" value={staffList.length.toString()} icon={<Users />} variant="default" />
        <KpiCard label="Active Employees" value={staffList.filter(s => s.status === 'active').length.toString()} icon={<UserCheck />} variant="success" />
        <KpiCard label="Inactive / Suspended" value={staffList.filter(s => s.status !== 'active').length.toString()} icon={<UserX />} variant="warning" />
        <KpiCard label="Configured PINs" value={staffList.filter(s => s.hasPin).length.toString()} icon={<Key />} variant="info" />
      </div>

      {/* Section 2: Employee Management Table */}
      <SettingsCard
        title="Employee Directory"
        description="Manage active and inactive staff members for this shop"
        icon={<Users className="w-5 h-5" />}
      >
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="p-6 text-center text-danger border border-danger/20 rounded-lg bg-danger/5">
            <AlertCircle className="w-6 h-6 mx-auto mb-2" />
            <p className="font-semibold text-sm">Failed to load workforce directory</p>
            <p className="text-xs text-text-muted mt-1">{error?.message || 'Server error'}</p>
          </div>
        ) : staffList.length === 0 ? (
          <div className="p-8 text-center text-text-muted border border-border rounded-lg">
            <Users className="w-8 h-8 mx-auto mb-2 text-text-muted opacity-50" />
            <p className="text-sm font-medium">No employees registered yet</p>
            <p className="text-xs mt-1">Add staff members to grant access to POS and shop operations.</p>
          </div>
        ) : (
          <div className="min-h-[300px]">
            <DataTable columns={employeeColumns} data={staffList} />
          </div>
        )}
      </SettingsCard>

      {/* Employee Drawer */}
      <SlideOverDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={drawerMode === 'view' ? 'Employee Profile' : 'Edit Employee'}
      >
        {selectedStaff && (
          <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xl font-bold">
                {selectedStaff.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-lg font-bold">{selectedStaff.name}</h3>
                <Badge variant={selectedStaff.status === 'active' ? 'success' : 'danger'}>{selectedStaff.status.toUpperCase()}</Badge>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-text-muted">Full Name</label>
                <p className="text-sm font-medium">{selectedStaff.name}</p>
              </div>
              
              <div>
                <label className="text-xs font-medium text-text-muted">Phone Number</label>
                <p className="text-sm font-medium">{selectedStaff.phone || 'N/A'}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-text-muted">Email / Username</label>
                <p className="text-sm font-medium">{selectedStaff.email || selectedStaff.username || 'N/A'}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-text-muted">Assigned Branch</label>
                <p className="text-sm font-medium">{activeShop?.name || 'Assigned Branch'}</p>
              </div>

              <div className="bg-warning/10 border border-warning/30 p-3 rounded-lg">
                <label className="text-xs font-medium text-warning">Assigned Role</label>
                <p className="text-sm font-bold mt-1 mb-3">{selectedStaff.roleName || 'Staff'}</p>
                <a href="/dashboard/shop-admin/settings/roles" className="text-xs bg-surface border border-border px-3 py-1.5 rounded shadow-sm hover:bg-surface-hover transition-colors font-medium">
                  Manage Role & Permissions
                </a>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                <div>
                  <label className="text-xs font-medium text-text-muted">PIN Status</label>
                  <p className="text-sm font-medium">{selectedStaff.hasPin ? 'Configured' : 'Not Set'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted">Join Date</label>
                  <p className="text-sm font-medium">{selectedStaff.createdAt ? new Date(selectedStaff.createdAt).toLocaleDateString() : 'N/A'}</p>
                </div>
              </div>
            </div>

            <div className="mt-auto pt-4 border-t border-border flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDrawerOpen(false)}>Close</Button>
            </div>
          </div>
        )}
      </SlideOverDrawer>
    </div>
  );
}