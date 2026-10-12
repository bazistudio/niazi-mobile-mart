import React, { useState, useMemo } from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { UserList } from '@/features/settings/components/UserList';
import { RoleList } from '@/features/settings/components/RoleList';
import { useStaff } from '@/features/settings/hooks/useStaff';
import { useRoles } from '@/features/settings/hooks/useRoles';
import { StaffUser } from '@/features/settings/types/staff.types';
import { Badge } from '@/components/ui/Badge';
import {
  Users,
  Store,
  ShieldCheck,
  CheckCircle2,
  KeyRound,
  Activity,
  Search,
  Plus,
  Loader2,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchesSearch(user: StaffUser, q: string): boolean {
  const lower = q.toLowerCase();
  return (
    user.name.toLowerCase().includes(lower) ||
    (user.username ?? '').toLowerCase().includes(lower) ||
    (user.phone ?? '').toLowerCase().includes(lower) ||
    (user.email ?? '').toLowerCase().includes(lower) ||
    (user.roleName ?? '').toLowerCase().includes(lower) ||
    (user.branchName ?? '').toLowerCase().includes(lower)
  );
}

function StatusBadge({ status }: { status: StaffUser['status'] }) {
  const variant =
    status === 'active'
      ? ('success' as const)
      : status === 'suspended'
      ? ('warning' as const)
      : status === 'pending'
      ? ('info' as const)
      : ('neutral' as const);
  return (
    <Badge variant={variant} size="sm" dot>
      {status}
    </Badge>
  );
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

/** Branch Allocation tab — shows one row per staff member with branch info */
function BranchAllocationTab({ staff }: { staff: StaffUser[] }) {
  // Group by branch
  const byBranch = useMemo(() => {
    const map: Record<string, StaffUser[]> = {};
    for (const s of staff) {
      const key = s.branchName || s.branchId || 'Unassigned';
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [staff]);

  if (staff.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No staff to display.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(byBranch).map(([branch, members]) => (
        <div key={branch} className="bg-white dark:bg-gray-800/90 rounded-xl border border-gray-200/80 dark:border-gray-700/80 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
            <Store className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm text-gray-900 dark:text-white">{branch}</span>
            <Badge variant="neutral" size="sm">{members.length}</Badge>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 dark:border-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {members.map((m) => (
                <tr key={m._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900 dark:text-white">{m.name}</div>
                    {m.username && <div className="text-xs text-gray-400">{m.username}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="info" size="sm">{m.roleName || 'Unknown'}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <StatusBadge status={m.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/** Status tab — shows staff grouped by employment status */
function StatusTab({ staff }: { staff: StaffUser[] }) {
  const groups: { key: StaffUser['status']; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'suspended', label: 'Suspended' },
    { key: 'pending', label: 'Pending Approval' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'rejected', label: 'Rejected' },
  ];

  const byStatus = useMemo(() => {
    const map: Partial<Record<StaffUser['status'], StaffUser[]>> = {};
    for (const s of staff) {
      if (!map[s.status]) map[s.status] = [];
      map[s.status]!.push(s);
    }
    return map;
  }, [staff]);

  const present = groups.filter((g) => (byStatus[g.key]?.length ?? 0) > 0);

  if (present.length === 0) {
    return <div className="text-center py-12 text-gray-400 text-sm">No staff to display.</div>;
  }

  return (
    <div className="space-y-4">
      {present.map(({ key, label }) => {
        const members = byStatus[key]!;
        return (
          <div key={key} className="bg-white dark:bg-gray-800/90 rounded-xl border border-gray-200/80 dark:border-gray-700/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm text-gray-900 dark:text-white">{label}</span>
              <Badge variant="neutral" size="sm">{members.length}</Badge>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Branch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {members.map((m) => (
                  <tr key={m._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900 dark:text-white">{m.name}</div>
                      {m.phone && <div className="text-xs text-gray-400">{m.phone}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="info" size="sm">{m.roleName || 'Unknown'}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">
                      {m.branchName || m.branchId || <span className="italic text-gray-400">Main</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/** Permissions tab — role distribution summary. Per-user permission editing is
 *  backend-unsupported (INDIVIDUAL grants are localStorage-only in the RBAC model).
 *  Shows a read-only summary: role name + permission counts sourced from staff list. */
function PermissionsTab({ staff }: { staff: StaffUser[] }) {
  const roleGroups = useMemo(() => {
    const map: Record<string, { roleName: string; members: StaffUser[] }> = {};
    for (const s of staff) {
      const key = s.roleId;
      if (!map[key]) map[key] = { roleName: s.roleName ?? s.roleId, members: [] };
      map[key].members.push(s);
    }
    return Object.values(map).sort((a, b) => b.members.length - a.members.length);
  }, [staff]);

  if (staff.length === 0) {
    return <div className="text-center py-12 text-gray-400 text-sm">No staff to display.</div>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg px-4 py-2.5">
        Per-user permission overrides are managed at the branch level under Shop Admin → Settings → Roles. This view shows the role assignments across all branches.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roleGroups.map(({ roleName, members }) => (
          <div key={roleName} className="bg-white dark:bg-gray-800/90 rounded-xl border border-gray-200/80 dark:border-gray-700/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm text-gray-900 dark:text-white">{roleName}</span>
              </div>
              <Badge variant="neutral" size="sm">{members.length} user{members.length !== 1 ? 's' : ''}</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <span key={m._id} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Activity tab — shows a log-style view of staff ordered by recent update */
function ActivityTab({ staff }: { staff: StaffUser[] }) {
  const sorted = useMemo(
    () =>
      [...staff].sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
      }),
    [staff]
  );

  if (sorted.length === 0) {
    return <div className="text-center py-12 text-gray-400 text-sm">No activity to display.</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800/90 rounded-xl border border-gray-200/80 dark:border-gray-700/80 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500">Staff sorted by last-modified timestamp. Live shift and register activity requires an audit-log integration.</p>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 dark:border-gray-700">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Branch</th>
            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {sorted.map((m) => (
            <tr key={m._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
              <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{m.name}</td>
              <td className="px-4 py-2.5">
                <Badge variant="info" size="sm">{m.roleName || 'Unknown'}</Badge>
              </td>
              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 text-xs">
                {m.branchName || m.branchId || '—'}
              </td>
              <td className="px-4 py-2.5 text-center">
                <StatusBadge status={m.status} />
              </td>
              <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                {m.updatedAt ? new Date(m.updatedAt).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function StaffManagementPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: staffData = [], isLoading: staffLoading } = useStaff();
  const { data: rolesData = [], isLoading: rolesLoading } = useRoles();

  const filteredStaff = useMemo(() => {
    if (!searchQuery.trim()) return staffData;
    return staffData.filter((u) => matchesSearch(u, searchQuery));
  }, [staffData, searchQuery]);

  const employeeSections = [
    { id: 'all', label: 'All Employees', icon: Users },
    { id: 'branch', label: 'Branch Allocation', icon: Store },
    { id: 'role', label: 'Roles', icon: ShieldCheck },
    { id: 'status', label: 'Status', icon: CheckCircle2 },
    { id: 'permissions', label: 'Permissions', icon: KeyRound },
    { id: 'activity', label: 'Activity', icon: Activity },
  ];

  const isRoleTab = activeTab === 'role';
  const searchPlaceholder = isRoleTab ? 'Search roles...' : 'Search employees...';

  const renderTabContent = () => {
    if (isRoleTab) {
      return <RoleList roles={rolesData} isLoading={rolesLoading} />;
    }

    if (staffLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-gray-500">Loading employees...</span>
        </div>
      );
    }

    switch (activeTab) {
      case 'all':
        return <UserList staff={filteredStaff} isLoading={false} />;
      case 'branch':
        return <BranchAllocationTab staff={filteredStaff} />;
      case 'status':
        return <StatusTab staff={filteredStaff} />;
      case 'permissions':
        return <PermissionsTab staff={filteredStaff} />;
      case 'activity':
        return <ActivityTab staff={filteredStaff} />;
      default:
        return <UserList staff={filteredStaff} isLoading={false} />;
    }
  };

  return (
    <OrganizationPageShell
      title="Organization Employees"
      description="Organization-wide employee management across all branches and stores."
      badge="Workforce Management"
      action={
        // The "Add User" button lives inside UserList's own header to keep the
        // drawer wired up; we only show the shell action for non-list tabs.
        !['all', 'role'].includes(activeTab) ? (
          <button
            disabled
            className="flex items-center gap-2 px-3.5 py-2 bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-medium cursor-not-allowed shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Invite Employee</span>
          </button>
        ) : undefined
      }
    >
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200 dark:border-gray-800">
        {employeeSections.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeTab === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => { setActiveTab(sec.id); setSearchQuery(''); }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200/60 dark:border-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* Search / Filter Bar */}
      <div className="bg-white dark:bg-gray-800/90 rounded-xl p-4 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-auto flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          {!isRoleTab && (
            <>
              <span className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-md">
                {filteredStaff.length} of {staffData.length} employee{staffData.length !== 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {renderTabContent()}
      </div>
    </OrganizationPageShell>
  );
}

export default StaffManagementPage;
