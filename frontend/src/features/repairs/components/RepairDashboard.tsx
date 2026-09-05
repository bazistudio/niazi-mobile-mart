'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { repairApi } from '../services/repair.api';
import { Search, Download, Plus, Wrench, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RepairFormDrawer } from './modals/RepairFormDrawer';
import { format } from 'date-fns';
import { Badge } from '@/components/ui';
import type { BadgeProps } from '@/components/ui';

export const RepairDashboard = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const { data: response, isLoading } = useQuery({
    queryKey: ['repairs', statusFilter, searchTerm],
    queryFn: () => repairApi.getRepairJobs({ status: statusFilter, search: searchTerm }),
  });

  const jobs = response?.data || [];

  /** Map repair status → Badge variant */
  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'Received': return 'info';
      case 'Diagnosing': return 'warning';
      case 'Repair In Progress': return 'warning';
      case 'Ready for Pickup': return 'success';
      case 'Delivered': return 'neutral';
      case 'Cancelled': return 'danger';
      default: return 'primary';
    }
  };

  /** Map priority → Badge variant */
  const getPriorityVariant = (priority: string): BadgeProps['variant'] => {
    switch (priority) {
      case 'Urgent': return 'danger';
      case 'High': return 'warning';
      case 'Low': return 'neutral';
      default: return 'info';
    }
  };

  const inputClass =
    'w-full pl-9 pr-4 py-2 border border-border rounded-lg bg-surface text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-focus-ring transition-colors hover:bg-surface-hover';

  const selectClass =
    'px-3 py-2 border border-border rounded-lg bg-surface text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-focus-ring transition-colors cursor-pointer hover:bg-surface-hover';

  return (
    <div className="flex flex-col gap-6 sm:gap-8 w-full max-w-7xl mx-auto pb-12">

      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="h-6 w-6 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">Repair Jobs</h1>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Manage customer repairs, devices, and service workflows.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover active:bg-primary-active text-white rounded-lg font-medium transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Repair Job</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Clock, label: 'Active Repairs', value: jobs.filter((j: any) => j.status === 'Repair In Progress').length, variant: 'info' as const },
          { icon: CheckCircle, label: 'Ready for Pickup', value: jobs.filter((j: any) => j.status === 'Ready for Pickup').length, variant: 'success' as const },
          { icon: CheckCircle, label: 'Delivered Today', value: jobs.filter((j: any) => j.status === 'Delivered').length, variant: 'primary' as const },
          { icon: AlertCircle, label: 'Pending Payments', value: jobs.filter((j: any) => j.remainingBalance > 0).length, variant: 'danger' as const },
        ].map(({ icon: Icon, label, value, variant }) => (
          <div key={label} className="bg-surface p-4 rounded-xl border border-border shadow-card flex flex-col gap-2">
            <div className={`flex items-center gap-2 text-${variant}`}>
              <Icon className="w-4 h-4" />
              <span className="font-semibold text-xs text-text-secondary">{label}</span>
            </div>
            <span className="text-2xl font-black text-text-primary tabular-nums">
              {isLoading ? '—' : value}
            </span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between bg-surface p-4 rounded-xl border border-border shadow-card">
        <div className="flex gap-3 flex-1 min-w-0">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search ID, IMEI, Model…"
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
          </select>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 border border-border text-text-secondary rounded-lg hover:bg-surface-hover transition-colors text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-hover border-b border-border">
              <tr>
                {['Job ID', 'Customer', 'Device', 'Priority', 'Status', 'Estimated', 'Remaining'].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider ${
                      i >= 5 ? 'text-right' : i === 3 || i === 4 ? 'text-center' : ''
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-text-muted">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      <span className="text-sm">Loading repair jobs…</span>
                    </div>
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-text-muted">
                      <Wrench className="w-8 h-8 opacity-30" />
                      <span className="text-sm">No repair jobs found.</span>
                      <span className="text-xs opacity-60">Try adjusting your filters or add a new job.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                jobs.map((job: any) => (
                  <tr
                    key={job.id}
                    className="hover:bg-surface-hover transition-colors cursor-pointer group focus-within:bg-surface-hover"
                    onClick={() => navigate(`/dashboard/shop-admin/repairs/${job.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/dashboard/shop-admin/repairs/${job.id}`)}
                    tabIndex={0}
                    role="button"
                  >
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-primary text-sm">{job.jobId}</div>
                      <div className="text-xs text-text-muted">{format(new Date(job.createdAt), 'dd MMM yyyy')}</div>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-text-primary">
                      {job.customerId?.name || job.customerId?.contactPerson || 'Unknown'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-text-primary">{job.device.brand} {job.device.model}</div>
                      <div className="text-xs text-text-muted font-mono">{job.device.imei}</div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <Badge variant={getPriorityVariant(job.priority)} size="sm">{job.priority}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <Badge variant={getStatusVariant(job.status)} size="sm" dot>{job.status}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-text-secondary tabular-nums">
                      Rs {job.estimatedCost.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold tabular-nums">
                      <span className={job.remainingBalance > 0 ? 'text-warning' : 'text-success'}>
                        Rs {job.remainingBalance.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RepairFormDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  );
};
