'use client';

/**
 * SoldMobilesTab.tsx
 *
 * Dedicated workspace for inspecting sold mobile handsets.
 *
 * Features:
 *   - Clean segregation: Only displays devices with status = 'SOLD'
 *   - Quick presets: Today, This Week, This Month, All Time
 *   - Custom date selection: Start Date, End Date (calendar picker)
 *   - Search: Filter by Brand, Model, IMEI1, IMEI2, Invoice #, Customer
 *   - Financial cards: Sold Units, Total Revenue, Total Acquisition Cost, Gross Profit (RBAC sensitive)
 *   - Print Report (A4 landscape) & Download PDF actions
 *   - Open device detail modal for full history inspection
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Smartphone,
  Search,
  Calendar,
  Filter,
  RefreshCw,
  Printer,
  Download,
  AlertCircle,
  TrendingUp,
  DollarSign,
  PackageCheck,
  Tag,
  Copy,
  Check,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  FileText,
  User,
} from 'lucide-react';
import { Button, Badge, Card } from '@/components/ui';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMISSIONS } from '@/constants/permissions';
import { mobileApi, mapDeviceRowToItem } from '../services/mobile.api';
import { MobileDetailModal } from './MobileDetailModal';
import { buildSoldMobilesA4Html, buildSoldMobilesPdfFilename } from '../templates/soldMobileA4Template';
import { usePrintStore } from '@/lib/printer/print.store';
import { downloadHtmlAsPdf } from '@/lib/printer/pdfExport';
import type { MobileInventoryItem, MobileCondition } from '../types/mobile.types';

export type DatePreset = 'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM';

function computeDatePresetRange(preset: DatePreset): { startDate?: string; endDate?: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const dayOfWeek = now.getDay();

  const toYmd = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  if (preset === 'ALL') return {};

  if (preset === 'TODAY') {
    const todayStr = toYmd(now);
    return { startDate: todayStr, endDate: todayStr };
  }

  if (preset === 'THIS_WEEK') {
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(year, month, day + diffToMonday);
    return { startDate: toYmd(monday), endDate: toYmd(now) };
  }

  if (preset === 'THIS_MONTH') {
    const firstDay = new Date(year, month, 1);
    return { startDate: toYmd(firstDay), endDate: toYmd(now) };
  }

  return {};
}

interface SoldMobilesTabProps {
  branchId?: string;
  branchName?: string;
  isOrgAdminView?: boolean;
}

export const SoldMobilesTab: React.FC<SoldMobilesTabProps> = ({
  branchId: propBranchId,
  branchName: propBranchName,
  isOrgAdminView = false,
}) => {
  const activeShop = useOrganizationStore((s) => s.activeShop);
  const activeShopId = useOrganizationStore((s) => s.activeShop?._id ?? '');
  const activeShopName = useOrganizationStore((s) => s.activeShop?.name ?? 'Main Branch');
  const user = useAuthStore((s) => s.user);

  // In org admin view, if propBranchId is 'all' or undefined, branchId is null/undefined (consolidated org view)
  const branchId = isOrgAdminView
    ? propBranchId === 'all'
      ? undefined
      : propBranchId
    : propBranchId || activeShopId;
  const branchName = isOrgAdminView
    ? propBranchId === 'all' || !propBranchId
      ? 'All Authorized Branches'
      : propBranchName || 'Selected Branch'
    : propBranchName || activeShopName;

  const { hasPermission } = usePermissions();
  // Cost & Profit visibility: requires finance view or settings admin
  const canViewFinancials = hasPermission(PERMISSIONS.FINANCE_VIEW) || user?.role === 'ADMIN' || user?.role === 'ORGANIZATION_ADMIN';

  const [items, setItems] = useState<MobileInventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters
  const [conditionFilter, setConditionFilter] = useState<'ALL' | MobileCondition>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Modals & Exporting
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const openPrintPreview = usePrintStore((s) => s.openPreview);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedImei, setCopiedImei] = useState<string | null>(null);

  // Fetch all SOLD mobiles for this branch
  const fetchSoldMobiles = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const rows = await mobileApi.getAllMobiles({
        branch_id: branchId || undefined,
        status: 'SOLD',
      });
      const mapped = rows.map(mapDeviceRowToItem);
      setItems(mapped);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load sold mobile devices';
      setFetchError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchSoldMobiles();
  }, [fetchSoldMobiles]);

  // Compute effective date range
  const activeDateRange = useMemo(() => {
    if (datePreset === 'CUSTOM') {
      return {
        startDate: customStartDate || undefined,
        endDate: customEndDate || undefined,
      };
    }
    return computeDatePresetRange(datePreset);
  }, [datePreset, customStartDate, customEndDate]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Condition filter
      if (conditionFilter !== 'ALL' && item.condition !== conditionFilter) {
        return false;
      }

      // Date filtering: uses saleDate if present, else fallback to createdAt (YYYY-MM-DD)
      const dateStr = (item.saleDate || item.createdAt).slice(0, 10);
      if (activeDateRange.startDate && dateStr < activeDateRange.startDate) {
        return false;
      }
      if (activeDateRange.endDate && dateStr > activeDateRange.endDate) {
        return false;
      }

      // Search filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchBrand = item.brand.toLowerCase().includes(q);
        const matchModel = item.model.toLowerCase().includes(q);
        const matchImei1 = item.imei1.toLowerCase().includes(q);
        const matchBranch = (item.branchName || item.branchCode || '').toLowerCase().includes(q);
        const matchInvoice = item.invoiceNumber?.toLowerCase().includes(q) ?? false;
        const matchCustomer = item.customerName?.toLowerCase().includes(q) ?? false;
        const matchVoucher = item.voucherNo?.toLowerCase().includes(q) ?? false;
        return matchBrand || matchModel || matchImei1 || matchBranch || matchInvoice || matchCustomer || matchVoucher;
      }

      return true;
    });
  }, [items, conditionFilter, activeDateRange, searchTerm]);

  // Metrics over the filtered list
  const metrics = useMemo(() => {
    const totalUnits = filteredItems.length;
    const newUnits = filteredItems.filter((i) => i.condition === 'NEW').length;
    const usedUnits = filteredItems.filter((i) => i.condition === 'USED').length;

    const totalRevenue = filteredItems.reduce((acc, i) => acc + (i.salePriceActual ?? i.salePrice ?? 0), 0);
    const totalCost = filteredItems.reduce((acc, i) => acc + i.purchaseCost, 0);
    const grossProfit = totalRevenue - totalCost;

    return { totalUnits, newUnits, usedUnits, totalRevenue, totalCost, grossProfit };
  }, [filteredItems]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedImei(text);
    setTimeout(() => setCopiedImei(null), 2000);
  };

  const handlePrint = useCallback(() => {
    const html = buildSoldMobilesA4Html(filteredItems, {
      shopName: 'NIAZI MOBILE MART',
      branchName,
      showBranchColumn: isOrgAdminView,
      dateRangeLabel:
        datePreset === 'TODAY'
          ? 'Today'
          : datePreset === 'THIS_WEEK'
          ? 'This Week'
          : datePreset === 'THIS_MONTH'
          ? 'This Month'
          : datePreset === 'CUSTOM'
          ? `${customStartDate || '...'} to ${customEndDate || '...'}`
          : 'All Time',
      searchKeyword: searchTerm.trim() || undefined,
      generatedBy: user?.name,
      showFinancials: canViewFinancials,
    });

    openPrintPreview({
      html,
      title: `Sold Mobiles Report (${filteredItems.length} Handsets)`,
      documentType: 'A4',
    });
  }, [filteredItems, branchName, datePreset, customStartDate, customEndDate, searchTerm, user, canViewFinancials, openPrintPreview]);

  const handleDownloadPdf = useCallback(async () => {
    setIsExporting(true);
    try {
      const rangeLabel =
        datePreset === 'TODAY'
          ? 'Today'
          : datePreset === 'THIS_WEEK'
          ? 'This-Week'
          : datePreset === 'THIS_MONTH'
          ? 'This-Month'
          : 'All-Time';
      const html = buildSoldMobilesA4Html(filteredItems, {
        shopName: 'NIAZI MOBILE MART',
        branchName,
        showBranchColumn: isOrgAdminView,
        dateRangeLabel: rangeLabel,
        searchKeyword: searchTerm.trim() || undefined,
        generatedBy: user?.name,
        showFinancials: canViewFinancials,
      });
      const filename = buildSoldMobilesPdfFilename({ dateRangeLabel: rangeLabel });
      await downloadHtmlAsPdf(html, filename);
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setIsExporting(false);
    }
  }, [filteredItems, branchName, datePreset, searchTerm, user, canViewFinancials]);

  return (
    <div className="space-y-6">
      {/* ── Summary Metrics Header ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sold Units */}
        <Card variant="default" padding="md" className="bg-surface border-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Sold Units</span>
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <PackageCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold text-text-primary">{metrics.totalUnits}</p>
            <p className="text-xs text-text-muted mt-1">
              <span className="text-success font-medium">{metrics.newUnits} New</span> •{' '}
              <span className="text-warning font-medium">{metrics.usedUnits} Used</span>
            </p>
          </div>
        </Card>

        {/* Total Revenue */}
        <Card variant="default" padding="md" className="bg-surface border-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Sold Revenue</span>
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold text-text-primary">
              Rs.&nbsp;{metrics.totalRevenue.toLocaleString('en-PK')}
            </p>
            <p className="text-xs text-text-muted mt-1">Aggregated invoice sale amount</p>
          </div>
        </Card>

        {/* Total Cost (Permission Gated) */}
        {canViewFinancials ? (
          <Card variant="default" padding="md" className="bg-surface border-border flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Acquisition Cost</span>
              <div className="p-2 bg-neutral-500/10 rounded-lg text-text-muted">
                <Tag className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-text-secondary">
                Rs.&nbsp;{metrics.totalCost.toLocaleString('en-PK')}
              </p>
              <p className="text-xs text-text-muted mt-1">Total purchasing cost</p>
            </div>
          </Card>
        ) : (
          <Card variant="default" padding="md" className="bg-surface border-border flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Cost Protection</span>
              <ShieldCheck className="w-5 h-5 text-text-muted" />
            </div>
            <p className="text-xs text-text-muted mt-4">Confidential cost price is hidden for your role profile.</p>
          </Card>
        )}

        {/* Realized Gross Profit (Permission Gated) */}
        {canViewFinancials ? (
          <Card variant="default" padding="md" className="bg-surface border-border flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Realized Margin</span>
              <div className={`p-2 rounded-lg ${metrics.grossProfit >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2">
              <p className={`text-2xl font-bold ${metrics.grossProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                Rs.&nbsp;{metrics.grossProfit.toLocaleString('en-PK')}
              </p>
              <p className="text-xs text-text-muted mt-1">Gross profit over sold handsets</p>
            </div>
          </Card>
        ) : (
          <Card variant="default" padding="md" className="bg-surface border-border flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Margin Protection</span>
              <ShieldCheck className="w-5 h-5 text-text-muted" />
            </div>
            <p className="text-xs text-text-muted mt-4">Profit margins are restricted to manager and owner roles.</p>
          </Card>
        )}
      </div>

      {/* ── Filter Bar & Actions ──────────────────────────────────────────────── */}
      <Card variant="default" padding="md" className="bg-surface border-border space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-surface-hover/80 rounded-xl border border-border w-fit">
            {(
              [
                { id: 'ALL', label: 'All Time' },
                { id: 'TODAY', label: 'Today' },
                { id: 'THIS_WEEK', label: 'This Week' },
                { id: 'THIS_MONTH', label: 'This Month' },
                { id: 'CUSTOM', label: 'Custom' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDatePreset(p.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  datePreset === p.id
                    ? 'bg-surface text-primary shadow-xs border border-border'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Action Buttons: Print & Download PDF */}
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Printer className="w-3.5 h-3.5" />}
              onClick={handlePrint}
              disabled={isLoading || filteredItems.length === 0}
              className="cursor-pointer"
            >
              Print Report
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className={`w-3.5 h-3.5 ${isExporting ? 'animate-bounce' : ''}`} />}
              onClick={handleDownloadPdf}
              disabled={isLoading || isExporting || filteredItems.length === 0}
              className="cursor-pointer"
            >
              Download PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
              onClick={fetchSoldMobiles}
              disabled={isLoading}
              className="cursor-pointer"
              title="Refresh Sold Records"
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Custom Date Pickers (Shown if CUSTOM selected) */}
        {datePreset === 'CUSTOM' && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border text-xs">
            <span className="font-semibold text-text-secondary flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span>Select Date Window:</span>
            </span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-surface text-text-primary text-xs"
              />
              <span className="text-text-muted">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-surface text-text-primary text-xs"
              />
            </div>
          </div>
        )}

        {/* Search & Condition Switcher */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-border">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Brand, Model, IMEI, Invoice #, Customer…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border bg-surface text-text-primary text-xs focus:ring-1 focus:ring-primary focus:border-primary transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                ✕
              </button>
            )}
          </div>

          {/* Condition Pills */}
          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: 'All Conditions' },
                { id: 'NEW', label: 'New' },
                { id: 'USED', label: 'Used' },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setConditionFilter(c.id)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  conditionFilter === c.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Error Banner ──────────────────────────────────────────────────────── */}
      {fetchError && (
        <div className="p-4 rounded-lg bg-danger/10 border border-danger/20 text-danger flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchSoldMobiles}>
            Retry
          </Button>
        </div>
      )}

      {/* ── Sold Handset Table ────────────────────────────────────────────────── */}
      <div className="bg-surface rounded-xl border border-border shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-hover/80 border-b border-border text-text-secondary text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-3 w-10 text-center">#</th>
                {isOrgAdminView && <th className="py-3 px-3">Branch</th>}
                <th className="py-3 px-4">Handset &amp; Specs</th>
                <th className="py-3 px-4">Primary IMEI</th>
                <th className="py-3 px-3 text-center">Condition</th>
                <th className="py-3 px-3">Sale Date</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Customer</th>
                {canViewFinancials && <th className="py-3 px-4 text-right">Cost</th>}
                <th className="py-3 px-4 text-right">Sale Price</th>
                {canViewFinancials && <th className="py-3 px-4 text-right">Gross Profit</th>}
                <th className="py-3 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr>
                  <td colSpan={(canViewFinancials ? 11 : 9) + (isOrgAdminView ? 1 : 0)} className="py-12 text-center text-text-muted">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    <span>Loading sold mobile inventory…</span>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={(canViewFinancials ? 11 : 9) + (isOrgAdminView ? 1 : 0)} className="py-14 text-center text-text-muted">
                    <PackageCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-semibold text-text-primary text-sm">No Sold Mobile Handsets Found</p>
                    <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
                      {searchTerm || conditionFilter !== 'ALL' || datePreset !== 'ALL'
                        ? 'Try adjusting your search query, date preset, or condition filter.'
                        : 'Handsets sold via Mobile POS will automatically populate this ledger.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const salePrice = item.salePriceActual ?? item.salePrice ?? 0;
                  const profit = salePrice - item.purchaseCost;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-surface-hover/50 transition-colors group"
                    >
                      <td className="py-3 px-3 text-center text-text-muted font-mono">{idx + 1}</td>
                      {isOrgAdminView && (
                        <td className="py-3 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary uppercase">
                            {item.branchCode || item.branchName || 'BRANCH'}
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <div className="font-bold text-text-primary">
                          {item.brand} {item.model}
                        </div>
                        <div className="text-[11px] text-text-muted mt-0.5 flex items-center gap-1.5">
                          <span>{item.color || '—'}</span>
                          <span>•</span>
                          <span>{item.storage || '—'}</span>
                          {item.ram && <span>({item.ram} RAM)</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="inline-flex items-center gap-1 font-mono text-[11px] text-text-primary bg-surface-hover px-2 py-0.5 rounded border border-border/80">
                          <span>{item.imei1}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(item.imei1)}
                            className="text-text-muted hover:text-text-primary cursor-pointer p-0.5"
                            title="Copy IMEI1"
                          >
                            {copiedImei === item.imei1 ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant={item.condition === 'NEW' ? 'success' : 'warning'} size="sm">
                          {item.condition}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-text-secondary whitespace-nowrap">
                        {item.saleDate ? (
                          <>
                            <div className="font-medium text-text-primary">{item.saleDate.slice(0, 10)}</div>
                            <div className="text-[10px] text-text-muted">{item.saleDate.slice(11, 16)}</div>
                          </>
                        ) : (
                          item.createdAt.slice(0, 10)
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {item.invoiceNumber ? (
                          <span className="font-mono text-primary font-bold text-[11px]">{item.invoiceNumber}</span>
                        ) : (
                          <span className="text-text-muted italic">Manual / Legacy</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-text-secondary">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-text-muted shrink-0" />
                          <span className="truncate max-w-[140px] font-medium text-text-primary">
                            {item.customerName || 'Walk-in Customer'}
                          </span>
                        </div>
                        {item.soldByName && (
                          <div className="text-[10px] text-text-muted mt-0.5">By: {item.soldByName}</div>
                        )}
                      </td>
                      {canViewFinancials && (
                        <td className="py-3 px-4 text-right text-text-secondary whitespace-nowrap">
                          Rs.&nbsp;{item.purchaseCost.toLocaleString('en-PK')}
                        </td>
                      )}
                      <td className="py-3 px-4 text-right font-bold text-text-primary whitespace-nowrap">
                        Rs.&nbsp;{salePrice.toLocaleString('en-PK')}
                      </td>
                      {canViewFinancials && (
                        <td className="py-3 px-4 text-right font-bold whitespace-nowrap">
                          <span className={profit >= 0 ? 'text-success' : 'text-danger'}>
                            Rs.&nbsp;{profit.toLocaleString('en-PK')}
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedDeviceId(item.id)}
                          className="text-xs text-primary cursor-pointer hover:bg-primary/10"
                          title="View Full Device Audit"
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Detail Modal ──────────────────────────────────────────────────────── */}
      {selectedDeviceId && (
        <MobileDetailModal
          isOpen={Boolean(selectedDeviceId)}
          onClose={() => setSelectedDeviceId(null)}
          deviceId={selectedDeviceId}
          branchId={branchId}
        />
      )}
    </div>
  );
};

