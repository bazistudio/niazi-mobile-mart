import React, { useState } from 'react';
import { Users, UserCheck, UserX, Key, Ban, Eye, Edit, Loader2, AlertCircle, CheckCircle, XCircle, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { KpiCard } from '@/features/settings/components/KpiCard';
import { SettingsCard } from '@/features/settings/components/SettingsCard';
import { DataTable, TableColumn } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SlideOverDrawer } from '@/components/ui/SlideOverDrawer';
import {
  useStaff,
  useUpdateStaffStatus,
  useResetStaffPin,
  useApproveStaff,
  useRejectStaff,
  useResetStaffPassword,
} from '@/features/settings/hooks/useStaff';
import { StaffUser } from '@/features/settings/types/staff.types';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import toast from 'react-hot-toast';

export const WorkforcePage: React.FC = () => {
  const { data: staffList = [], isLoading, isError, error } = useStaff();
  const updateStatus = useUpdateStaffStatus();
  const resetPin = useResetStaffPin();
  const approveStaff = useApproveStaff();
  const rejectStaff = useRejectStaff();
  const resetStaffPassword = useResetStaffPassword();
  const activeShop = useOrganizationStore(state => state.activeShop);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit'>('view');

  // Admin password reset modal state
  const [resetModalStaff, setResetModalStaff] = useState<StaffUser | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleApprove = async (staff: StaffUser) => {
    try {
      await approveStaff.mutateAsync(staff._id);
      toast.success(`Approved ${staff.name}. Account is now active.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve staff');
    }
  };

  const handleReject = async (staff: StaffUser) => {
    try {
      await rejectStaff.mutateAsync(staff._id);
      toast.success(`Rejected ${staff.name}.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject staff');
    }
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalStaff || tempPassword.trim().length < 6) {
      toast.error('Temporary password must be at least 6 characters');
      return;
    }

    setIsResetting(true);
    try {
      await resetStaffPassword.mutateAsync({
        id: resetModalStaff._id,
        temporaryPassword: tempPassword.trim(),
      });
      toast.success(`Temporary password set for ${resetModalStaff.name}. Password change forced on next login.`);
      setResetModalStaff(null);
      setTempPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset staff password');
    } finally {
      setIsResetting(false);
    }
  };

  const handleAction = async (staff: StaffUser, mode: 'view' | 'edit' | 'pin' | 'disable' | 'reset-pwd') => {
    if (mode === 'view' || mode === 'edit') {
      setSelectedStaff(staff);
      setDrawerMode(mode);
      setIsDrawerOpen(true);
    } else if (mode === 'reset-pwd') {
      setResetModalStaff(staff);
      setTempPassword('');
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
      {row.status === 'pending' ? (
        <>
          <button
            onClick={() => handleApprove(row)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer border border-emerald-200"
            title="Approve Staff Member"
          >
            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
            <span>Approve</span>
          </button>
          <button
            onClick={() => handleReject(row)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 rounded-lg transition-colors cursor-pointer border border-red-200"
            title="Reject Staff Member"
          >
            <XCircle className="h-3.5 w-3.5 text-red-600" />
            <span>Reject</span>
          </button>
        </>
      ) : (
        <>
          <button onClick={() => handleAction(row, 'view')} className="text-text-muted hover:text-primary transition-colors cursor-pointer" title="View Profile"><Eye className="h-4 w-4" /></button>
          <button onClick={() => handleAction(row, 'reset-pwd')} className="text-text-muted hover:text-primary transition-colors cursor-pointer" title="Reset Password (Forced Change)"><KeyRound className="h-4 w-4" /></button>
          <button onClick={() => handleAction(row, 'pin')} className="text-text-muted hover:text-primary transition-colors cursor-pointer" title="Reset PIN"><Key className="h-4 w-4" /></button>
          <button onClick={() => handleAction(row, 'disable')} className="text-text-muted hover:text-warning transition-colors cursor-pointer" title={row.status === 'active' ? 'Disable Account' : 'Enable Account'}><Ban className="h-4 w-4" /></button>
        </>
      )}
    </div>
  );

  const getStatusBadge = (status: string, mustChangePassword?: boolean) => {
    switch (status.toLowerCase()) {
      case 'active':
        return (
          <div className="flex flex-col gap-0.5">
            <Badge variant="success">ACTIVE</Badge>
            {mustChangePassword && (
              <span className="text-[10px] text-amber-600 font-medium">Must Change Pwd</span>
            )}
          </div>
        );
      case 'pending':
        return <Badge variant="warning">PENDING APPROVAL</Badge>;
      case 'rejected':
        return <Badge variant="danger">REJECTED</Badge>;
      case 'suspended':
      default:
        return <Badge variant="neutral">{status.toUpperCase()}</Badge>;
    }
  };

  const employeeColumns: TableColumn<StaffUser>[] = [
    { key: 'name', label: 'Employee', render: (row) => (
      <div>
        <div className="font-medium text-text-primary">{row.name}</div>
        <div className="text-xs text-text-muted">{row.username ? `@${row.username}` : (row.email || 'No username')}</div>
      </div>
    )},
    { key: 'roleName', label: 'Role', render: (row) => row.roleName || 'Staff' },
    { key: 'branch', label: 'Branch', render: () => activeShop?.name || 'Assigned Branch' },
    { key: 'status', label: 'Status', render: (row) => getStatusBadge(row.status, row.mustChangePassword) },
    { key: 'createdAt', label: 'Joined', render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : 'N/A' },
    { key: 'actions', label: 'Actions', render: renderActionMenu },
  ];

  const pendingCount = staffList.filter(s => s.status === 'pending').length;

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
              Manage internal staff accounts, onboarding approvals, and credentials
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Staff" value={staffList.length.toString()} icon={<Users />} variant="default" />
        <KpiCard label="Active Staff" value={staffList.filter(s => s.status === 'active').length.toString()} icon={<UserCheck />} variant="success" />
        <KpiCard label="Pending Approval" value={pendingCount.toString()} icon={<UserX />} variant={pendingCount > 0 ? 'warning' : 'default'} />
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
                <Link to="/dashboard/shop-admin/settings/roles" className="text-xs bg-surface border border-border px-3 py-1.5 rounded shadow-sm hover:bg-surface-hover transition-colors font-medium inline-block">
                  Manage Role & Permissions
                </Link>
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

      {/* Admin Temporary Password Reset Modal */}
      {resetModalStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Reset Staff Password</h3>
                <p className="text-xs text-slate-500">{resetModalStaff.name} (@{resetModalStaff.username || 'staff'})</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200/80 leading-relaxed">
              Setting a temporary password will flag this account with <strong className="text-slate-800">Must Change Password</strong>. Upon next login, the employee will be strictly forced to set their own private password before accessing the system.
            </p>

            <form onSubmit={handleConfirmResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Temporary Password
                </label>
                <input
                  type="text"
                  required
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#006970] focus:ring-1 focus:ring-[#006970] font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setResetModalStaff(null);
                    setTempPassword('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isResetting || tempPassword.trim().length < 6}
                >
                  {isResetting ? 'Setting...' : 'Set Temporary Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
