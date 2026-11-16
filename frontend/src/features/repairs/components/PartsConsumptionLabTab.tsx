import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Search,
  Filter,
  Printer,
  FileSpreadsheet,
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowRightLeft,
  User,
  FlaskConical,
} from 'lucide-react';
import { format, isWithinInterval, startOfDay, endOfDay, subDays } from 'date-fns';
import { Badge } from '@/components/ui';
import type { RepairJob, PartUsed } from '../types/repair.types';

export type LabPartStatus =
  | 'INSTALLED_IN_JOB'
  | 'TESTING_IN_LAB'
  | 'RETURNED_TO_STOCK'
  | 'DEFECTIVE_REPLACED';

export type PartSourceLevel = 'ALL' | 'OWN_STOCK' | 'MARKET_PURCHASE';

export interface LabAuditItem {
  id: string;
  jobId: string;
  jobUuid: string;
  partName: string;
  partSku: string;
  quantity: number;
  cost: number;
  price: number;
  sourceLevel: 'OWN_STOCK' | 'MARKET_PURCHASE';
  mechanicId: string;
  mechanicName: string;
  branchId: string;
  status: LabPartStatus;
  date: string; // ISO date string
  deviceInfo: string;
  customerName: string;
  resolutionNote?: string;
}

interface PartsConsumptionLabTabProps {
  jobs: RepairJob[];
  branchMechanics: Array<{ id?: string; _id?: string; name: string }>;
  currentUserId?: string;
  isMechanicUser: boolean;
  currentUserShopId?: string | null;
}

