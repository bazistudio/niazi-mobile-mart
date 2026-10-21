import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import {
  Smartphone,
  Layers,
  Store,
  DollarSign,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Building2,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Tag,
  Boxes,
  ArrowUpDown,
  SlidersHorizontal,
  Eye,
} from 'lucide-react';
import { Button, Badge, Card } from '@/components/ui';
import {
  mobileApi,
  mapDeviceRowToItem,
  type MobileOrganizationSummary,
  type MobileBranchSummaryItem,
} from '@/features/mobiles/services/mobile.api';
import type { MobileInventoryItem, MobileCondition } from '@/features/mobiles/types/mobile.types';
import { MobileDetailModal } from '@/features/mobiles/components/MobileDetailModal';
import { EditMobileModal } from '@/features/mobiles/components/EditMobileModal';
import { buildUsedMobileA4Html, buildUsedMobilePdfFilename } from '@/features/mobiles/templates/usedMobileA4Template';
import { usePrintStore } from '@/lib/printer/print.store';
import { downloadHtmlAsPdf } from '@/lib/printer/pdfExport';

export function OrganizationMobileInventoryPage() {
  const navigate = useNavigate();

  // Data states
  const [summary, setSummary] = useState<MobileOrganizationSummary | null>(null);
  const [devices, setDevices] = useState<MobileInventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filter states
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [conditionFilter, setConditionFilter] = useState<'ALL' | MobileCondition>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [editDeviceId, setEditDeviceId] = useState<string | null>(null);
  const openPrintPreview = usePrintStore((s) => s.openPreview);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const handlePrint = useCallback((profile: Parameters<typeof buildUsedMobileA4Html>[0]) => {
    const html = buildUsedMobileA4Html(profile);
    openPrintPreview({
      html,
      documentType: 'Generic',
      referenceId: profile.device.id,
      title: `Purchase Receipt — Sr No ${profile.paperwork?.voucher_no ?? profile.device.id.slice(0, 8)}`,
    });
  }, [openPrintPreview]);

  const handleDownloadPdf = useCallback(async (profile: Parameters<typeof buildUsedMobileA4Html>[0]) => {
    setPdfError(null);
    try {
      const html = buildUsedMobileA4Html(profile);
      const filename = buildUsedMobilePdfFilename(profile);
      await downloadHtmlAsPdf(html, filename);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF generation failed');
    }
  }, []);

  // Fetch summary and consolidated devices
  const loadInventoryData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      // 1. Fetch organization summary with per-branch breakdown
      const summaryRes = await mobileApi.getOrganizationSummary();
      setSummary(summaryRes.summary);

      // 2. Fetch consolidated devices across all branches (no branch_id = org-wide for admin)
      const devicesRes = await mobileApi.getMobiles({
        limit: 200,
      });

      const mapped = (devicesRes.devices || []).map(mapDeviceRowToItem);
      setDevices(mapped);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve organization mobile inventory';
      setLoadError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInventoryData();
  }, [loadInventoryData]);

  // Mask IMEI helper for safe display (e.g. 1234******56789)
  const maskImei = (imei?: string | null): string => {
    if (!imei || imei.length < 8) return imei || 'N/A';
    return `${imei.slice(0, 4)}******${imei.slice(-4)}`;
  };

  // Branch map for fast lookup
  const branchMap = useMemo(() => {
    const map = new Map<string, MobileBranchSummaryItem>();
    if (summary?.branches) {
      summary.branches.forEach((b) => map.set(b.branch_id, b));
    }
    return map;
  }, [summary]);

  // Filtered devices based on controls
  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      // Branch filter
      if (selectedBranchId !== 'all' && device.branch !== selectedBranchId) {
        return false;
      }
      // Condition filter
      if (conditionFilter !== 'ALL' && device.condition !== conditionFilter) {
        return false;
      }
      // Status filter
      if (statusFilter !== 'ALL' && device.status !== statusFilter) {
        return false;
      }
      // Search query (brand, model, IMEI, branch name)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const brandMatch = device.brand.toLowerCase().includes(q);
        const modelMatch = device.model.toLowerCase().includes(q);
        const imeiMatch = device.imei1.includes(q);
        const branchMatch = (device.branchName || '').toLowerCase().includes(q);
        const branchCodeMatch = (device.branchCode || '').toLowerCase().includes(q);
        return brandMatch || modelMatch || imeiMatch || branchMatch || branchCodeMatch;
      }
      return true;
    });
  }, [devices, selectedBranchId, conditionFilter, statusFilter, searchQuery]);

  // Metrics from summary
  const totalDevices = summary?.total_devices ?? 0;
  const newCount = summary?.new_count ?? 0;
  const usedCount = summary?.used_count ?? 0;
  const inStockCount = summary?.in_stock_count ?? 0;
  const inspectionCount = summary?.inspection_count ?? 0;
  const soldCount = summary?.sold_count ?? 0;
  const totalValuation = summary?.total_valuation ?? 0;
  const newValuation = summary?.new_valuation ?? 0;
  const usedValuation = summary?.used_valuation ?? 0;
  const branches = summary?.branches ?? [];

  // Filtered list valuation
  const filteredValuation = useMemo(() => {
    return filteredDevices
      .filter((d) => d.status === 'IN_STOCK')
      .reduce((sum, d) => sum + d.purchaseCost, 0);
  }, [filteredDevices]);

  return (
    <>
    <OrganizationPageShell
      title="Mobile Inventory"
      description="Consolidated serialized smartphone inventory, branch breakdown, and valuation across all organization locations."
      badge="Organization Admin"
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={loadInventoryData}
            disabled={isLoading}
            className="cursor-pointer"
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<ExternalLink className="w-3.5 h-3.5" />}
            onClick={() => navigate('/dashboard/shop-admin/mobiles')}
            className="cursor-pointer"
            title="Open Branch Mobile Management"
          >
            Branch Management
          </Button>
        </div>
      }
    >
      {/* ── Error Banner ──────────────────────────────────────────────────────── */}
      {loadError && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-start justify-between gap-3 text-red-800 dark:text-red-300 text-sm">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-semibold">Unable to Load Organization Inventory</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{loadError}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadInventoryData}
            className="border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 shrink-0"
          >
            Retry
          </Button>
        </div>
      )}

      {/* ── Section 1: Organization Overview Metrics ────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Devices */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Total Inventory
            </span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-lg">
              <Smartphone className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-extrabold text-gray-900 dark:text-white">
              {isLoading ? '...' : totalDevices}
            </p>
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 font-semibold">
                {newCount} NEW
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 font-semibold">
                {usedCount} USED
              </span>
            </div>
          </div>
        </div>

        {/* In-Stock vs Sold */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Stock Status
            </span>
            <div className="p-2 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-lg">
              <Boxes className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-extrabold text-teal-700 dark:text-teal-400">
              {isLoading ? '...' : inStockCount}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              In Stock {inspectionCount > 0 && `• ${inspectionCount} in Inspection`} • {soldCount} Sold
            </p>
          </div>
        </div>

        {/* Stock Valuation */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              In-Stock Valuation
            </span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl lg:text-3xl font-extrabold text-gray-900 dark:text-white truncate">
              {isLoading ? '...' : `Rs. ${totalValuation.toLocaleString('en-PK')}`}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Cost-based asset value across branches
            </p>
            {!isLoading && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                <span className="text-green-600 dark:text-green-400">New: Rs.&nbsp;{newValuation.toLocaleString('en-PK')}</span>
                {' · '}
                <span className="text-amber-600 dark:text-amber-400">Used: Rs.&nbsp;{usedValuation.toLocaleString('en-PK')}</span>
              </p>
            )}
          </div>
        </div>

        {/* Branch Network */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Branch Coverage
            </span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-extrabold text-gray-900 dark:text-white">
              {isLoading ? '...' : branches.length}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Active branch locations monitored
            </p>
          </div>
        </div>
      </div>

      {/* ── Section 2: Branch-by-Branch Allocation ──────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-xs p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Store className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>Branch-by-Branch Inventory Allocation</span>
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Click any branch to isolate its inventory in the table below, or select All Branches to view the consolidated stock.
            </p>
          </div>
          {selectedBranchId !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedBranchId('all')}
              className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer self-start sm:self-auto"
            >
              Reset to All Branches
            </button>
          )}
        </div>

        {/* Branch Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 mt-4">
          {/* "All Branches" selector card */}
          <button
            type="button"
            onClick={() => setSelectedBranchId('all')}
            className={`p-4 rounded-lg text-left transition-all cursor-pointer border ${
              selectedBranchId === 'all'
                ? 'bg-teal-50/70 dark:bg-teal-950/40 border-teal-600 dark:border-teal-500 shadow-xs ring-1 ring-teal-500'
                : 'bg-gray-50/70 dark:bg-gray-800/40 border-gray-200 dark:border-gray-800 hover:bg-gray-100/70 dark:hover:bg-gray-800/70'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm text-gray-900 dark:text-white">All Branches</span>
              <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                ALL
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-xl font-extrabold text-gray-900 dark:text-white">{totalDevices} units</span>
              <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                Rs. {totalValuation.toLocaleString('en-PK')}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              {newCount} New • {usedCount} Used • {inStockCount} In Stock
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              <span className="text-green-600 dark:text-green-400">N: Rs.&nbsp;{newValuation.toLocaleString('en-PK')}</span>
              {' · '}
              <span className="text-amber-600 dark:text-amber-400">U: Rs.&nbsp;{usedValuation.toLocaleString('en-PK')}</span>
            </p>
          </button>

          {/* Individual branch cards */}
          {branches.map((b) => {
            const isSelected = selectedBranchId === b.branch_id;
            return (
              <button
                key={b.branch_id}
                type="button"
                onClick={() => setSelectedBranchId(b.branch_id)}
                className={`p-4 rounded-lg text-left transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-teal-50/70 dark:bg-teal-950/40 border-teal-600 dark:border-teal-500 shadow-xs ring-1 ring-teal-500'
                    : 'bg-gray-50/70 dark:bg-gray-800/40 border-gray-200 dark:border-gray-800 hover:bg-gray-100/70 dark:hover:bg-gray-800/70'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-gray-900 dark:text-white truncate max-w-[140px]" title={b.branch_name}>
                    {b.branch_name}
                  </span>
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300 uppercase">
                    {b.branch_code}
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-xl font-extrabold text-gray-900 dark:text-white">
                    {b.total_devices} {b.total_devices === 1 ? 'unit' : 'units'}
                  </span>
                  <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                    Rs. {(b.total_valuation || 0).toLocaleString('en-PK')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  <span>{b.new_count} New • {b.used_count} Used</span>
                  <span>{b.in_stock_count} In Stock</span>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                  <span className="text-green-600 dark:text-green-400">N: Rs.&nbsp;{(b.new_valuation || 0).toLocaleString('en-PK')}</span>
                  {' · '}
                  <span className="text-amber-600 dark:text-amber-400">U: Rs.&nbsp;{(b.used_valuation || 0).toLocaleString('en-PK')}</span>
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Section 3: Consolidated Inventory Table & Controls ──────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-xs p-5 space-y-4">
        {/* Table Header and Search / Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                Consolidated Devices
              </h2>
              {selectedBranchId !== 'all' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-300">
                  Filtered: {branchMap.get(selectedBranchId)?.branch_name || selectedBranchId}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Showing {filteredDevices.length} of {totalDevices} serialized units
              {selectedBranchId !== 'all' ? ` in ${branchMap.get(selectedBranchId)?.branch_name || 'selected branch'}` : ' across all branches'}.
            </p>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Condition Filters */}
            <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-800 p-0.5 bg-gray-50 dark:bg-gray-800/40 text-xs">
              {(['ALL', 'NEW', 'USED'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setConditionFilter(c)}
                  className={`px-3 py-1 font-semibold rounded-md transition-colors cursor-pointer ${
                    conditionFilter === c
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {c === 'ALL' ? 'All Conditions' : c}
                </button>
              ))}
            </div>

            {/* Status Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 cursor-pointer focus:ring-1 focus:ring-teal-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="INSPECTION">Inspection</option>
              <option value="SOLD">Sold</option>
            </select>

            {/* Branch Dropdown */}
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 cursor-pointer focus:ring-1 focus:ring-teal-500"
            >
              <option value="all">All Branches ({branches.length})</option>
              {branches.map((b) => (
                <option key={b.branch_id} value={b.branch_id}>
                  {b.branch_name} ({b.total_devices})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by brand, model, IMEI, or branch..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 absolute right-3 top-1/2 -translate-y-1/2"
            >
              Clear
            </button>
          )}
        </div>

        {/* Table Element */}
        <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Owning Branch</th>
                <th className="py-3 px-4">Device Model</th>
                <th className="py-3 px-4">Primary IMEI</th>
                <th className="py-3 px-4">Condition</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">PTA Status</th>
                <th className="py-3 px-4 text-right">Cost Price</th>
                <th className="py-3 px-4 text-right">Expected Sale</th>
                <th className="py-3 px-4 text-right">Added On</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-teal-600 dark:text-teal-400" />
                      <p className="font-medium text-xs">Loading consolidated inventory...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Smartphone className="w-8 h-8 text-gray-300 dark:text-gray-700" />
                      <p className="font-semibold text-sm text-gray-700 dark:text-gray-300">No Mobile Devices Found</p>
                      <p className="text-xs text-gray-400 max-w-sm">
                        {searchQuery || conditionFilter !== 'ALL' || statusFilter !== 'ALL' || selectedBranchId !== 'all'
                          ? 'No devices match your current filter criteria. Try adjusting or clearing your filters.'
                          : 'No mobile devices are currently registered in this organization.'}
                      </p>
                      {(searchQuery || conditionFilter !== 'ALL' || statusFilter !== 'ALL' || selectedBranchId !== 'all') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setConditionFilter('ALL');
                            setStatusFilter('ALL');
                            setSelectedBranchId('all');
                          }}
                          className="mt-2 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                        >
                          Reset All Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDevices.map((device) => {
                  const branchInfo = branchMap.get(device.branch);
                  const branchDisplayName = device.branchName || branchInfo?.branch_name || 'Main Branch';
                  const branchDisplayCode = device.branchCode || branchInfo?.branch_code || 'MAIN';

                  return (
                    <tr
                      key={device.id}
                      className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      {/* Owning Branch */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300 uppercase">
                            {branchDisplayCode}
                          </span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[120px]" title={branchDisplayName}>
                            {branchDisplayName}
                          </span>
                        </div>
                      </td>

                      {/* Device Model & Specs */}
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white">
                            {device.brand} {device.model}
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            {device.storage} {device.ram && `• ${device.ram} RAM`} {device.color && `• ${device.color}`}
                          </p>
                        </div>
                      </td>

                      {/* Primary IMEI */}
                      <td className="py-3 px-4 font-mono text-[11px] text-gray-700 dark:text-gray-300">
                        {maskImei(device.imei1)}
                      </td>

                      {/* Condition */}
                      <td className="py-3 px-4">
                        {device.condition === 'NEW' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            NEW
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                            USED
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {device.status === 'IN_STOCK' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                            In Stock
                          </span>
                        ) : device.status === 'INSPECTION' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                            Inspection
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            Sold
                          </span>
                        )}
                      </td>

                      {/* PTA Status */}
                      <td className="py-3 px-4">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                          {device.ptaStatus.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Cost Price */}
                      <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">
                        Rs. {device.purchaseCost.toLocaleString('en-PK')}
                      </td>

                      {/* Expected Sale */}
                      <td className="py-3 px-4 text-right text-teal-700 dark:text-teal-400 font-semibold">
                        {device.salePrice > 0 ? `Rs. ${device.salePrice.toLocaleString('en-PK')}` : '—'}
                      </td>

                      {/* Created At */}
                      <td className="py-3 px-4 text-right text-gray-400 text-[11px]">
                        {device.createdAt ? new Date(device.createdAt).toLocaleDateString() : '—'}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedDeviceId(device.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 rounded-lg border border-teal-200 dark:border-teal-800 transition-colors"
                          title="View full details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer Reconciliations */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800">
          <div>
            Showing <span className="font-bold text-gray-900 dark:text-white">{filteredDevices.length}</span> of{' '}
            <span className="font-bold text-gray-900 dark:text-white">{totalDevices}</span> devices
            {selectedBranchId !== 'all' && (
              <span> (Filtered to <span className="font-bold text-gray-900 dark:text-white">{branchMap.get(selectedBranchId)?.branch_name}</span>)</span>
            )}
          </div>
          <div>
            Filtered In-Stock Valuation:{' '}
            <span className="font-bold text-teal-700 dark:text-teal-400">
              Rs. {filteredValuation.toLocaleString('en-PK')}
            </span>
          </div>
        </div>
      </div>
    </OrganizationPageShell>

      {/* Mobile detail modal */}
      {selectedDeviceId && (
        <MobileDetailModal
          deviceId={selectedDeviceId}
          branchId={devices.find((d) => d.id === selectedDeviceId)?.branch}
          onClose={() => setSelectedDeviceId(null)}
          onEdit={(id) => { setSelectedDeviceId(null); setEditDeviceId(id); }}
          onPrint={handlePrint}
          onDownloadPdf={(p) => { void handleDownloadPdf(p); }}
        />
      )}
      {/* Edit modal — org-admin only */}
      {editDeviceId && (
        <EditMobileModal
          deviceId={editDeviceId}
          branchId={devices.find((d) => d.id === editDeviceId)?.branch}
          onClose={() => setEditDeviceId(null)}
          onSaved={() => { setEditDeviceId(null); void loadInventoryData(); }}
        />
      )}
      {pdfError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 bg-red-600 text-white rounded-lg text-sm shadow-lg" role="alert">
          PDF error: {pdfError}
          <button type="button" onClick={() => setPdfError(null)} className="ml-3 underline text-xs">Dismiss</button>
        </div>
      )}
    </>
  );
}

export default OrganizationMobileInventoryPage;
