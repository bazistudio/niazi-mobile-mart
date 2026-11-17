'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { repairApi } from '../services/repair.api';
import { httpClient } from '@/lib/http/httpClient';
import toast from 'react-hot-toast';
import {
  Search,
  Download,
  Wrench,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  UserCheck,
  DollarSign,
  TrendingUp,
  Lock,
  Layers,
  FlaskConical,
  CheckCircle2,
  RotateCcw,
  Edit,
  Trash2,
  ArrowRightLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RepairFormDrawer } from './modals/RepairFormDrawer';
import { PartsConsumptionLabTab } from './PartsConsumptionLabTab';
import { LabCashRegisterLedgerTab } from './LabCashRegisterLedgerTab';
import { DoneJobSettlementModal } from './modals/DoneJobSettlementModal';
import { format } from 'date-fns';
import { Badge } from '@/components/ui';
import type { BadgeProps } from '@/components/ui';
import { useStaff } from '@/features/settings/hooks/useStaff';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useCashStore } from '@/features/cash/store/cash.store';
import { CashSessionOpenModal } from '@/features/cash/components/CashSessionOpenModal';
import { CashSessionCloseModal } from '@/features/cash/components/CashSessionCloseModal';
import type { RepairJob } from '../types/repair.types';

export interface RepairDashboardProps {
  /** Organization admin view: hide the right-column intake form and use full width. */
  hideBookingForm?: boolean;
}

export type RepairDashboardTab = 'jobs' | 'parts_lab' | 'lab_cash_ledger';