export const PartsConsumptionLabTab: React.FC<PartsConsumptionLabTabProps> = ({
  jobs,
  branchMechanics,
  currentUserId,
  isMechanicUser,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<'today' | 'weekly' | 'monthly' | 'all'>('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedMechanic, setSelectedMechanic] = useState<string>(
    isMechanicUser && currentUserId ? currentUserId : ''
  );
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceLevel, setSourceLevel] = useState<PartSourceLevel>('ALL');

  // Enforce role scoping: mechanic can only see their own records
  const effectiveMechanic = isMechanicUser ? currentUserId || '' : selectedMechanic;

  // Derive all lab movement and parts consumption records from jobs data
  const allAuditItems: LabAuditItem[] = useMemo(() => {
    const list: LabAuditItem[] = [];

    jobs.forEach((job) => {
      const mechId =
        typeof job.technicianId === 'object'
          ? job.technicianId?._id || job.technicianId?.id || ''
          : job.technicianId || '';
      const mechName =
        typeof job.technicianId === 'object'
          ? job.technicianId?.name || 'Unassigned / Counter'
          : 'Unassigned / Counter';
      const custName =
        typeof job.customerId === 'object'
          ? job.customerId?.name || 'Walk-in Customer'
          : 'Walk-in Customer';
      const device = `${job.device?.brand || ''} ${job.device?.model || ''}`.trim() || 'Mobile Device';

      // Parse parts used in this repair job
      if (Array.isArray(job.partsUsed)) {
        (job.partsUsed as PartUsed[]).forEach((part: PartUsed, idx: number) => {
          const hasCatalogProduct = Boolean(
            (part.productId && typeof part.productId === 'object' && (part.productId as any)._id) ||
            (typeof part.productId === 'string' && (part.productId as string).length > 0)
          );

          const partName =
            typeof part.productId === 'object' && part.productId
              ? part.productId.name
              : (part as any).productName || `Replacement Part #${idx + 1}`;
          const partSku =
            typeof part.productId === 'object' && part.productId ? part.productId.sku : 'MARKET';

          // Determine audit status based on job status & part flags
          let status: LabPartStatus = 'INSTALLED_IN_JOB';
          if (job.status === 'Diagnosing' || job.status === 'Repair In Progress') {
            status = 'TESTING_IN_LAB';
          } else if (job.status === 'Delivered' || job.status === 'Ready for Pickup') {
            status = 'INSTALLED_IN_JOB';
          } else if (job.status === 'Cancelled' || job.status === 'Rejected') {
            status = 'RETURNED_TO_STOCK';
          }

          list.push({
            id: `${job.id || job._id}-part-${part._id || idx}`,
            jobId: job.jobId || 'N/A',
            jobUuid: job.id || job._id,
            partName,
            partSku,
            quantity: part.qty || 1,
            cost: Number(part.cost || 0),
            price: Number(part.price || 0),
            sourceLevel: hasCatalogProduct ? 'OWN_STOCK' : 'MARKET_PURCHASE',
            mechanicId: mechId,
            mechanicName: mechName,
            branchId: job.branch_id || job.branchId || '',
            status,
            date: part.addedAt || job.createdAt || new Date().toISOString(),
            deviceInfo: device,
            customerName: custName,
          });
        });
      }
    });

    return list;
  }, [jobs]);

  // Filter items based on Date Range, Mechanic, Status, and Search query
  const filteredItems = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    return allAuditItems.filter((item) => {
      // 1. Mechanic filter
      if (effectiveMechanic && item.mechanicId !== effectiveMechanic) {
        return false;
      }

      // 2. Status filter
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }

      // 3. Date range filter
      const itemDate = new Date(item.date);
      if (dateRange === 'today') {
        if (!isWithinInterval(itemDate, { start: todayStart, end: todayEnd })) {
          return false;
        }
      } else if (dateRange === 'weekly') {
        const weekAgo = subDays(todayStart, 7);
        if (!isWithinInterval(itemDate, { start: weekAgo, end: todayEnd })) {
          return false;
        }
      } else if (dateRange === 'monthly') {
        const monthAgo = subDays(todayStart, 30);
        if (!isWithinInterval(itemDate, { start: monthAgo, end: todayEnd })) {
          return false;
        }
      } else if (dateRange === 'all' && customStartDate && customEndDate) {
        const start = startOfDay(new Date(customStartDate));
        const end = endOfDay(new Date(customEndDate));
        if (!isWithinInterval(itemDate, { start, end })) {
          return false;
        }
      }

      // 3b. Source Level filter (Own Stock vs Market Purchase)
      if (sourceLevel !== 'ALL' && item.sourceLevel !== sourceLevel) {
        return false;
      }

      // 4. Quick search filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches =
          item.partName.toLowerCase().includes(q) ||
          item.partSku.toLowerCase().includes(q) ||
          item.jobId.toLowerCase().includes(q) ||
          item.mechanicName.toLowerCase().includes(q) ||
          item.deviceInfo.toLowerCase().includes(q) ||
          item.customerName.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [allAuditItems, effectiveMechanic, statusFilter, dateRange, customStartDate, customEndDate, searchTerm]);

  // Aggregate KPI stats for the filtered parts
  const stats = useMemo(() => {
    let testingInLab = 0;
    let installed = 0;
    let returned = 0;
    let defective = 0;
    let totalValue = 0;
    let ownStockCount = 0;
    let marketPurchaseCount = 0;

    filteredItems.forEach((item) => {
      const val = item.price * item.quantity;
      totalValue += val;
      if (item.sourceLevel === 'OWN_STOCK') ownStockCount += item.quantity;
      if (item.sourceLevel === 'MARKET_PURCHASE') marketPurchaseCount += item.quantity;
      if (item.status === 'TESTING_IN_LAB') testingInLab += item.quantity;
      if (item.status === 'INSTALLED_IN_JOB') installed += item.quantity;
      if (item.status === 'RETURNED_TO_STOCK') returned += item.quantity;
      if (item.status === 'DEFECTIVE_REPLACED') defective += item.quantity;
    });

    return {
      totalCount: filteredItems.length,
      testingInLab,
      installed,
      returned,
      defective,
      totalValue,
      ownStockCount,
      marketPurchaseCount,
    };
  }, [filteredItems]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (filteredItems.length === 0) return;
    const headers = [
      'Job ID',
      'Date',
      'Part Name',
      'SKU',
      'Qty',
      'Status',
      'Mechanic',
      'Device',
      'Customer',
      'Total Price',
    ];
    const rows = filteredItems.map((item) => [
      item.jobId,
      format(new Date(item.date), 'yyyy-MM-dd HH:mm'),
      `"${item.partName.replace(/"/g, '""')}"`,
      item.partSku,
      item.quantity,
      item.status,
      `"${item.mechanicName.replace(/"/g, '""')}"`,
      `"${item.deviceInfo.replace(/"/g, '""')}"`,
      `"${item.customerName.replace(/"/g, '""')}"`,
      item.price * item.quantity,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `parts-lab-audit-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderStatusBadge = (status: LabPartStatus) => {
    switch (status) {
      case 'TESTING_IN_LAB':
        return (
          <Badge variant="warning" size="sm" dot>
            Testing in Lab
          </Badge>
        );
      case 'INSTALLED_IN_JOB':
        return (
          <Badge variant="success" size="sm" dot>
            Installed in Job
          </Badge>
        );
      case 'RETURNED_TO_STOCK':
        return (
          <Badge variant="info" size="sm" dot>
            Returned to Stock
          </Badge>
        );
      case 'DEFECTIVE_REPLACED':
        return (
          <Badge variant="danger" size="sm" dot>
            Defective / Replaced
          </Badge>
        );
      default:
        return <Badge size="sm">{status}</Badge>;
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Two-Level Source Switcher (Own Stock vs Open Market) */}
      <div className="flex flex-wrap items-center gap-2 p-2 bg-surface border border-border rounded-xl shadow-xs">
        <span className="text-xs font-bold text-text-secondary px-2">Parts Origin / Sourcing:</span>
        <button
          type="button"
          onClick={() => setSourceLevel('ALL')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
            sourceLevel === 'ALL'
              ? 'bg-primary text-text-inverse shadow-xs'
              : 'bg-surface-hover text-text-secondary hover:text-text-primary'
          }`}
        >
          All Sourced Parts ({allAuditItems.length})
        </button>
        <button
          type="button"
          onClick={() => setSourceLevel('OWN_STOCK')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            sourceLevel === 'OWN_STOCK'
              ? 'bg-primary text-text-inverse shadow-xs'
              : 'bg-surface-hover text-primary hover:bg-primary/10 border border-primary/20'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Level 1: Own Branch Stock ({allAuditItems.filter((i) => i.sourceLevel === 'OWN_STOCK').length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSourceLevel('MARKET_PURCHASE')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            sourceLevel === 'MARKET_PURCHASE'
              ? 'bg-warning text-text-inverse shadow-xs'
              : 'bg-surface-hover text-warning hover:bg-warning/10 border border-warning/20'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Level 2: Open Market Purchases ({allAuditItems.filter((i) => i.sourceLevel === 'MARKET_PURCHASE').length})</span>
        </button>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-surface p-3.5 rounded-xl border border-border shadow-card flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-warning">
            <FlaskConical className="w-4 h-4 shrink-0" />
            <span className="font-semibold text-xs text-text-secondary truncate">Testing In Lab</span>
          </div>
          <span className="text-xl font-black text-text-primary tabular-nums mt-1">{stats.testingInLab}</span>
          <span className="text-[10px] text-text-muted">On hold for repair</span>
        </div>

        <div className="bg-surface p-3.5 rounded-xl border border-border shadow-card flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-success">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-semibold text-xs text-text-secondary truncate">Installed in Jobs</span>
          </div>
          <span className="text-xl font-black text-text-primary tabular-nums mt-1">{stats.installed}</span>
          <span className="text-[10px] text-text-muted">Completed repairs</span>
        </div>

        <div className="bg-surface p-3.5 rounded-xl border border-border shadow-card flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-info">
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span className="font-semibold text-xs text-text-secondary truncate">Returned to Stock</span>
          </div>
          <span className="text-xl font-black text-text-primary tabular-nums mt-1">{stats.returned}</span>
          <span className="text-[10px] text-text-muted">Safe stock restored</span>
        </div>

        <div className="bg-surface p-3.5 rounded-xl border border-border shadow-card flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-danger">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-semibold text-xs text-text-secondary truncate">Defective / Replaced</span>
          </div>
          <span className="text-xl font-black text-text-primary tabular-nums mt-1">{stats.defective}</span>
          <span className="text-[10px] text-text-muted">Claimed / Replaced</span>
        </div>

        <div className="bg-surface p-3.5 rounded-xl border border-border shadow-card flex flex-col justify-between col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-primary">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="font-semibold text-xs text-text-secondary truncate">Total Parts Billed</span>
          </div>
          <span className="text-xl font-black text-primary tabular-nums mt-1">
            Rs {stats.totalValue.toLocaleString()}
          </span>
          <span className="text-[10px] text-text-muted">{filteredItems.length} line items</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-surface p-3 rounded-xl border border-border shadow-card flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        {/* Left Filter Controls */}
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Quick Search */}
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search part, job ID, SKU, mechanic..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-border rounded-lg bg-surface text-xs text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
          </div>

          {/* Date Range Selector */}
          <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-surface-hover/50 text-xs">
            <button
              type="button"
              onClick={() => setDateRange('today')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                dateRange === 'today'
                  ? 'bg-primary text-text-inverse shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDateRange('weekly')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                dateRange === 'weekly'
                  ? 'bg-primary text-text-inverse shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Weekly
            </button>
            <button
              type="button"
              onClick={() => setDateRange('monthly')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                dateRange === 'monthly'
                  ? 'bg-primary text-text-inverse shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setDateRange('all')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                dateRange === 'all'
                  ? 'bg-primary text-text-inverse shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              All / Custom
            </button>
          </div>

          {/* Custom Date Pickers (if all selected) */}
          {dateRange === 'all' && (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2 py-1 border border-border rounded-lg bg-surface text-xs text-text-primary"
                aria-label="Start Date"
              />
              <span className="text-text-muted text-xs">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2 py-1 border border-border rounded-lg bg-surface text-xs text-text-primary"
                aria-label="End Date"
              />
            </div>
          )}

          {/* Mechanic Selector (Filtered by branch; locked for mechanics) */}
          {isMechanicUser ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg bg-surface-hover text-xs text-text-secondary">
              <User className="w-3.5 h-3.5 text-text-muted" />
              <span className="font-semibold">My Lab Parts</span>
            </div>
          ) : (
            <select
              value={selectedMechanic}
              onChange={(e) => setSelectedMechanic(e.target.value)}
              className="px-3 py-1.5 border border-border rounded-lg bg-surface text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-focus-ring cursor-pointer hover:bg-surface-hover"
              aria-label="Filter by mechanic"
            >
              <option value="">All Branch Mechanics</option>
              {branchMechanics.map((mech) => (
                <option key={mech.id || mech._id} value={mech.id || mech._id}>
                  {mech.name}
                </option>
              ))}
            </select>
          )}

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-lg bg-surface text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-focus-ring cursor-pointer hover:bg-surface-hover"
            aria-label="Filter by audit status"
          >
            <option value="all">All Statuses</option>
            <option value="TESTING_IN_LAB">Testing in Lab</option>
            <option value="INSTALLED_IN_JOB">Installed in Job</option>
            <option value="RETURNED_TO_STOCK">Returned to Stock</option>
            <option value="DEFECTIVE_REPLACED">Defective / Replaced</option>
          </select>
        </div>

        {/* Action Buttons: Print & CSV Export */}
        <div className="flex items-center gap-2 self-end lg:self-auto shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg bg-surface hover:bg-surface-hover text-xs font-semibold text-text-secondary transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Sheet
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-text-inverse rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Main Audit Data Table */}
      <div className="bg-surface rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-surface-hover/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
              Parts Movement &amp; Accountability Ledger ({filteredItems.length})
            </span>
          </div>
          <span className="text-[11px] text-text-muted">
            Tracking parts intake to lab, mechanic demand, job status, and returns
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-hover border-b border-border text-[10px] uppercase text-text-muted font-semibold">
              <tr>
                <th className="px-3 py-2.5">Date / Time</th>
                <th className="px-3 py-2.5">Job ID</th>
                <th className="px-3 py-2.5">Part Details &amp; SKU</th>
                <th className="px-3 py-2.5 text-center">Origin</th>
                <th className="px-3 py-2.5 text-center">Qty</th>
                <th className="px-3 py-2.5">Demand Mechanic</th>
                <th className="px-3 py-2.5">Target Device</th>
                <th className="px-3 py-2.5 text-center">Audit Status</th>
                <th className="px-3 py-2.5 text-right">Cost</th>
                <th className="px-3 py-2.5 text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-text-muted">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-semibold text-sm">No parts consumption or lab movement records found.</p>
                    <p className="text-xs mt-0.5">
                      Adjust your date filters or add replacement parts to ongoing repairs.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-hover/60 transition-colors">
                    <td className="px-3 py-2.5 text-text-secondary font-mono text-[11px] whitespace-nowrap">
                      {format(new Date(item.date), 'dd MMM yyyy, HH:mm')}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-primary font-mono whitespace-nowrap">
                      {item.jobId}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-text-primary">{item.partName}</div>
                      <div className="text-[10px] text-text-muted font-mono">{item.partSku}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          item.sourceLevel === 'OWN_STOCK'
                            ? 'bg-primary/15 text-primary border border-primary/30'
                            : 'bg-warning/15 text-warning border border-warning/30'
                        }`}
                      >
                        {item.sourceLevel === 'OWN_STOCK' ? 'Own Stock' : 'Market'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-black tabular-nums">{item.quantity}</td>
                    <td className="px-3 py-2.5 font-medium text-text-primary whitespace-nowrap">
                      {item.mechanicName}
                    </td>
                    <td className="px-3 py-2.5 text-text-secondary whitespace-nowrap">
                      <div>{item.deviceInfo}</div>
                      <div className="text-[10px] text-text-muted">{item.customerName}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      {renderStatusBadge(item.status)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-text-muted tabular-nums">
                      Rs {item.cost.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-text-primary tabular-nums">
                      Rs {(item.price * item.quantity).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
