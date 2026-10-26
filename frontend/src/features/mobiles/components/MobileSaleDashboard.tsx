'use client';

/**
 * MobileSaleDashboard — Frontend Preview Workspace
 *
 * ⚠️  FRONTEND PREVIEW — Sale Processing Not Connected ⚠️
 *
 * This page is a frontend-only preview. It does NOT:
 *  - POST to any sale endpoint
 *  - Update mobile_devices.status to SOLD
 *  - Create invoices, receipts, or payment records
 *  - Modify stock, cash sessions, or customer ledgers
 *
 * Backend sale integration will be authorised and implemented in a
 * separate phase. No persisted sale records are created here.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, Link } from 'react-router-dom';
// Note: Lucide icons imported below; react-router and react are the only external deps needed here.
import {
  Smartphone,
  Search,
  ShieldCheck,
  AlertTriangle,
  Plus,
  Trash2,
  UserCircle2,
  X,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ShoppingCart,
  Tag,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { Button, Badge, Card } from '@/components/ui';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { mobileApi } from '../services/mobile.api';
import type { MobileDeviceRow } from '../services/mobile.api';
import { customerApi } from '@/services/customer.api';
import type { DBCustomer } from '@/types/db.types';

// ─────────────────────────────────────────────────────────────────────────────
// Local view-model types (frontend-only, no backend contract)
// ─────────────────────────────────────────────────────────────────────────────

interface CartItem {
  device: MobileDeviceRow;
  salePrice: number;
  discount: number;
}

type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'JAZZCASH' | 'EASYPAISA';

interface SaleCustomerLocal {
  id: string;
  name: string;
  phone?: string;
  mobile?: string;
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CARD: 'Card / POS',
  BANK_TRANSFER: 'Bank Transfer',
  JAZZCASH: 'JazzCash',
  EASYPAISA: 'EasyPaisa',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtPKR(value: number): string {
  return `Rs. ${value.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getPtaBadge(status: string) {
  if (status === 'PTA_APPROVED') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
        <ShieldCheck className="w-3.5 h-3.5" /> PTA Approved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-warning font-medium">
      <AlertTriangle className="w-3.5 h-3.5" /> {status}
    </span>
  );
}

function getStatusBadge(status: string) {
  if (status === 'IN_STOCK') return <Badge variant="success" size="sm">In Stock</Badge>;
  if (status === 'INSPECTION') return <Badge variant="warning" size="sm">Inspection</Badge>;
  if (status === 'SOLD') return <Badge variant="neutral" size="sm">Sold</Badge>;
  return <Badge variant="neutral" size="sm">{status}</Badge>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer search sub-component (decoupled from POS store)
// ─────────────────────────────────────────────────────────────────────────────

interface CustomerPickerProps {
  selected: SaleCustomerLocal | null;
  onSelect: (c: SaleCustomerLocal | null) => void;
}

const CustomerPicker: React.FC<CustomerPickerProps> = ({ selected, onSelect }) => {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<DBCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = term.trim();
    if (!q) { setResults([]); return; }
    setIsLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await customerApi.searchCustomers(q);
        setResults(res.data || []);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [term]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
        <div className="flex items-center gap-2">
          <UserCircle2 className="w-4 h-4 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold text-text-primary">{selected.name}</p>
            {(selected.phone || selected.mobile) && (
              <p className="text-xs text-text-muted">{selected.phone || selected.mobile}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="p-1 rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          title="Clear customer — revert to walk-in"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropRef}>
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          placeholder="Search customer by name or phone…"
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => { if (term.trim()) setOpen(true); }}
          className="w-full pl-8 pr-3 py-2 text-sm bg-surface text-text-primary placeholder:text-text-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-focus-ring"
        />
      </div>
      {open && term.trim().length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-surface border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {isLoading && (
            <div className="p-3 text-xs text-text-muted text-center flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
            </div>
          )}
          {!isLoading && results.length === 0 && (
            <div className="p-3 text-xs text-text-muted text-center">No customers found</div>
          )}
          {results.map((c) => (
            <button
              key={c.id || (c as any)._id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect({ id: c.id || (c as any)._id, name: c.name, phone: c.phone, mobile: c.mobile });
                setTerm('');
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-surface-hover transition-colors text-sm"
            >
              <span className="font-medium text-text-primary">{c.name}</span>
              {(c.phone || c.mobile) && (
                <span className="text-xs text-text-muted ml-2">{c.phone || c.mobile}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

// ─── Mobile module sub-navigation tabs ─────────────────────────────────────
const MOBILE_NAV_TABS = [
  { label: 'Inventory', href: '/dashboard/shop-admin/mobiles' },
  { label: 'Mobile Sale', href: '/dashboard/shop-admin/mobiles/sale' },
  { label: 'Sale History', href: '/dashboard/shop-admin/mobiles/sale-history' },
] as const;

export const MobileSaleDashboard: React.FC = () => {
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const isOrgAdmin = user?.role === 'ADMIN';
  const activeShop = useOrganizationStore((s) => s.activeShop);
  const activeShopId = useOrganizationStore((s) => s.activeShopId);
  const branchId = activeShopId || activeShop?._id || activeShop?.id || undefined;

  // ── Device search ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MobileDeviceRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<MobileDeviceRow | null>(null);

  // ── Cart ──
  const [cart, setCart] = useState<CartItem[]>([]);

  // ── Customer ──
  const [customer, setCustomer] = useState<SaleCustomerLocal | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [saleNotes, setSaleNotes] = useState('');

  // ── Review panel ──
  const [showReview, setShowReview] = useState(false);

  // ── Price validation errors ──
  const [priceErrors, setPriceErrors] = useState<Record<string, string>>({});

  // Debounced device search
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await mobileApi.getMobiles({
          branch_id: branchId,
          limit: 20,
        });
        // Client-side filter by brand/model/IMEI/serial
        const ql = q.toLowerCase();
        const filtered = (res.devices || []).filter((d) => {
          return (
            d.brand.toLowerCase().includes(ql) ||
            d.model.toLowerCase().includes(ql) ||
            (d.serial_number && d.serial_number.toLowerCase().includes(ql)) ||
            (d.imeis && d.imeis.some((i) => i.imei.includes(ql)))
          );
        });
        setSearchResults(filtered);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Failed to search devices');
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, branchId]);

  // ── Cart helpers ──
  const isInCart = useCallback(
    (deviceId: string) => cart.some((c) => c.device.id === deviceId),
    [cart]
  );

  const addToCart = useCallback(
    (device: MobileDeviceRow) => {
      if (isInCart(device.id)) return;
      if (device.status !== 'IN_STOCK') return; // only eligible devices
      setCart((prev) => [
        ...prev,
        {
          device,
          salePrice: parseFloat(device.expected_sale_price ?? '0') || 0,
          discount: 0,
        },
      ]);
      setSelectedDevice(null);
      setSearchQuery('');
    },
    [isInCart]
  );

  const removeFromCart = useCallback((deviceId: string) => {
    setCart((prev) => prev.filter((c) => c.device.id !== deviceId));
    setPriceErrors((prev) => {
      const next = { ...prev };
      delete next[deviceId];
      return next;
    });
  }, []);

  const updateCartItem = useCallback(
    (deviceId: string, field: 'salePrice' | 'discount', raw: string) => {
      const num = parseFloat(raw);
      const isValid = !isNaN(num) && num >= 0;

      setPriceErrors((prev) => {
        const next = { ...prev };
        if (!isValid) {
          next[`${deviceId}_${field}`] = `${field === 'discount' ? 'Discount' : 'Price'} must be a non-negative number`;
        } else {
          delete next[`${deviceId}_${field}`];
        }
        return next;
      });

      if (!isValid) return;

      setCart((prev) =>
        prev.map((item) => {
          if (item.device.id !== deviceId) return item;
          const updated: CartItem = field === 'salePrice'
            ? { ...item, salePrice: num }
            : { ...item, discount: num };
          // Discount cannot exceed sale price
          if (updated.discount > updated.salePrice) {
            setPriceErrors((e) => ({
              ...e,
              [`${deviceId}_discount`]: 'Discount cannot exceed sale price',
            }));
          } else {
            setPriceErrors((e) => {
              const n = { ...e };
              delete n[`${deviceId}_discount`];
              return n;
            });
          }
          return updated;
        })
      );
    },
    []
  );

  // ── Totals ──
  const subtotal = cart.reduce((acc, item) => acc + item.salePrice, 0);
  const totalDiscount = cart.reduce((acc, item) => acc + item.discount, 0);
  const grandTotal = subtotal - totalDiscount;

  const hasErrors = Object.keys(priceErrors).length > 0;

  const canReview = cart.length > 0 && !hasErrors;

  // ── Review action ──
  const handleReview = () => {
    if (!canReview) return;
    setShowReview(true);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Review Modal (frontend-only summary, no submission)
  // ─────────────────────────────────────────────────────────────────────────

  if (showReview) {
    return (
      <div className="flex flex-col gap-6 w-full max-w-3xl mx-auto pb-16 px-4 sm:px-6 pt-6">
        {/* Preview banner */}
        <div className="flex items-center gap-3 p-4 bg-warning/10 border border-warning/30 rounded-lg">
          <Info className="w-5 h-5 text-warning shrink-0" />
          <div>
            <p className="text-sm font-semibold text-warning">Frontend Preview — Sale Processing Not Connected</p>
            <p className="text-xs text-text-muted mt-0.5">
              This is a local review only. No sale record, invoice, or payment has been created.
              Backend sale integration will be authorised in a future phase.
            </p>
          </div>
        </div>

        {/* Review header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-text-primary">Sale Review</h2>
          <button
            type="button"
            onClick={() => setShowReview(false)}
            className="text-sm text-primary hover:underline"
          >
            ← Back to workspace
          </button>
        </div>

        {/* Customer */}
        <Card variant="default" padding="md" className="bg-surface border-border">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Customer</p>
          {customer ? (
            <div className="flex items-center gap-2">
              <UserCircle2 className="w-4 h-4 text-primary" />
              <span className="font-semibold text-text-primary">{customer.name}</span>
              {(customer.phone || customer.mobile) && (
                <span className="text-xs text-text-muted">{customer.phone || customer.mobile}</span>
              )}
            </div>
          ) : (
            <span className="text-sm text-text-muted italic">Walk-in customer</span>
          )}
        </Card>

        {/* Devices */}
        <Card variant="default" padding="md" className="bg-surface border-border">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Devices ({cart.length})
          </p>
          <div className="divide-y divide-border">
            {cart.map((item) => {
              const imei1 = item.device.imeis?.find((i) => i.slot === 'IMEI1')?.imei ?? '—';
              const imei2 = item.device.imeis?.find((i) => i.slot === 'IMEI2')?.imei;
              const lineTotal = item.salePrice - item.discount;
              return (
                <div key={item.device.id} className="py-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div>
                    <p className="font-semibold text-text-primary">{item.device.brand} {item.device.model}</p>
                    <p className="text-xs text-text-muted">{item.device.storage} / {item.device.ram} · {item.device.color}</p>
                    <p className="text-xs font-mono text-text-secondary">IMEI1: {imei1}{imei2 ? ` · IMEI2: ${imei2}` : ''}</p>
                    <div className="mt-1">{getStatusBadge(item.device.status)}</div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-text-secondary text-xs">Sale price: {fmtPKR(item.salePrice)}</p>
                    {item.discount > 0 && (
                      <p className="text-xs text-warning">Discount: −{fmtPKR(item.discount)}</p>
                    )}
                    <p className="font-bold text-primary">{fmtPKR(lineTotal)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Totals */}
        <Card variant="default" padding="md" className="bg-surface border-border">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-text-secondary">
              <span>Subtotal</span>
              <span>{fmtPKR(subtotal)}</span>
            </div>
            <div className="flex justify-between text-warning">
              <span>Total Discount</span>
              <span>−{fmtPKR(totalDiscount)}</span>
            </div>
            <div className="flex justify-between font-bold text-text-primary text-base border-t border-border pt-2">
              <span>Grand Total</span>
              <span className="text-primary">{fmtPKR(grandTotal)}</span>
            </div>
          </div>
        </Card>

        {/* Payment & Notes */}
        <Card variant="default" padding="md" className="bg-surface border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Payment Method</span>
            <span className="font-semibold text-text-primary">{PAYMENT_METHOD_LABELS[paymentMethod]}</span>
          </div>
          {saleNotes && (
            <div className="mt-2 pt-2 border-t border-border">
              <p className="text-xs text-text-muted">Notes: {saleNotes}</p>
            </div>
          )}
        </Card>

        {/* Action */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="w-full p-4 bg-surface-hover border border-border/60 rounded-lg text-center">
            <p className="text-sm font-semibold text-text-secondary mb-1">
              ⚠️ Sale Submission Disabled
            </p>
            <p className="text-xs text-text-muted max-w-sm mx-auto">
              Backend sale processing is not yet connected. This preview confirms the sale details only.
              No data has been saved, no status changed, no invoice created.
            </p>
          </div>
          <Button
            variant="outline"
            size="md"
            onClick={() => setShowReview(false)}
          >
            ← Edit Sale Details
          </Button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main workspace
  // ─────────────────────────────────────────────────────────────────────────

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
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
              Mobile Sale
            </h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Select devices from inventory, prepare the sale cart, and review before submitting.
            </p>
          </div>
        </div>

        {/* Preview badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-warning/10 border border-warning/30 rounded-lg self-start sm:self-auto">
          <Info className="w-4 h-4 text-warning shrink-0" />
          <span className="text-xs font-semibold text-warning">Frontend Preview — Sale Processing Not Connected</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left panel: Device search ── */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Device search */}
          <Card variant="default" padding="md" className="bg-surface border-border">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Search & Select Device
            </p>
            <div className="relative">
              <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Brand, model, IMEI, serial number…"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSelectedDevice(null); }}
                className="w-full pl-9 pr-3 py-2 text-sm bg-surface text-text-primary placeholder:text-text-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
            </div>

            {/* Search results */}
            {isSearching && (
              <div className="flex items-center gap-2 text-text-muted text-sm mt-3">
                <Loader2 className="w-4 h-4 animate-spin" /> Searching devices…
              </div>
            )}
            {searchError && (
              <div className="flex items-center gap-2 text-danger text-sm mt-3">
                <AlertCircle className="w-4 h-4 shrink-0" /> {searchError}
              </div>
            )}
            {!isSearching && searchQuery.trim() && searchResults.length === 0 && !searchError && (
              <p className="text-sm text-text-muted mt-3">No devices matched your search.</p>
            )}

            {searchResults.length > 0 && (
              <div className="mt-3 divide-y divide-border border border-border rounded-lg overflow-hidden">
                {searchResults.map((device) => {
                  const imei1 = device.imeis?.find((i) => i.slot === 'IMEI1')?.imei ?? '—';
                  const imei2 = device.imeis?.find((i) => i.slot === 'IMEI2')?.imei;
                  const inCart = isInCart(device.id);
                  const eligible = device.status === 'IN_STOCK';
                  const isSelected = selectedDevice?.id === device.id;

                  return (
                    <div
                      key={device.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 py-2.5 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-primary/5 border-l-2 border-primary'
                          : 'hover:bg-surface-hover'
                      } ${!eligible || inCart ? 'opacity-60' : ''}`}
                      onClick={() => eligible && !inCart && setSelectedDevice(isSelected ? null : device)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-text-primary">{device.brand} {device.model}</span>
                          <Badge variant={device.condition === 'NEW' ? 'success' : 'warning'} size="sm">
                            {device.condition === 'NEW' ? 'New' : 'Used'}
                          </Badge>
                          {getStatusBadge(device.status)}
                        </div>
                        <div className="text-xs text-text-muted mt-0.5">
                          {device.storage} / {device.ram} · {device.color} · IMEI1: <span className="font-mono">{imei1}</span>
                          {imei2 && <> · IMEI2: <span className="font-mono">{imei2}</span></>}
                        </div>
                        <div className="mt-0.5">{getPtaBadge(device.pta_status)}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          {isOrgAdmin && (
                            <p className="text-xs text-text-muted">
                              Cost: {fmtPKR(parseFloat(device.cost_price) || 0)}
                              </p>
                              )}
                              <p className="text-sm font-bold text-primary">{fmtPKR(parseFloat(device.expected_sale_price ?? '0') || 0)}</p>
                        </div>
                        <Button
                          variant={inCart ? 'outline' : 'primary'}
                          size="sm"
                          disabled={!eligible || inCart}
                          onClick={(e) => { e.stopPropagation(); addToCart(device); }}
                          leftIcon={inCart ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        >
                          {inCart ? 'Added' : 'Add to Cart'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Selected device detail panel */}
          {selectedDevice && (
            <Card variant="default" padding="md" className="bg-surface border-border">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Device Details</p>
                <button
                  type="button"
                  onClick={() => setSelectedDevice(null)}
                  className="p-1 text-text-muted hover:text-text-primary rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {([
                  ['Brand', selectedDevice.brand],
                  ['Model', selectedDevice.model],
                  ['Storage', selectedDevice.storage],
                  ['RAM', selectedDevice.ram],
                  ['Color', selectedDevice.color],
                  ['Condition', selectedDevice.condition === 'NEW' ? 'New (Boxed)' : 'Used (Pre-Owned)'],
                  ['IMEI 1', selectedDevice.imeis?.find((i) => i.slot === 'IMEI1')?.imei ?? '—'],
                  ['IMEI 2', selectedDevice.imeis?.find((i) => i.slot === 'IMEI2')?.imei ?? '—'],
                  ['Serial No.', selectedDevice.serial_number ?? '—'],
                  ['PTA Status', selectedDevice.pta_status],
                  ['Branch', selectedDevice.branch_name ?? selectedDevice.branch_code ?? '—'],
                  ...(isOrgAdmin ? [['Cost Price', fmtPKR(parseFloat(selectedDevice.cost_price) || 0)]] : []),
                  ['Expected Sale Price', fmtPKR(parseFloat(selectedDevice.expected_sale_price ?? '0') || 0)],
                ] as [string, string][])
                  .map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs text-text-muted font-medium">{label}</p>
                      <p className="font-medium text-text-primary truncate">{value}</p>
                    </div>
                  ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!selectedDevice || selectedDevice.status !== 'IN_STOCK' || isInCart(selectedDevice.id)}
                  onClick={() => addToCart(selectedDevice)}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                >
                  Add to Cart
                </Button>
              </div>
            </Card>
          )}

          {/* Cart */}
          <Card variant="default" padding="md" className="bg-surface border-border">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Cart ({cart.length} device{cart.length !== 1 ? 's' : ''})
            </p>

            {cart.length === 0 ? (
              <div className="text-center py-8 text-text-muted">
                <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No devices added yet. Search above to add a device.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {cart.map((item) => {
                  const imei1 = item.device.imeis?.find((i) => i.slot === 'IMEI1')?.imei ?? '—';
                  const imei2 = item.device.imeis?.find((i) => i.slot === 'IMEI2')?.imei;
                  const lineTotal = item.salePrice - item.discount;
                  const salePriceErr = priceErrors[`${item.device.id}_salePrice`];
                  const discountErr = priceErrors[`${item.device.id}_discount`];

                  return (
                    <div key={item.device.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-text-primary">
                            {item.device.brand} {item.device.model}
                          </p>
                          <p className="text-xs text-text-muted">
                            {item.device.storage} / {item.device.ram} · {item.device.color}
                          </p>
                          <p className="text-xs font-mono text-text-secondary">
                            IMEI1: {imei1}
                            {imei2 && <> · IMEI2: {imei2}</>}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Badge variant={item.device.condition === 'NEW' ? 'success' : 'warning'} size="sm">
                              {item.device.condition === 'NEW' ? 'New' : 'Used'}
                            </Badge>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.device.id)}
                          className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors shrink-0"
                          title="Remove from cart"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Price inputs */}
                      <div className="mt-2.5 grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-text-secondary font-medium block mb-1">
                            Sale Price (Rs.)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={item.salePrice}
                            onChange={(e) => updateCartItem(item.device.id, 'salePrice', e.target.value)}
                            className={`w-full px-2.5 py-1.5 text-sm border rounded-md bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-focus-ring ${salePriceErr ? 'border-danger' : 'border-border'}`}
                          />
                          {salePriceErr && <p className="text-xs text-danger mt-0.5">{salePriceErr}</p>}
                        </div>
                        <div>
                          <label className="text-xs text-text-secondary font-medium block mb-1">
                            Discount (Rs.)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={item.discount}
                            onChange={(e) => updateCartItem(item.device.id, 'discount', e.target.value)}
                            className={`w-full px-2.5 py-1.5 text-sm border rounded-md bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-focus-ring ${discountErr ? 'border-danger' : 'border-border'}`}
                          />
                          {discountErr && <p className="text-xs text-danger mt-0.5">{discountErr}</p>}
                        </div>
                      </div>
                      <div className="flex justify-end mt-1.5">
                        <span className="text-sm font-bold text-primary">
                          Subtotal: {fmtPKR(lineTotal)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* ── Right panel: Customer + Totals + Action ── */}
        <div className="flex flex-col gap-4">
          {/* Customer */}
          <Card variant="default" padding="md" className="bg-surface border-border">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Customer
            </p>
            <CustomerPicker selected={customer} onSelect={setCustomer} />
            {!customer && (
              <p className="text-xs text-text-muted mt-2">
                No customer selected — will be recorded as <strong>Walk-in</strong>.
              </p>
            )}
          </Card>

          {/* Payment Method */}
          <Card variant="default" padding="md" className="bg-surface border-border">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Payment Method
            </p>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-focus-ring"
            >
              {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <p className="text-xs text-text-muted mt-1.5">
              Credit/partial-payment allocation requires backend integration (pending).
            </p>
          </Card>

          {/* Notes */}
          <Card variant="default" padding="md" className="bg-surface border-border">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Sale Notes (optional)
            </p>
            <textarea
              rows={2}
              value={saleNotes}
              onChange={(e) => setSaleNotes(e.target.value)}
              placeholder="Optional notes for this sale…"
              className="w-full px-3 py-2 text-sm bg-surface text-text-primary placeholder:text-text-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-focus-ring resize-none"
            />
          </Card>

          {/* Sale summary totals */}
          <Card variant="default" padding="md" className="bg-surface border-border">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Sale Summary
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>Items</span>
                <span>{cart.length}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Subtotal</span>
                <span>{fmtPKR(subtotal)}</span>
              </div>
              <div className="flex justify-between text-warning">
                <span>Discount</span>
                <span>−{fmtPKR(totalDiscount)}</span>
              </div>
              <div className="flex justify-between font-bold text-text-primary text-base border-t border-border pt-2">
                <span>Grand Total</span>
                <span className="text-primary">{fmtPKR(grandTotal)}</span>
              </div>
            </div>
          </Card>

          {/* Review action */}
          <Button
            variant="primary"
            size="md"
            className="w-full font-semibold shadow-sm"
            disabled={!canReview}
            onClick={handleReview}
            leftIcon={<CheckCircle2 className="w-4 h-4" />}
          >
            Review Sale
          </Button>

          {cart.length === 0 && (
            <p className="text-xs text-text-muted text-center">
              Add at least one in-stock device to proceed.
            </p>
          )}
          {hasErrors && cart.length > 0 && (
            <p className="text-xs text-danger text-center">
              Fix pricing errors above before reviewing.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