export const RepairDashboard = ({ hideBookingForm = false }: RepairDashboardProps) => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const isMechanicUser = currentUser?.role === 'REPAIR_MECHANIC';
  const isOrgAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'OWNER';

  const activeShop = useOrganizationStore((s) => s.activeShop);
  const activeShopId = useOrganizationStore((s) => s.activeShopId || s.activeShop?._id || null);

  const currentBranchId = currentUser?.shopId || currentUser?.branchId || currentUser?.branch_id || null;

  const [selectedBranchId, setSelectedBranchId] = useState<string>('USE_GLOBAL_SWITCHER');

  const { data: branchList = [] } = useQuery({
    queryKey: ['branches-list'],
    queryFn: async () => {
      const res = await httpClient.get<{ id?: string; _id?: string; name: string }[] | { data: { id?: string; _id?: string; name: string }[] }>('/api/v1/branches');
      return Array.isArray(res) ? res : ((res as any)?.data || []);
    },
    enabled: isOrgAdmin,
  });

  const branchMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of branchList as any[]) {
      const bId = b.id || b._id;
      if (bId) map.set(bId, b.name);
    }
    return map;
  }, [branchList]);

  // Sync selectedBranchId when activeShopId changes in topbar switcher if user has not picked a specific dropdown override
  React.useEffect(() => {
    if (selectedBranchId === 'USE_GLOBAL_SWITCHER') {
      // keep following global switcher
    }
  }, [activeShopId, selectedBranchId]);

  // Effective branch ID:
  // If org admin explicitly selected 'ALL', view all branches.
  // If org admin selected 'USE_GLOBAL_SWITCHER', follow activeShopId from topbar switcher.
  // If org admin selected a specific branch ID, use that.
  // Otherwise, fallback to currentUser branch.
  const effectiveBranchId = useMemo(() => {
    if (isOrgAdmin) {
      if (selectedBranchId === 'ALL') return undefined;
      if (selectedBranchId === 'USE_GLOBAL_SWITCHER') {
        return activeShopId || undefined;
      }
      return selectedBranchId || undefined;
    }
    return currentBranchId || activeShopId || undefined;
  }, [isOrgAdmin, selectedBranchId, activeShopId, currentBranchId]);

  // Navigation Tabs: 'jobs' = Repair Jobs & Service Desk, 'parts_lab' = Parts Consumption & Lab Movement, 'lab_cash_ledger' = Lab Cash Register & Ledger
  const [activeTab, setActiveTab] = useState<RepairDashboardTab>('jobs');

  // Done Job Settlement Modal state
  const [settlementJob, setSettlementJob] = useState<RepairJob | null>(null);

  // Selected Job for Details / Refill Edit in the right panel
  const [editingJob, setEditingJob] = useState<RepairJob | null>(null);

  // Quick Session Modals on Repair Dashboard
  const [isOpenSessionModalOpen, setIsOpenSessionModalOpen] = useState(false);
  const [isCloseSessionModalOpen, setIsCloseSessionModalOpen] = useState(false);
  const { currentSession, fetchCurrentState } = useCashStore();

  React.useEffect(() => {
    fetchCurrentState();
  }, [fetchCurrentState]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [mechanicFilter, setMechanicFilter] = useState(() =>
    isMechanicUser && currentUser?.id ? currentUser.id : ''
  );

  // ROLE LOCK: a repair mechanic is always scoped to their own jobs.
  const effectiveMechanicFilter = isMechanicUser ? currentUser?.id ?? '' : mechanicFilter;

  const { data: staffList = [] } = useStaff();

  // Mechanic selector: branchMechanics filtered to effectiveBranchId (or currentBranchId)
  const branchMechanics = useMemo(() => {
    return staffList.filter((s) => {
      const roleKey = `${s.roleId || ''} ${s.roleName || ''}`.toUpperCase();
      const isMechanicRole = roleKey.includes('MECHANIC');
      const targetBranch = effectiveBranchId || currentBranchId;
      const matchesBranch = targetBranch ? s.branchId === targetBranch : true;
      return isMechanicRole && matchesBranch;
    });
  }, [staffList, effectiveBranchId, currentBranchId]);

  const { data: response, isLoading } = useQuery({
    queryKey: ['repairs', statusFilter, effectiveMechanicFilter, effectiveBranchId],
    queryFn: () =>
      repairApi.getRepairJobs({
        status: statusFilter || undefined,
        technician_id: effectiveMechanicFilter || undefined,
        branch_id: effectiveBranchId,
        limit: 100,
      }),
  });

  const queryClient = useQueryClient();

  const updateStatusMutation = useMutation({
    mutationFn: async ({ jobId, newStatus, note }: { jobId: string; newStatus: string; note: string }) => {
      return await repairApi.updateStatus(jobId, newStatus, note);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      toast.success(`Job marked as ${variables.newStatus}`);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to update job status');
    },
  });

  const finishRepairMutation = useMutation({
    mutationFn: async ({
      jobId,
      settlementAmount,
      paymentMethod,
      paymentReference,
      deliveryNotes,
      markDelivered,
    }: {
      jobId: string;
      settlementAmount: number;
      paymentMethod: string;
      paymentReference?: string;
      deliveryNotes?: string;
      markDelivered: boolean;
    }) => {
      if (markDelivered) {
        return await repairApi.finishRepair(jobId, {
          settlement_payment:
            settlementAmount > 0
              ? {
                amount: settlementAmount,
                method: paymentMethod,
                reference: paymentReference || null,
              }
              : null,
          delivery_notes: deliveryNotes || 'Settled and completed via Lab Cash Register',
        });
      } else {
        // Just record payment if any, and set Ready for Pickup
        if (settlementAmount > 0) {
          await repairApi.addPayment(jobId, {
            amount: settlementAmount,
            method: paymentMethod,
            reference: paymentReference || undefined,
          });
        }
        return await repairApi.updateStatus(
          jobId,
          'Ready for Pickup',
          'Repair completed, payment recorded in Lab Register'
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      toast.success('Repair job completed and settled successfully!');
      setSettlementJob(null);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to complete repair settlement');
    },
  });

  const [transferringJob, setTransferringJob] = useState<any | null>(null);
  const [transferTargetBranchId, setTransferTargetBranchId] = useState<string>('');
  const [transferTargetTechId, setTransferTargetTechId] = useState<string>('');
  const [transferReason, setTransferReason] = useState<string>('');

  const transferRepairMutation = useMutation({
    mutationFn: async ({
      jobId,
      targetBranchId,
      targetTechnicianId,
      reason,
    }: {
      jobId: string;
      targetBranchId: string;
      targetTechnicianId?: string | null;
      reason: string;
    }) => {
      return await repairApi.transferRepairJob(jobId, {
        targetBranchId,
        targetTechnicianId: targetTechnicianId || null,
        reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      toast.success('Repair job transferred successfully!');
      setTransferringJob(null);
      setTransferReason('');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to transfer repair job');
    },
  });

  const deleteRepairMutation = useMutation({
    mutationFn: async (jobId: string) => {
      return await repairApi.deleteRepairJob(jobId);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      toast.success(`Repair job ${data.jobId} deleted successfully`);
      if (editingJob && (editingJob.id === (data as any).id || editingJob.jobId === data.jobId)) {
        setEditingJob(null);
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to delete repair job');
    },
  });

  const jobs: RepairJob[] = (response?.data as RepairJob[]) || [];

  // Client-side search filtering
  const filteredJobs = useMemo(() => {
    if (!searchTerm.trim()) return jobs;
    const q = searchTerm.toLowerCase();
    return jobs.filter((job: any) => {
      return (
        job.jobId?.toLowerCase().includes(q) ||
        job.device?.brand?.toLowerCase().includes(q) ||
        job.device?.model?.toLowerCase().includes(q) ||
        job.device?.imei?.toLowerCase().includes(q) ||
        job.customerId?.name?.toLowerCase().includes(q) ||
        job.customerId?.contactPerson?.toLowerCase().includes(q) ||
        job.technicianId?.name?.toLowerCase().includes(q)
      );
    });
  }, [jobs, searchTerm]);

  // Mechanic Accounting & Total Jobs Reports Summary
  const mechanicReports = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        totalJobs: number;
        activeJobs: number;
        completedJobs: number;
        totalEstimated: number;
        totalCollected: number;
        totalPending: number;
      }
    >();

    for (const job of filteredJobs as any[]) {
      const techId = job.technicianId?._id || 'unassigned';
      const techName = job.technicianId?.name || 'Unassigned / Desk';

      if (!map.has(techId)) {
        map.set(techId, {
          id: techId,
          name: techName,
          totalJobs: 0,
          activeJobs: 0,
          completedJobs: 0,
          totalEstimated: 0,
          totalCollected: 0,
          totalPending: 0,
        });
      }

      const entry = map.get(techId)!;
      entry.totalJobs += 1;
      if (job.status === 'Delivered' || job.status === 'Ready for Pickup') {
        entry.completedJobs += 1;
      } else if (job.status !== 'Cancelled' && job.status !== 'Rejected') {
        entry.activeJobs += 1;
      }

      const est = Number(job.grandTotal || job.estimatedCost || 0);
      const paid = Number(job.totalPaid || 0);
      const rem = Math.max(0, Number(job.remainingBalance ?? est - paid));

      entry.totalEstimated += est;
      entry.totalCollected += paid;
      entry.totalPending += rem;
    }

    return Array.from(map.values()).sort((a, b) => b.totalJobs - a.totalJobs);
  }, [filteredJobs]);

  // Overall Financial Totals
  const financialTotals = useMemo(() => {
    return (filteredJobs as any[]).reduce(
      (acc, j) => {
        const est = Number(j.grandTotal || j.estimatedCost || 0);
        const paid = Number(j.totalPaid || 0);
        const rem = Math.max(0, Number(j.remainingBalance ?? est - paid));
        acc.totalRevenue += est;
        acc.totalCollected += paid;
        acc.totalPending += rem;
        return acc;
      },
      { totalRevenue: 0, totalCollected: 0, totalPending: 0 }
    );
  }, [filteredJobs]);

  /** Map repair status → Badge variant */
  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'Received':
        return 'info';
      case 'Diagnosing':
      case 'Repair In Progress':
        return 'warning';
      case 'Ready for Pickup':
      case 'Delivered':
        return 'success';
      case 'Waiting Parts':
      case 'Waiting Customer Approval':
        return 'danger';
      case 'On Hold':
        return 'warning';
      case 'Cancelled':
      case 'Rejected':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const inputClass =
    'w-full pl-9 pr-4 py-2 border border-border rounded-lg bg-surface text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-focus-ring transition-colors hover:bg-surface-hover';

  const selectClass =
    'px-3 py-2 border border-border rounded-lg bg-surface text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-focus-ring transition-colors cursor-pointer hover:bg-surface-hover';

  // Status pills quick filters matching Figma Prototype
  const statusPills = [
    { label: 'All Jobs', value: '' },
    { label: 'Booked', value: 'Received' },
    { label: 'In Progress', value: 'Repair In Progress' },
    { label: 'Repaired', value: 'Ready for Pickup' },
    { label: 'Delivered', value: 'Delivered' },
    { label: 'On Hold', value: 'On Hold' },
  ];

  return (
    <div className="w-full h-auto">
      {/* =================================================================
          TOP NAVIGATION TABS: Figma Match (Repair Jobs & Lab Parts Audit)
         ================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-border">
        {/* Main Tabs */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('jobs')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'jobs'
              ? 'bg-primary text-text-inverse shadow-xs'
              : 'bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary border border-border'
              }`}
          >
            <Wrench className="w-4 h-4" />
            Repair Jobs &amp; Service Desk
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('parts_lab')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'parts_lab'
              ? 'bg-primary text-text-inverse shadow-xs'
              : 'bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary border border-border'
              }`}
          >
            <FlaskConical className="w-4 h-4" />
            Parts Consumption &amp; Lab Movement
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lab_cash_ledger')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'lab_cash_ledger'
              ? 'bg-primary text-text-inverse shadow-xs'
              : 'bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary border border-border'
              }`}
          >
            <DollarSign className="w-4 h-4" />
            Lab Cash Register &amp; Ledger
          </button>
        </div>

        {/* Right Section: Session Controls & Counter Badge */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Quick Cash Session Action Button */}
          {currentSession?.status === 'OPEN' ? (
            <button
              type="button"
              onClick={() => setIsCloseSessionModalOpen(true)}
              className="h-8 px-3 rounded-xl text-xs font-bold bg-danger/10 text-danger hover:bg-danger hover:text-white border border-danger/30 transition-all flex items-center gap-1.5 shadow-xs"
              title="Close active cash session"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Close Session</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsOpenSessionModalOpen(true)}
              className="h-8 px-3 rounded-xl text-xs font-bold bg-success text-white hover:bg-success-hover transition-all flex items-center gap-1.5 shadow-xs"
              title="Open a new cash session"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Open Session</span>
            </button>
          )}

          {/* Counter Badge */}
          <div className="flex items-center gap-2 text-xs bg-surface px-3 py-1.5 rounded-xl border border-border shadow-xs">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-text-secondary font-medium">Total Directory Jobs:</span>
            <span className="font-black text-text-primary tabular-nums">{jobs.length}</span>
          </div>
        </div>
      </div>

      {/* =================================================================
          TAB 2: PARTS CONSUMPTION & LAB MOVEMENT AUDIT WORKSPACE
         ================================================================= */}
      {activeTab === 'parts_lab' && (
        <PartsConsumptionLabTab
          jobs={jobs}
          branchMechanics={branchMechanics}
          currentUserId={currentUser?.id}
          isMechanicUser={isMechanicUser}
          currentUserShopId={currentBranchId}
        />
      )}

      {/* =================================================================
          TAB 3: LAB CASH REGISTER & MECHANIC LEDGER WORKSPACE
         ================================================================= */}
      {activeTab === 'lab_cash_ledger' && (
        <LabCashRegisterLedgerTab
          jobs={jobs}
          mechanicFilter={effectiveMechanicFilter}
        />
      )}

      {/* =================================================================
          TAB 1: REPAIR JOBS & SERVICE DESK (JOBS DIRECTORY & INTAKE FORM)
         ================================================================= */}
      {activeTab === 'jobs' && (
        <div className="flex flex-col lg:flex-row items-start gap-4 w-full h-auto">
          {/* =================================================================
              LEFT COLUMN: Repair Dashboard, Jobs Table & Mechanic Reports
             ================================================================= */}
          <div className={`w-full min-w-0 h-auto flex flex-col gap-4 ${hideBookingForm ? '' : 'lg:w-[65%]'}`}>

            {/* Figma-Styled Status Pills Bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {statusPills.map((pill) => {
                const isSelected = statusFilter === pill.value;
                return (
                  <button
                    key={pill.label}
                    type="button"
                    onClick={() => setStatusFilter(pill.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${isSelected
                      ? 'bg-primary text-text-inverse shadow-xs'
                      : 'bg-surface text-text-secondary hover:bg-surface-hover border border-border'
                      }`}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  icon: Clock,
                  label: 'Active Repairs',
                  value: filteredJobs.filter(
                    (j: any) =>
                      j.status === 'Repair In Progress' || j.status === 'Received' || j.status === 'Diagnosing'
                  ).length,
                  sub: `Total Jobs: ${filteredJobs.length}`,
                  variant: 'info' as const,
                },
                {
                  icon: CheckCircle,
                  label: 'Ready / Delivered',
                  value: filteredJobs.filter(
                    (j: any) => j.status === 'Ready for Pickup' || j.status === 'Delivered'
                  ).length,
                  sub: `Ready: ${filteredJobs.filter((j: any) => j.status === 'Ready for Pickup').length}`,
                  variant: 'success' as const,
                },
                {
                  icon: DollarSign,
                  label: 'Total Collected',
                  value: `Rs ${financialTotals.totalCollected.toLocaleString()}`,
                  sub: `Est: Rs ${financialTotals.totalRevenue.toLocaleString()}`,
                  variant: 'primary' as const,
                },
                {
                  icon: AlertCircle,
                  label: 'Pending Balance',
                  value: `Rs ${financialTotals.totalPending.toLocaleString()}`,
                  sub: `${filteredJobs.filter((j: any) => j.remainingBalance > 0).length} Unsettled Jobs`,
                  variant: 'danger' as const,
                },
              ].map(({ icon: Icon, label, value, sub, variant }) => (
                <div
                  key={label}
                  className="bg-surface p-3.5 rounded-xl border border-border shadow-card flex flex-col justify-between gap-1"
                >
                  <div className={`flex items-center gap-1.5 text-${variant}`}>
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="font-semibold text-xs text-text-secondary truncate">{label}</span>
                  </div>
                  <span className="text-lg sm:text-xl font-black text-text-primary tabular-nums truncate">
                    {isLoading ? '—' : value}
                  </span>
                  <span className="text-[10px] font-medium text-text-muted">{sub}</span>
                </div>
              ))}
            </div>

            {/* Toolbar: Search + Status Filter + Mechanic Filter + Export */}
            <div className="flex flex-col sm:flex-row gap-2.5 justify-between bg-surface p-3 rounded-xl border border-border shadow-card">
              <div className="flex flex-wrap sm:flex-nowrap gap-2 flex-1 min-w-0">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search Job ID, IMEI, Model, Customer…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <select
                  className={selectClass}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter by status"
                >
                  <option value="">All Statuses</option>
                  <option value="Received">Received</option>
                  <option value="Diagnosing">Diagnosing</option>
                  <option value="Repair In Progress">Repair In Progress</option>
                  <option value="Ready for Pickup">Ready for Pickup</option>
                  <option value="Delivered">Delivered</option>
                  <option value="On Hold">On Hold</option>
                </select>
                {isMechanicUser ? (
                  <div
                    className="inline-flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg bg-surface-hover text-sm text-text-secondary min-w-0"
                    aria-label="Mechanic view locked to your own jobs"
                  >
                    <Lock className="w-3.5 h-3.5 shrink-0 text-text-muted" />
                    <span className="truncate font-medium">My Jobs: {currentUser?.name}</span>
                  </div>
                ) : (
                  <select
                    className={selectClass}
                    value={mechanicFilter}
                    onChange={(e) => setMechanicFilter(e.target.value)}
                    aria-label="Filter by mechanic"
                  >
                    <option value="">All Mechanics</option>
                    {branchMechanics.map((staff) => (
                      <option key={staff._id || staff.id} value={staff._id || staff.id}>
                        {staff.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {isOrgAdmin && (
                <select
                  className={selectClass}
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  aria-label="Filter by branch"
                >
                  <option value="USE_GLOBAL_SWITCHER">
                    Current Scope: {activeShop ? activeShop.name : 'All Shops'}
                  </option>
                  <option value="ALL">All Branches (Consolidated)</option>
                  {branchList.map((b: any) => (
                    <option key={b.id || b._id} value={b.id || b._id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-border text-text-secondary rounded-lg hover:bg-surface-hover transition-colors text-xs font-semibold shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Print List
              </button>
            </div>

            {/* Repair Jobs Table */}
            <div className="bg-surface rounded-xl border border-border shadow-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-surface-hover/50 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                  Repair Jobs Directory ({filteredJobs.length})
                </span>
                <span className="text-[11px] text-text-muted">Click any job row to open full repair profile</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface-hover border-b border-border">
                    <tr>
                      {['Job ID', isOrgAdmin ? 'Branch' : null, 'Customer', 'Device', 'Mechanic', 'Status', 'Estimated / Bill', 'Balance', 'Actions']
                        .filter(Boolean)
                        .map((h, i) => {
                          const isNumeric = h === 'Estimated / Bill' || h === 'Balance';
                          const isCenter = h === 'Status' || h === 'Actions';
                          return (
                            <th
                              key={h as string}
                              scope="col"
                              className={`px-3 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider ${isNumeric ? 'text-right' : isCenter ? 'text-center' : ''
                                }`}
                            >
                              {h}
                            </th>
                          );
                        })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {isLoading ? (
                      <tr>
                        <td colSpan={isOrgAdmin ? 9 : 8} className="px-4 py-8 text-center text-text-muted">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                          Loading repair jobs…
                        </td>
                      </tr>
                    ) : filteredJobs.length === 0 ? (
                      <tr>
                        <td colSpan={isOrgAdmin ? 9 : 8} className="px-4 py-8 text-center text-text-muted">
                          No repair jobs match your search or filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredJobs.map((job: any) => {
                        const isJobActive =
                          job.status === 'Received' ||
                          job.status === 'Diagnosing' ||
                          job.status === 'Repair In Progress' ||
                          job.status === 'On Hold';

                        const jobBranchName = branchMap.get(job.branch_id || job.branchId) || 'Main Branch';

                        return (
                          <tr
                            key={job.id || job._id}
                            onClick={() => navigate(`/dashboard/repairs/${job.id || job._id}`)}
                            className="hover:bg-surface-hover/80 cursor-pointer transition-colors"
                          >
                            <td className="px-3 py-2.5 font-bold text-primary font-mono text-xs whitespace-nowrap">
                              {job.jobId}
                            </td>
                            {isOrgAdmin && (
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                                  {jobBranchName}
                                </span>
                              </td>
                            )}
                            <td className="px-3 py-2.5">
                              <div className="font-semibold text-text-primary text-xs">
                                {job.customerId?.name || 'Walk-in Customer'}
                              </div>
                              <div className="text-text-muted text-[10px]">
                                {job.customerId?.contactPerson || job.customer_phone || '—'}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-medium text-text-primary text-xs">
                                {job.device?.brand} {job.device?.model}
                              </div>
                              <div className="text-text-muted text-[10px] font-mono">
                                {job.device?.imei || 'No IMEI'}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary text-xs">
                              {job.technicianId?.name ? (
                                <span className="font-medium text-text-primary">{job.technicianId.name}</span>
                              ) : (
                                <span className="text-text-muted text-[11px]">Desk</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                              <Badge variant={getStatusVariant(job.status)} size="sm" dot>
                                {job.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-text-secondary text-xs tabular-nums whitespace-nowrap">
                              Rs {(job.grandTotal || job.estimatedCost || 0).toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-xs tabular-nums whitespace-nowrap">
                              <span className={job.remainingBalance > 0 ? 'text-warning' : 'text-success'}>
                                Rs {(job.remainingBalance ?? 0).toLocaleString()}
                              </span>
                            </td>
                            <td
                              className="px-3 py-2.5 text-center whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {isJobActive ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditingJob(job)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-primary/10 text-primary hover:bg-primary hover:text-white border border-primary/30 transition-all shadow-xs"
                                    title="View and refill job form for editing"
                                  >
                                    <Edit className="w-3 h-3" />
                                    <span>Details</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSettlementJob(job)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-success text-white hover:bg-success-hover transition-all shadow-xs"
                                    title="Complete repair with Lab Cash Register settlement & commission calculation"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Done Job</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTransferringJob(job);
                                      setTransferTargetBranchId(job.branch_id || job.branchId || '');
                                      setTransferTargetTechId(job.technician_id || (job.technicianId as any)?._id || (job.technicianId as any)?.id || '');
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white border border-amber-500/30 transition-all shadow-xs"
                                    title="Transfer job between branches or mechanics"
                                  >
                                    <ArrowRightLeft className="w-3 h-3" />
                                    <span>Transfer</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={updateStatusMutation.isPending}
                                    onClick={() =>
                                      updateStatusMutation.mutate({
                                        jobId: job.id || job._id,
                                        newStatus: 'Rejected',
                                        note: 'Returned without fix upon customer / lab inspection',
                                      })
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-danger/10 text-danger hover:bg-danger hover:text-white border border-danger/30 transition-all shadow-xs"
                                    title="Return device without fix"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Return</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={deleteRepairMutation.isPending}
                                    onClick={() => {
                                      if (window.confirm(`Are you sure you want to permanently delete repair job ${job.jobId}?`)) {
                                        deleteRepairMutation.mutate(job.id || job._id);
                                      }
                                    }}
                                    className="inline-flex items-center p-1 rounded-md text-[10px] font-bold text-text-muted hover:text-danger hover:bg-danger/10 transition-all"
                                    title="Delete repair job"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className="text-[10px] font-medium text-text-muted">Settled</span>
                                  <button
                                    type="button"
                                    onClick={() => setEditingJob(job)}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-primary hover:underline"
                                    title="View job details"
                                  >
                                    Details
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mechanic Accounting, Total Jobs & Reports Section */}
            <div className="bg-surface rounded-xl border border-border shadow-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-surface-hover/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
                    Mechanic Accounting, Total Jobs &amp; Reports
                  </span>
                </div>
                <span className="text-[11px] text-text-muted">Per-technician workload &amp; revenue breakdown</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-hover border-b border-border text-[10px] uppercase text-text-muted font-semibold">
                    <tr>
                      <th className="px-4 py-2">Mechanic / Technician</th>
                      <th className="px-4 py-2 text-center">Total Jobs</th>
                      <th className="px-4 py-2 text-center">Active</th>
                      <th className="px-4 py-2 text-center">Completed</th>
                      <th className="px-4 py-2 text-right">Total Billed</th>
                      <th className="px-4 py-2 text-right">Collected</th>
                      <th className="px-4 py-2 text-right">Pending Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {mechanicReports.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-text-muted">
                          No mechanic accounting data to display yet.
                        </td>
                      </tr>
                    ) : (
                      mechanicReports.map((m) => (
                        <tr key={m.id} className="hover:bg-surface-hover/60 transition-colors">
                          <td className="px-4 py-2.5 font-bold text-text-primary">{m.name}</td>
                          <td className="px-4 py-2.5 text-center font-black tabular-nums">{m.totalJobs}</td>
                          <td className="px-4 py-2.5 text-center text-info font-semibold tabular-nums">
                            {m.activeJobs}
                          </td>
                          <td className="px-4 py-2.5 text-center text-success font-semibold tabular-nums">
                            {m.completedJobs}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                            Rs {m.totalEstimated.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-success tabular-nums">
                            Rs {m.totalCollected.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-warning tabular-nums">
                            Rs {m.totalPending.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* =================================================================
              RIGHT COLUMN (35%): Permanent Mobile Job Add / Edit Form
             ================================================================= */}
          {!hideBookingForm && (
            <div className="w-full lg:w-[35%] h-auto shrink-0">
              <RepairFormDrawer
                embedded
                editingJob={editingJob}
                onClearEditing={() => setEditingJob(null)}
              />
            </div>
          )}

        </div>
      )}
      {/* Done Job Settlement & Lab Cash Intake Modal */}
      {settlementJob && (
        <DoneJobSettlementModal
          job={settlementJob}
          isOpen={Boolean(settlementJob)}
          onClose={() => setSettlementJob(null)}
          onConfirm={(payload) =>
            finishRepairMutation.mutate({
              jobId: settlementJob.id || settlementJob._id,
              ...payload,
            })
          }
          isPending={finishRepairMutation.isPending}
        />
      )}

      {/* Transfer Repair Job Modal */}
      {transferringJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-modal overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5" />
                <div>
                  <h3 className="text-sm font-bold">Transfer Repair Job</h3>
                  <p className="text-[11px] opacity-90">{transferringJob.jobId} • {transferringJob.device?.brand} {transferringJob.device?.model}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTransferringJob(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!transferTargetBranchId) {
                  toast.error('Please select destination branch');
                  return;
                }
                transferRepairMutation.mutate({
                  jobId: transferringJob.id || transferringJob._id,
                  targetBranchId: transferTargetBranchId,
                  targetTechnicianId: transferTargetTechId || null,
                  reason: transferReason,
                });
              }}
              className="p-5 space-y-3.5 text-xs text-text-primary"
            >
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                  Destination Branch *
                </label>
                <select
                  value={transferTargetBranchId}
                  onChange={(e) => {
                    setTransferTargetBranchId(e.target.value);
                    setTransferTargetTechId('');
                  }}
                  className="w-full h-8 px-2.5 rounded-lg bg-background border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
                  required
                >
                  <option value="">Select Branch</option>
                  {branchList.map((b: any) => (
                    <option key={b.id || b._id} value={b.id || b._id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                  Destination Mechanic / Technician
                </label>
                <select
                  value={transferTargetTechId}
                  onChange={(e) => setTransferTargetTechId(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg bg-background border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="">Unassigned / Desk</option>
                  {staffList
                    .filter((s: any) => {
                      const roleKey = `${s.roleId || ''} ${s.roleName || ''}`.toUpperCase();
                      const isMechanic = roleKey.includes('MECHANIC');
                      const matchBranch = transferTargetBranchId ? s.branchId === transferTargetBranchId : true;
                      return isMechanic && matchBranch;
                    })
                    .map((s: any) => (
                      <option key={s._id || s.id} value={s._id || s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                  Reason for Transfer (Optional)
                </label>
                <textarea
                  rows={2}
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="e.g. Specialized micro-soldering / technician workload..."
                  className="w-full p-2 rounded-lg bg-background border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setTransferringJob(null)}
                  disabled={transferRepairMutation.isPending}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface border border-border text-text-secondary hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transferRepairMutation.isPending}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>{transferRepairMutation.isPending ? 'Transferring…' : 'Confirm Transfer'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Cash Session Modals */}
      <CashSessionOpenModal
        isOpen={isOpenSessionModalOpen}
        onClose={() => setIsOpenSessionModalOpen(false)}
      />
      <CashSessionCloseModal
        isOpen={isCloseSessionModalOpen}
        onClose={() => setIsCloseSessionModalOpen(false)}
      />
    </div>
  );
};
