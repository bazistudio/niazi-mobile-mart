'use client';

/**
 * MobileSaleHistoryDashboard — Frontend Preview
 *
 * ⚠️  FRONTEND PREVIEW — Sale History Not Connected ⚠️
 *
 * No mobile-sale-history endpoint exists yet. This page renders a clearly-
 * labelled preview adapter with typed sample records so the UI can be
 * reviewed and iterated on before backend integration.
 *
 * The adapter is isolated in the PREVIEW_ADAPTER section below. Replace it
 * with a real API call when the backend sale-history endpoint is authorised.
 *
 * Rules:
 *  - Sample records are never mixed with real persisted data.
 *  - No records are written to any database.
 *  - Timestamps are fabricated for preview purposes only and are labelled as such.
 */

import React, { useState, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  History,
  Search,
  AlertTriangle,
  Info,
  ShieldCheck,
  Calendar,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Badge, Card, Button } from '@/components/ui';

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW ADAPTER — replace with real API call when backend is ready
// ─────────────────────────────────────────────────────────────────────────────

/** Frontend-only view model for a sale history row. */
interface SaleHistoryRecord {
  /** Stable key — preview only, not a real sale ID */
  previewId: string;
  /** ISO datetime string — fabricated for preview */
  saleDateTime: string;
  brand: string;
  model: string;
  storage: string;
  ram: string;
  color: string;
  condition: 'NEW' | 'USED';
  imei1: string;
  imei2?: string;
  ptaStatus: string;
  branch: string;
  customerName: string | null;
  salePrice: number;
  discount: number;
  grandTotal: number;
  paymentMethod: string;
}

/**
 * PREVIEW_ADAPTER
 *
 * Typed sample records used only while the real sale-history endpoint is
 * unavailable. Each record is clearly marked as preview data in the UI.
 *
 * To replace: delete this array and swap the `usePreviewData()` hook below
 * with a real `useQuery(queryKeys.mobileSales.history(...), ...)` call.
 */
const PREVIEW_SAMPLE_RECORDS: SaleHistoryRecord[] = [
  {
    previewId: 'preview-001',
    saleDateTime: '2024-10-15T11:32:00+05:00',
    brand: 'Samsung',
    model: 'Galaxy A55',
    storage: '256GB',
    ram: '8GB',
    color: 'Awesome Navy',
    condition: 'NEW',
    imei1: '356938035643809',
    imei2: '356938035643817',
    ptaStatus: 'PTA_APPROVED',
    branch: 'Main Branch',
    customerName: 'Ahmed Raza',
    salePrice: 85000,
    discount: 2000,
    grandTotal: 83000,
    paymentMethod: 'Cash',
  },
  {
    previewId: 'preview-002',
    saleDateTime: '2024-10-14T14:18:00+05:00',
    brand: 'iPhone',
    model: '15 Pro',
    storage: '128GB',
    ram: '8GB',
    color: 'Natural Titanium',
    condition: 'USED',
    imei1: '353479100523456',
    ptaStatus: 'NON_PTA',
    branch: 'Main Branch',
    customerName: null,
    salePrice: 320000,
    discount: 0,
    grandTotal: 320000,
    paymentMethod: 'Bank Transfer',
  },
  {
    previewId: 'preview-003',
    saleDateTime: '2024-10-13T09:55:00+05:00',
    brand: 'Xiaomi',
    model: 'Redmi Note 13',
    storage: '128GB',
    ram: '6GB',
    color: 'Midnight Black',
    condition: 'NEW',
    imei1: '869765034123490',
    imei2: '869765034123508',
    ptaStatus: 'PTA_APPROVED',
    branch: 'Main Branch',
    customerName: 'Fatima Malik',
    salePrice: 42000,
    discount: 500,
    grandTotal: 41500,
    paymentMethod: 'Cash',
  },
  {
    previewId: 'preview-004',
    saleDateTime: '2024-10-12T16:40:00+05:00',
    brand: 'Realme',
    model: 'C65',
    storage: '64GB',
    ram: '4GB',
    color: 'Star Trail Gold',
    condition: 'NEW',
    imei1: '354821076543210',
    ptaStatus: 'JV',
    branch: 'Main Branch',
    customerName: 'Usman Tariq',
    salePrice: 28500,
    discount: 0,
    grandTotal: 28500,
    paymentMethod: 'Cash',
  },
  {
    previewId: 'preview-005',
    saleDateTime: '2024-10-11T13:05:00+05:00',
    brand: 'OPPO',
    model: 'A98',
    storage: '256GB',
    ram: '8GB',
    color: 'Cool Black',
    condition: 'USED',
    imei1: '863752050123456',
    ptaStatus: 'PTA_APPROVED',
    branch: 'Main Branch',
    customerName: 'Sara Khan',
    salePrice: 65000,
    discount: 3000,
    grandTotal: 62000,
    paymentMethod: 'JazzCash',
  },
];

