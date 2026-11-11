import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Smartphone,
  Plus,
  Search,
  Filter,
  ShieldCheck,
  Tag,
  SlidersHorizontal,
  FileText,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Package,
  ArrowRightLeft,
  AlertOctagon,
  Boxes,
  PackageCheck,
  Info,
  Calendar,
  Printer,
  Download,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Button, Badge, Card } from '@/components/ui';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { mobileApi, mapDeviceRowToItem } from '../services/mobile.api';
import { MobileDetailModal } from './MobileDetailModal';
import { EditMobileModal } from './EditMobileModal';
import { buildUsedMobileA4Html, buildUsedMobilePdfFilename } from '../templates/usedMobileA4Template';
import { buildMobileInventoryA4Html, buildMobileInventoryPdfFilename } from '../templates/mobileInventoryA4Template';
import { StockTransferTab } from './StockTransferTab';
import { SoldMobilesTab } from './SoldMobilesTab';
import { usePrintStore } from '@/lib/printer/print.store';
import { downloadHtmlAsPdf } from '@/lib/printer/pdfExport';
import type { BranchInvestmentSummary } from '../services/mobile.api';
import type { MobileInventoryItem, MobileCondition } from '../types/mobile.types';

// ─── Mobile module sub-navigation tabs ──────────────────────────────────────
const MOBILE_NAV_TABS = [
  { label: 'Inventory', href: '/dashboard/shop-admin/mobiles' },
  { label: 'Sold Mobiles', href: '/dashboard/shop-admin/mobiles/sold' },
  { label: 'Mobile Sale', href: '/dashboard/shop-admin/mobiles/sale' },
  { label: 'Sale History', href: '/dashboard/shop-admin/mobiles/sale-history' },
] as const;

export type DatePreset = 'ALL' | 'TODAY' | 'THIS_WEEK' | 'PREV_WEEK' | 'THIS_MONTH' | 'PREV_MONTH' | 'CUSTOM';

function computeDatePresetRange(preset: DatePreset): { startDate?: string; endDate?: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const day = now.getDate();
  const dayOfWeek = now.getDay(); // 0 (Sun) to 6 (Sat)

  const toYmd = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dt = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dt}`;
  };

  if (preset === 'ALL') {
    return {};
  }

  if (preset === 'TODAY') {
    const todayStr = toYmd(now);
    return { startDate: todayStr, endDate: todayStr };
  }

  if (preset === 'THIS_WEEK') {
    // Monday as week start. In JS: Sunday is 0, Monday is 1, ..., Saturday is 6.
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(year, month, day + diffToMonday);
    return { startDate: toYmd(monday), endDate: toYmd(now) };
  }

  if (preset === 'PREV_WEEK') {
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const prevMonday = new Date(year, month, day + diffToMonday - 7);
    const prevSunday = new Date(year, month, day + diffToMonday - 1);
    return { startDate: toYmd(prevMonday), endDate: toYmd(prevSunday) };
  }

  if (preset === 'THIS_MONTH') {
    const firstDay = new Date(year, month, 1);
    return { startDate: toYmd(firstDay), endDate: toYmd(now) };
  }

  if (preset === 'PREV_MONTH') {
    const firstDayPrev = new Date(year, month - 1, 1);
    const lastDayPrev = new Date(year, month, 0); // last day of month - 1
    return { startDate: toYmd(firstDayPrev), endDate: toYmd(lastDayPrev) };
  }

  return {};
}

export const MobileInventoryDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const isOrgAdmin = user?.role === 'ADMIN';

  const activeShop = useOrganizationStore((s) => s.activeShop);
  const activeShopId = useOrganizationStore((s) => s.activeShopId);
  const branchId = activeShopId || activeShop?._id || activeShop?.id || undefined;

  // Active top view section: 'INSTOCK' (default) | 'LOWSTOCK' | 'TRANSFER'
  const [inventorySection, setInventorySection] = useState<'INSTOCK' | 'LOWSTOCK' | 'TRANSFER' | 'SOLD'>('INSTOCK');

  const [items, setItems] = useState<MobileInventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters: Condition & PTA
  const [activeTab, setActiveTab] = useState<'ALL' | MobileCondition>('ALL');
  const [ptaFilter, setPtaFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Purchase date filtering
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [investmentSummary, setInvestmentSummary] = useState<BranchInvestmentSummary | null>(null);
  const [investmentLoading, setInvestmentLoading] = useState(false);
  const [investmentError, setInvestmentError] = useState<string | null>(null);

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [editDeviceId, setEditDeviceId] = useState<string | null>(null);
  const openPrintPreview = usePrintStore((s) => s.openPreview);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch all available IN_STOCK mobile inventory for this branch without truncation
  const fetchMobiles = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const rows = await mobileApi.getAllMobiles({
        branch_id: branchId,
        status: 'IN_STOCK',
      });
      const mapped = rows.map(mapDeviceRowToItem);
      setItems(mapped);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load mobile inventory';
      setFetchError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [branchId]);

  const fetchInvestment = useCallback(async () => {
    setInvestmentLoading(true);
    setInvestmentError(null);
    try {
      const res = await mobileApi.getBranchInvestmentSummary(branchId);
      setInvestmentSummary(res.summary);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load investment summary';
      setInvestmentError(msg);
    } finally {
      setInvestmentLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchMobiles();
  }, [fetchMobiles]);

  useEffect(() => {
    fetchInvestment();
  }, [fetchInvestment]);

  // Effective active date range
  const activeDateRange = useMemo(() => {
    if (datePreset === 'CUSTOM') {
      return {
        startDate: customStartDate || undefined,
        endDate: customEndDate || undefined,
      };
    }
    return computeDatePresetRange(datePreset);
  }, [datePreset, customStartDate, customEndDate]);

  // Filter items based on active condition tab, PTA, date range, and search keyword
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Condition filter
      if (activeTab !== 'ALL' && item.condition !== activeTab) {
        return false;
      }
      // PTA filter
      if (ptaFilter !== 'ALL' && item.ptaStatus !== ptaFilter) {
        return false;
      }
      // Purchase Date filter: uses item.purchaseDate for USED, createdAt (YYYY-MM-DD) for NEW
      const itemDate = item.purchaseDate || (item.condition === 'NEW' ? item.createdAt.slice(0, 10) : null);
      if (activeDateRange.startDate && (!itemDate || itemDate < activeDateRange.startDate)) {
        return false;
      }
      if (activeDateRange.endDate && (!itemDate || itemDate > activeDateRange.endDate)) {
        return false;
      }
      // Search filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchBrand = item.brand.toLowerCase().includes(q);
        const matchModel = item.model.toLowerCase().includes(q);
        const matchImei = item.imei1.includes(q);
        const matchSeller = item.sellerName?.toLowerCase().includes(q) ?? false;
        const matchVoucher = item.voucherNo?.toLowerCase().includes(q) ?? false;
        return matchBrand || matchModel || matchImei || matchSeller || matchVoucher;
      }
      return true;
    });
  }, [items, activeTab, ptaFilter, activeDateRange, searchTerm]);

  const allCount = items.length;
  const newCount = items.filter((m) => m.condition === 'NEW').length;
  const usedCount = items.filter((m) => m.condition === 'USED').length;

  const hasActiveFilters =
    activeTab !== 'ALL' ||
    ptaFilter !== 'ALL' ||
    Boolean(searchTerm.trim()) ||
    datePreset !== 'ALL' ||
    Boolean(customStartDate) ||
    Boolean(customEndDate);

  const resetAllFilters = () => {
    setActiveTab('ALL');
    setPtaFilter('ALL');
    setSearchTerm('');
    setDatePreset('ALL');
    setCustomStartDate('');
    setCustomEndDate('');
  };

  const getDateRangeLabel = useCallback((): string => {
    if (datePreset === 'ALL') return 'All Time';
    if (datePreset === 'TODAY') return 'Today';
    if (datePreset === 'THIS_WEEK') return 'This Week (Mon–Today)';
    if (datePreset === 'PREV_WEEK') return 'Previous Week';
    if (datePreset === 'THIS_MONTH') return 'This Month';
    if (datePreset === 'PREV_MONTH') return 'Previous Month';
    if (datePreset === 'CUSTOM') {
      if (customStartDate && customEndDate) return `${customStartDate} to ${customEndDate}`;
      if (customStartDate) return `From ${customStartDate}`;
      if (customEndDate) return `Up to ${customEndDate}`;
      return 'Custom Range (All)';
    }
    return 'All Time';
  }, [datePreset, customStartDate, customEndDate]);

  // Bulk Print A4 Action (consumes exact complete filtered result set)
  const handlePrintFilteredList = useCallback(() => {
    if (filteredItems.length === 0) return;
    const html = buildMobileInventoryA4Html(filteredItems, {
      shopName: activeShop?.name || 'Niazi Mobile Mart',
      branchName: activeShop?.branch_name || (typeof branchId === 'string' ? branchId.slice(0, 8) : undefined),
      conditionFilter: activeTab === 'ALL' ? 'All Mobiles (New & Used)' : activeTab === 'NEW' ? 'New Only' : 'Used Only',
      ptaFilter: ptaFilter === 'ALL' ? 'All PTA Statuses' : ptaFilter.replace(/_/g, ' '),
      dateRangeLabel: getDateRangeLabel(),
      searchKeyword: searchTerm,
      generatedBy: user?.name || user?.username || 'Staff',
    });

    openPrintPreview({
      html,
      documentType: 'Generic',
      referenceId: `INV-PRINT-${Date.now()}`,
      title: `Mobile Inventory Audit (${filteredItems.length} Handsets)`,
    });
  }, [filteredItems, activeShop, branchId, activeTab, ptaFilter, getDateRangeLabel, searchTerm, user, openPrintPreview]);

  // Bulk Export PDF Action (consumes exact complete filtered result set)
  const handleDownloadFilteredPdf = useCallback(async () => {
    if (filteredItems.length === 0) return;
    setIsExporting(true);
    setPdfError(null);
    try {
      const html = buildMobileInventoryA4Html(filteredItems, {
        shopName: activeShop?.name || 'Niazi Mobile Mart',
        branchName: activeShop?.branch_name || (typeof branchId === 'string' ? branchId.slice(0, 8) : undefined),
        conditionFilter: activeTab === 'ALL' ? 'All Mobiles (New & Used)' : activeTab === 'NEW' ? 'New Only' : 'Used Only',
        ptaFilter: ptaFilter === 'ALL' ? 'All PTA Statuses' : ptaFilter.replace(/_/g, ' '),
        dateRangeLabel: getDateRangeLabel(),
        searchKeyword: searchTerm,
        generatedBy: user?.name || user?.username || 'Staff',
      });

      const filename = buildMobileInventoryPdfFilename({
        conditionFilter: activeTab,
        dateRangeLabel: getDateRangeLabel(),
      });

      await downloadHtmlAsPdf(html, filename);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setIsExporting(false);
    }
  }, [filteredItems, activeShop, branchId, activeTab, ptaFilter, getDateRangeLabel, searchTerm, user]);

  // Individual Handset Paperwork Actions
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

  return (
    <>
      <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-16 px-4 sm:px-6">
        {/* Mobile module sub-nav */}
        <div className="flex items-center gap-1 pt-4 border-b border-border pb-0 overflow-x-auto">
          {MOBILE_NAV_TABS.map((tab) => {
            const isActive =
              tab.href === '/dashboard/shop-admin/mobiles'
                ? pathname === '/dashboard/shop-admin/mobiles'
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                to={tab.href}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                  }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-b border-border pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
                  Mobile Inventory
                </h1>
                <p className="text-sm text-text-secondary mt-0.5">
                  Manage serialized smartphones, IMEI tracking, and digitized used-purchase affidavits separately from accessories.
                </p>
              </div>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="md"
              leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
              onClick={fetchMobiles}
              disabled={isLoading}
              className="shadow-xs cursor-pointer"
              title="Refresh Inventory"
            >
              Refresh
            </Button>

            <Button
              variant="primary"
              size="md"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => navigate('/dashboard/shop-admin/mobiles/add')}
              className="shadow-sm font-semibold"
            >
              Add Mobile
            </Button>
          </div>
        </div>

        {/* Error Banner if API call fails */}
        {fetchError && (
          <div className="p-4 bg-danger/10 border border-danger/20 rounded-lg flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm text-danger">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{fetchError}</span>
            </div>
            <Button variant="outline" size="sm" onClick={fetchMobiles}>
              Retry
            </Button>
          </div>
        )}

        {/* Investment Summary Card */}
        {(() => {
          const inv = investmentSummary;
          const displayValue = !inv
            ? 0
            : activeTab === 'NEW'
              ? inv.new_investment
              : activeTab === 'USED'
                ? inv.used_investment
                : inv.total_investment;
          const displayCount = !inv
            ? 0
            : activeTab === 'NEW'
              ? inv.new_in_stock
              : activeTab === 'USED'
                ? inv.used_in_stock
                : inv.total_in_stock;
          const labelSuffix = activeTab === 'NEW' ? ' (New)' : activeTab === 'USED' ? ' (Used)' : '';
          return (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Total Investment */}
              <Card variant="default" padding="md" className="bg-surface border-border col-span-1 sm:col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                      Current Investment{labelSuffix}
                    </p>
                    {investmentLoading ? (
                      <div className="flex items-center gap-2 text-text-muted">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Loading…</span>
                      </div>
                    ) : investmentError ? (
                      <span className="text-sm text-danger">{investmentError}</span>
                    ) : (
                      <p className="text-2xl font-bold text-text-primary">
                        Rs.&nbsp;{displayValue.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </p>
                    )}
                    {!investmentLoading && !investmentError && inv && (
                      <p className="text-xs text-text-muted mt-1">
                        {displayCount} in-stock device{displayCount !== 1 ? 's' : ''} &mdash; acquisition cost only, sold excluded
                      </p>
                    )}
                  </div>
                  <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
                {/* New / Used breakdown (only shown in ALL tab) */}
                {activeTab === 'ALL' && !investmentLoading && !investmentError && inv && (
                  <div className="mt-3 pt-3 border-t border-border flex items-center gap-6 text-xs">
                    <span className="text-text-secondary">
                      <span className="font-semibold text-success">New:</span>{' '}
                      Rs.&nbsp;{inv.new_investment.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      <span className="text-text-muted ml-1">({inv.new_in_stock} units)</span>
                    </span>
                    <span className="text-text-secondary">
                      <span className="font-semibold text-warning">Used:</span>{' '}
                      Rs.&nbsp;{inv.used_investment.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      <span className="text-text-muted ml-1">({inv.used_in_stock} units)</span>
                    </span>
                  </div>
                )}
              </Card>

              {/* In-Stock Count */}
              <Card variant="default" padding="md" className="bg-surface border-border">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                      In Stock{labelSuffix}
                    </p>
                    {investmentLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
                    ) : (
                      <p className="text-2xl font-bold text-text-primary">{displayCount}</p>
                    )}
                    <p className="text-xs text-text-muted mt-1">devices ready for sale</p>
                  </div>
                  <div className="p-2 bg-success/10 rounded-lg text-success shrink-0">
                    <Package className="w-5 h-5" />
                  </div>
                </div>
              </Card>
            </div>
          );
        })()}

        {/* Master Inventory Section Switcher Tabs: In Stock (Active) | Low Stock (0) | Stock Transfer */}
        <div className="flex items-center gap-2 p-1.5 bg-surface-hover/80 rounded-xl border border-border w-fit shadow-xs">
          <button
            type="button"
            onClick={() => setInventorySection('INSTOCK')}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${inventorySection === 'INSTOCK'
                ? 'bg-surface text-primary shadow-xs border border-border'
                : 'text-text-secondary hover:text-text-primary'
              }`}
          >
            <Package className="w-4 h-4 text-success" />
            <span>In Stock</span>
            <Badge variant={inventorySection === 'INSTOCK' ? 'success' : 'neutral'} size="sm">
              {allCount}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setInventorySection('LOWSTOCK')}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${inventorySection === 'LOWSTOCK'
                ? 'bg-surface text-primary shadow-xs border border-border'
                : 'text-text-secondary hover:text-text-primary'
              }`}
          >
            <AlertOctagon className="w-4 h-4 text-warning" />
            <span>Low Stock (0 Stock)</span>
            <Badge variant={inventorySection === 'LOWSTOCK' ? 'warning' : 'neutral'} size="sm">
              0
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setInventorySection('TRANSFER')}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${inventorySection === 'TRANSFER'
                ? 'bg-surface text-primary shadow-xs border border-border'
                : 'text-text-secondary hover:text-text-primary'
              }`}
          >
            <ArrowRightLeft className="w-4 h-4 text-primary" />
            <span>Stock Transfer</span>
            <Badge variant="neutral" size="sm">
              Preview
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setInventorySection('SOLD')}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${inventorySection === 'SOLD'
                ? 'bg-surface text-primary shadow-xs border border-border'
                : 'text-text-secondary hover:text-text-primary'
              }`}
          >
            <PackageCheck className="w-4 h-4 text-primary" />
            <span>Sold Mobiles</span>
          </button>
        </div>

        {/* Render Selected Section View */}
        {inventorySection === 'SOLD' ? (
          <SoldMobilesTab
            branchId={branchId}
            branchName={activeShop?.name || 'Current Branch'}
            isOrgAdminView={false}
          />
        ) : inventorySection === 'TRANSFER' ? (
          <StockTransferTab
            currentBranchId={branchId}
            availableDevices={items}
            onTransferCompleted={() => {
              fetchMobiles();
              fetchInvestment();
            }}
          />
        ) : inventorySection === 'LOWSTOCK' ? (
          /* Low Stock (0 Available) View */
          <Card variant="default" padding="lg" className="bg-surface border-border text-center py-14">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <AlertOctagon className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-text-primary mb-1">
              Zero-Stock Mobile Models
            </h3>
            <p className="text-sm text-text-muted max-w-xl mx-auto mb-4 leading-relaxed">
              Zero-stock model tracking requires a master mobile catalogue or backend aggregation endpoint. The current inventory records individual handsets, so a model with no remaining devices may not appear in the available inventory data. Complete depleted-model reporting will be enabled in a future backend phase.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface-hover rounded-lg border border-border text-xs text-text-secondary">
              <Info className="w-4 h-4 text-primary" />
              <span>Catalog Depletion Reporting — Awaiting Backend Integration</span>
            </div>
          </Card>
        ) : (
          /* Main IN-STOCK Mobile Inventory Table & Filters */
          <>
            {/* Filter Bar Card */}
            <Card variant="default" padding="md" className="bg-surface border-border flex flex-col gap-4">
              {/* Row 1: Category & Condition Selector + Export Controls */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Condition Filter Controls */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-surface-hover rounded-lg border border-border/60">
                  <button
                    type="button"
                    onClick={() => setActiveTab('ALL')}
                    className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'ALL'
                        ? 'bg-surface text-primary font-semibold shadow-xs border border-border'
                        : 'text-text-secondary hover:text-text-primary'
                      }`}
                  >
                    All Mobiles
                    <Badge variant={activeTab === 'ALL' ? 'primary' : 'neutral'} size="sm">
                      {allCount}
                    </Badge>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('NEW')}
                    className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'NEW'
                        ? 'bg-surface text-primary font-semibold shadow-xs border border-border'
                        : 'text-text-secondary hover:text-text-primary'
                      }`}
                  >
                    New Mobiles
                    <Badge variant={activeTab === 'NEW' ? 'success' : 'neutral'} size="sm">
                      {newCount}
                    </Badge>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('USED')}
                    className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'USED'
                        ? 'bg-surface text-primary font-semibold shadow-xs border border-border'
                        : 'text-text-secondary hover:text-text-primary'
                      }`}

                  >
                    Used Mobiles
                    <Badge variant={activeTab === 'USED' ? 'warning' : 'neutral'} size="sm">
                      {usedCount}
                    </Badge>
                  </button>

                  {/* Future Keypad Category Extension Placeholder (Visually clear, non-functional) */}
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-text-muted bg-surface/50 border border-border/40 rounded-md cursor-not-allowed select-none"
                    title="Keypad category classification is scheduled for a future schema update"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-border"></span>
                    Keypad Classification: Pending
                  </span>
                </div>

                {/* Print & PDF Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Printer className="w-4 h-4 text-primary" />}
                    onClick={handlePrintFilteredList}
                    disabled={filteredItems.length === 0 || isLoading}
                    className="shadow-xs cursor-pointer"
                    title={filteredItems.length === 0 ? 'No matching handsets to print' : `Print A4 report (${filteredItems.length} records)`}
                  >
                    Print A4
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                    onClick={() => void handleDownloadFilteredPdf()}
                    disabled={filteredItems.length === 0 || isLoading || isExporting}
                    className="shadow-xs cursor-pointer"
                    title={filteredItems.length === 0 ? 'No matching handsets to export' : `Export A4 PDF (${filteredItems.length} records)`}
                  >
                    {isExporting ? 'Exporting…' : 'Export PDF'}
                  </Button>
                </div>
              </div>

              {/* Row 2: Search Input, PTA Filter, Purchase Date Presets, and Custom Range */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center pt-2 border-t border-border/60">
                {/* Search Input */}
                <div className="md:col-span-4 relative">
                  <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search Brand, Model, IMEI, Seller, Voucher..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-sm bg-surface text-text-primary placeholder:text-text-muted border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
                  />
                </div>

                {/* PTA Filter */}
                <div className="md:col-span-2">
                  <select
                    value={ptaFilter}
                    onChange={(e) => setPtaFilter(e.target.value)}
                    aria-label="Filter by PTA Registration Status"
                    className="w-full px-3 py-1.5 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring cursor-pointer"
                  >
                    <option value="ALL">All PTA Statuses</option>
                    <option value="PTA_APPROVED">PTA Approved</option>
                    <option value="NON_PTA">Non-PTA</option>
                    <option value="JV">JV</option>
                    <option value="GEVEY">Gevey</option>
                  </select>
                </div>

                {/* Purchase Date Preset */}
                <div className="md:col-span-3">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-text-muted shrink-0" />
                    <select
                      value={datePreset}
                      onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                      aria-label="Filter by Purchase Date"
                      className="w-full px-3 py-1.5 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring cursor-pointer"
                    >
                      <option value="ALL">Purchase Date: All Time</option>
                      <option value="TODAY">Today</option>
                      <option value="THIS_WEEK">This Week (Mon–Today)</option>
                      <option value="PREV_WEEK">Previous Week (Mon–Sun)</option>
                      <option value="THIS_MONTH">This Month</option>
                      <option value="PREV_MONTH">Previous Month</option>
                      <option value="CUSTOM">Custom Range…</option>
                    </select>
                  </div>
                </div>

                {/* Reset Filters Action */}
                <div className="md:col-span-3 flex items-center justify-end gap-2">
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                      onClick={resetAllFilters}
                      className="text-text-secondary hover:text-text-primary text-xs cursor-pointer"
                      title="Reset all search, PTA, and date filters"
                    >
                      Reset All
                    </Button>
                  )}
                  <span className="text-xs font-semibold text-text-secondary px-2 py-1 bg-surface-hover rounded border border-border/40 whitespace-nowrap">
                    {filteredItems.length} matching
                  </span>
                </div>
              </div>

              {/* Row 3: Custom Date Range Pickers (shown when datePreset === 'CUSTOM') */}
              {datePreset === 'CUSTOM' && (
                <div className="flex flex-wrap items-center gap-3 p-2.5 bg-surface-hover/50 rounded-lg border border-border text-xs">
                  <span className="font-semibold text-text-secondary flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    Custom Acquisition Date:
                  </span>
                  <div className="flex items-center gap-2">
                    <label htmlFor="inv-custom-start" className="text-text-muted">From:</label>
                    <input
                      id="inv-custom-start"
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="px-2 py-1 text-xs bg-surface text-text-primary border border-border rounded focus:outline-none focus:ring-1 focus:ring-focus-ring cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="inv-custom-end" className="text-text-muted">To:</label>
                    <input
                      id="inv-custom-end"
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="px-2 py-1 text-xs bg-surface text-text-primary border border-border rounded focus:outline-none focus:ring-1 focus:ring-focus-ring cursor-pointer"
                    />
                  </div>
                  {(customStartDate || customEndDate) && (
                    <button
                      type="button"
                      onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
                      className="text-text-muted hover:text-text-primary underline cursor-pointer ml-1"
                    >
                      Clear Range
                    </button>
                  )}
                </div>
              )}
            </Card>

            {/* Inventory Table Layout */}
            {filteredItems.length > 0 ? (
              <div className="bg-surface rounded-lg border border-border shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-hover/80 text-text-secondary text-xs uppercase font-semibold border-b border-border">
                      <tr>
                        <th className="py-3 px-4">Device / Model</th>
                        <th className="py-3 px-4">Condition</th>
                        <th className="py-3 px-4">Specs & Color</th>
                        <th className="py-3 px-4">IMEI Identifier</th>
                        <th className="py-3 px-4">PTA Status</th>
                        <th className="py-3 px-4 text-center">Purchase Date</th>
                        <th className="py-3 px-4 text-right">Cost (Rs)</th>
                        <th className="py-3 px-4 text-right">Sale Price (Rs)</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredItems.map((item) => {
                        const effectiveDate = item.purchaseDate || (item.condition === 'NEW' ? item.createdAt.slice(0, 10) : null);
                        return (
                          <tr
                            key={item.id}
                            onDoubleClick={() => {
                              navigate(`/dashboard/shop-admin/mobiles/sale?deviceId=${encodeURIComponent(item.id)}&imei=${encodeURIComponent(item.imei1)}`);
                            }}
                            title="Double-click to sell this handset in Mobile POS"
                            className="hover:bg-primary/5 cursor-pointer transition-colors group select-none"
                          >
                            {/* Device / Model */}
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-text-primary">{item.brand} {item.model}</div>
                              {item.voucherNo && (
                                <div className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                                  <FileText className="w-3 h-3 text-primary" />
                                  <span>Voucher #{item.voucherNo}</span>
                                  {item.sellerName && (
                                    <span className="text-text-secondary">({item.sellerName})</span>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Condition */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {item.condition === 'NEW' ? (
                                <Badge variant="success" size="sm">
                                  New (Boxed)
                                </Badge>
                              ) : (
                                <Badge variant="warning" size="sm">
                                  Used (Pre-Owned)
                                </Badge>
                              )}
                            </td>

                            {/* Specs & Color */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="text-text-primary font-medium">{item.storage} / {item.ram} RAM</div>
                              <div className="text-xs text-text-muted">{item.color}</div>
                            </td>

                            {/* IMEI Identifier */}
                            <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs text-text-primary">
                              {item.imei1}
                            </td>

                            {/* PTA Status */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {item.ptaStatus === 'PTA_APPROVED' ? (
                                <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  PTA Approved
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-warning font-medium">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  {item.ptaStatus}
                                </span>
                              )}
                            </td>

                            {/* Purchase Date */}
                            <td className="py-3.5 px-4 text-center whitespace-nowrap text-xs text-text-secondary">
                              {effectiveDate || '—'}
                            </td>

                            {/* Purchase Cost */}
                            <td className="py-3.5 px-4 text-right font-medium text-text-secondary whitespace-nowrap">
                              Rs. {item.purchaseCost.toLocaleString()}
                            </td>

                            {/* Sale Price */}
                            <td className="py-3.5 px-4 text-right font-semibold text-primary whitespace-nowrap">
                              Rs. {item.salePrice.toLocaleString()}
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              <Badge variant="primary" size="sm" dot>
                                In Stock
                              </Badge>
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setSelectedDeviceId(item.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded transition-colors cursor-pointer"
                                title="View details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Directory Footer Info */}
                <div className="px-4 py-3 bg-surface-hover/40 border-t border-border flex flex-col sm:flex-row items-center justify-between text-xs text-text-muted gap-2">
                  <span>
                    Showing {filteredItems.length} of {items.length} in-stock handsets {hasActiveFilters && '(filters applied)'}
                  </span>
                  <span className="text-text-secondary">
                    Serialized device records are decoupled from regular spare parts inventory.
                  </span>
                </div>
              </div>
            ) : (
              /* Empty State */
              <Card variant="default" padding="lg" className="text-center py-16 bg-surface border-border">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Smartphone className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-1">
                  No in-stock mobile phones found
                </h3>
                <p className="text-sm text-text-muted max-w-md mx-auto mb-6">
                  {hasActiveFilters
                    ? 'No mobile records match your current filter criteria. Try clearing filters or adjusting your date range.'
                    : 'Start logging your smartphone stock. New units and used devices with purchase paperwork affidavits will appear here.'}
                </p>
                <div className="flex items-center justify-center gap-3">
                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetAllFilters}
                    >
                      Clear All Filters
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={() => navigate('/dashboard/shop-admin/mobiles/add')}
                  >
                    Add Mobile
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Mobile detail modal */}
      {selectedDeviceId && (
        <MobileDetailModal
          deviceId={selectedDeviceId}
          branchId={branchId}
          onClose={() => setSelectedDeviceId(null)}
          onEdit={isOrgAdmin ? (id) => { setSelectedDeviceId(null); setEditDeviceId(id); } : undefined}
          onPrint={handlePrint}
          onDownloadPdf={(p) => { void handleDownloadPdf(p); }}
        />
      )}
      {/* Edit modal — organization-admin only */}
      {isOrgAdmin && editDeviceId && (
        <EditMobileModal
          deviceId={editDeviceId}
          branchId={branchId}
          onClose={() => setEditDeviceId(null)}
          onSaved={() => { setEditDeviceId(null); void fetchMobiles(); }}
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
};