/** Hook that returns preview records. Replace with a real useQuery when API exists. */
function usePreviewData() {
  return {
    records: PREVIEW_SAMPLE_RECORDS,
    isPreview: true,
    isLoading: false,
    error: null as string | null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtPKR(value: number): string {
  return `Rs. ${value.toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function fmtDateTime(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-PK', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
    const time = d.toLocaleTimeString('en-PK', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return { date, time };
  } catch {
    return { date: '—', time: '—' };
  }
}

function getPtaBadge(status: string) {
  if (status === 'PTA_APPROVED') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success font-medium whitespace-nowrap">
        <ShieldCheck className="w-3 h-3" /> PTA
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-warning font-medium whitespace-nowrap">
      <AlertTriangle className="w-3 h-3" /> {status}
    </span>
  );
}

const PAGE_SIZE = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

// ─── Mobile module sub-navigation tabs ─────────────────────────────────────
const MOBILE_NAV_TABS = [
  { label: 'Inventory', href: '/dashboard/shop-admin/mobiles' },
  { label: 'Mobile Sale', href: '/dashboard/shop-admin/mobiles/sale' },
  { label: 'Sale History', href: '/dashboard/shop-admin/mobiles/sale-history' },
] as const;

export const MobileSaleHistoryDashboard: React.FC = () => {
  const { pathname } = useLocation();
  const { records, isPreview, isLoading, error } = usePreviewData();

  // ── Filters ──
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCondition, setFilterCondition] = useState<'ALL' | 'NEW' | 'USED'>('ALL');
  const [filterPayment, setFilterPayment] = useState('ALL');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const paymentMethods = useMemo(() => {
    const methods = new Set(records.map((r) => r.paymentMethod));
    return Array.from(methods).sort();
  }, [records]);

  // ── Filtered data ──
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((r) => {
      const matchSearch =
        !q ||
        r.brand.toLowerCase().includes(q) ||
        r.model.toLowerCase().includes(q) ||
        r.imei1.includes(q) ||
        (r.imei2 && r.imei2.includes(q)) ||
        (r.customerName && r.customerName.toLowerCase().includes(q));

      const matchCondition = filterCondition === 'ALL' || r.condition === filterCondition;
      const matchPayment = filterPayment === 'ALL' || r.paymentMethod === filterPayment;

      const saleDate = r.saleDateTime.slice(0, 10);
      const matchFrom = !filterDateFrom || saleDate >= filterDateFrom;
      const matchTo = !filterDateTo || saleDate <= filterDateTo;

      return matchSearch && matchCondition && matchPayment && matchFrom && matchTo;
    });
  }, [records, searchQuery, filterCondition, filterPayment, filterDateFrom, filterDateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterCondition('ALL');
    setFilterPayment('ALL');
    setFilterDateFrom('');
    setFilterDateTo('');
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchQuery.trim() ||
    filterCondition !== 'ALL' ||
    filterPayment !== 'ALL' ||
    filterDateFrom ||
    filterDateTo;

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-16 px-4 sm:px-6">
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
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
              Sale History
            </h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Mobile device sales record — searchable and filterable.
            </p>
          </div>
        </div>

        {/* Preview badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-warning/10 border border-warning/30 rounded-lg self-start sm:self-auto">
          <Info className="w-4 h-4 text-warning shrink-0" />
          <span className="text-xs font-semibold text-warning">Frontend Preview — History Not Connected</span>
        </div>
      </div>

      {/* Preview notice */}
      {isPreview && (
        <div className="flex items-start gap-3 p-4 bg-warning/10 border border-warning/30 rounded-lg">
          <Info className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-warning mb-1">
              Frontend Preview — Sample Data Only
            </p>
            <p className="text-xs text-text-muted">
              No mobile sale-history endpoint is connected yet. The rows below are typed sample
              records for UI review purposes only. They do not represent real company sales, real
              devices, real customers, or real financial transactions. Backend integration will be
              authorised in a future phase.
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Filters */}
      <Card variant="default" padding="md" className="bg-surface border-border">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-text-secondary" />
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Filters
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 text-xs text-text-muted hover:text-danger transition-colors"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Brand, model, IMEI, customer…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-8 pr-3 py-2 text-sm bg-surface text-text-primary placeholder:text-text-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
          </div>

          {/* Condition */}
          <select
            value={filterCondition}
            onChange={(e) => { setFilterCondition(e.target.value as 'ALL' | 'NEW' | 'USED'); setCurrentPage(1); }}
            className="px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            <option value="ALL">All conditions</option>
            <option value="NEW">New</option>
            <option value="USED">Used</option>
          </select>

          {/* Payment */}
          <select
            value={filterPayment}
            onChange={(e) => { setFilterPayment(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            <option value="ALL">All payment methods</option>
            {paymentMethods.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setCurrentPage(1); }}
              className="flex-1 min-w-0 px-2 py-2 text-xs bg-surface text-text-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-focus-ring"
              title="From date"
            />
            <span className="text-text-muted text-xs">–</span>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setCurrentPage(1); }}
              className="flex-1 min-w-0 px-2 py-2 text-xs bg-surface text-text-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-focus-ring"
              title="To date"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <div className="bg-surface rounded-lg border border-border shadow-xs overflow-hidden">
        {/* Table header summary */}
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <p className="text-xs text-text-muted">
            Showing <strong className="text-text-primary">{filtered.length}</strong> sale{filtered.length !== 1 ? 's' : ''}
            {isPreview && (
              <span className="ml-2 px-1.5 py-0.5 bg-warning/10 text-warning text-xs rounded font-medium">
                Sample Data
              </span>
            )}
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-text-muted text-sm">Loading sale history…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 px-4">
            <History className="w-10 h-10 mx-auto mb-3 text-text-muted opacity-30" />
            <p className="font-semibold text-text-primary mb-1">No sales found</p>
            {hasActiveFilters ? (
              <p className="text-sm text-text-muted mb-4">
                No records match your current filters. Try adjusting the search or date range.
              </p>
            ) : (
              <p className="text-sm text-text-muted mb-4">
                Sale history will appear here once mobile sales are processed and the backend
                integration is connected.
              </p>
            )}
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-surface-hover border-b border-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap">
                    Date &amp; Time
                    {isPreview && <span className="ml-1 text-warning opacity-70">*</span>}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap">
                    Device
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap">
                    IMEI
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap">
                    Customer
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap">
                    Branch
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap">
                    Price
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap">
                    Discount
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap">
                    Total
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap">
                    Payment
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((row) => {
                  const { date, time } = fmtDateTime(row.saleDateTime);
                  return (
                    <tr
                      key={row.previewId}
                      className="hover:bg-surface-hover transition-colors"
                    >
                      {/* Date + Time — always together in one cell */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-medium text-text-primary">{date}</p>
                        <p className="text-xs text-text-muted">{time}</p>
                        {isPreview && (
                          <p className="text-[10px] text-warning mt-0.5 font-medium">preview</p>
                        )}
                      </td>

                      {/* Device */}
                      <td className="px-4 py-3">
                        <p className="font-semibold text-text-primary whitespace-nowrap">
                          {row.brand} {row.model}
                        </p>
                        <p className="text-xs text-text-muted whitespace-nowrap">
                          {row.storage} / {row.ram} · {row.color}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant={row.condition === 'NEW' ? 'success' : 'warning'} size="sm">
                            {row.condition === 'NEW' ? 'New' : 'Used'}
                          </Badge>
                          {getPtaBadge(row.ptaStatus)}
                        </div>
                      </td>

                      {/* IMEI */}
                      <td className="px-4 py-3">
                        <p className="text-xs font-mono text-text-secondary whitespace-nowrap">
                          {row.imei1}
                        </p>
                        {row.imei2 && (
                          <p className="text-xs font-mono text-text-muted whitespace-nowrap">
                            {row.imei2}
                          </p>
                        )}
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.customerName ? (
                          <p className="font-medium text-text-primary">{row.customerName}</p>
                        ) : (
                          <span className="italic text-text-muted text-xs">Walk-in</span>
                        )}
                      </td>

                      {/* Branch */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-text-secondary text-sm">{row.branch}</p>
                      </td>

                      {/* Price */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <p className="text-text-secondary">{fmtPKR(row.salePrice)}</p>
                      </td>

                      {/* Discount */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {row.discount > 0 ? (
                          <p className="text-warning font-medium">−{fmtPKR(row.discount)}</p>
                        ) : (
                          <p className="text-text-muted text-xs">—</p>
                        )}
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <p className="font-bold text-primary">{fmtPKR(row.grandTotal)}</p>
                      </td>

                      {/* Payment */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-text-secondary text-sm">{row.paymentMethod}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            Page {safePage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Preview footnote */}
      {isPreview && filtered.length > 0 && (
        <p className="text-xs text-text-muted text-center pb-2">
          * Dates and times in this table are fabricated for UI review only and do not represent
          real sales. This section is clearly labelled as a frontend preview throughout.
        </p>
      )}
    </div>
  );
};
