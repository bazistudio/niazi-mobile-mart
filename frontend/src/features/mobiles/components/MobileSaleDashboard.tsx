'use client';

/**
 * MobileSaleDashboard — On-Page Mobile Inventory POS & Multi-Payment Terminal
 * Follows the exact same layout & pattern as the working Products POS page:
 *  1. Top POS Header with Mobile Omnibox Search (mobiles ONLY show in dropdown after search/scan, never pre-listed in a grid)
 *  2. Left 8 Columns: Mobile POS Cart Table + Multi-Payment Split Checkout Summary
 *  3. Right 4 Columns: Customer Search + Customer Details Card + Live Customer Ledger Statement
 *
 * ⚠️  FRONTEND PREVIEW — Sale Processing Not Connected ⚠️
 *
 * This page is a frontend-only preview of the On-Page Mobile POS Terminal. It does NOT:
 *  - POST to any sale endpoint
 *  - Update mobile_devices.status to SOLD
 *  - Create invoices, receipts, or payment records
 *  - Modify stock, cash sessions, or customer ledgers (except standalone Receive Payment modal if used)
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
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
  ShoppingCart,
  RefreshCw,
  RotateCcw,
  Repeat,
  CreditCard,
  Printer,
  PauseCircle,
  Info,
  Eye,
  EyeOff,
  ArrowDownToLine,
  ArrowUpFromLine,
  Receipt,
  ExternalLink,
  ScanBarcode,
} from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { mobileApi } from '../services/mobile.api';
import type { MobileDeviceRow } from '../services/mobile.api';
import { customerApi } from '@/services/customer.api';
import type { DBCustomer } from '@/types/db.types';
import { useLedger } from '@/features/ledger/hooks/useLedger';
import { LedgerSettlementModal } from '@/features/pos/components/modals/LedgerSettlementModal';
import { DocumentService } from '@/features/pos/services/document/document.service';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { usePrintStore } from '@/lib/printer';
import { printFormatter } from '@/features/settings/printer/utils/printFormatter';
import { Building2, User, Phone, MapPin, ReceiptText, ShieldCheck as ShieldIcon, CreditCard as CardIcon } from 'lucide-react';
import { usePosStore } from '@/features/pos/store/usePosStore';
import toast from 'react-hot-toast';

// ─────────────────────────────────────────────────────────────────────────────
// Local view-model types (frontend-only, no backend contract)
// ─────────────────────────────────────────────────────────────────────────────

export type MobileItemBucket = 'SALE' | 'RETURN';

interface CartItem {
  device: MobileDeviceRow;
  salePrice: number;
  bucket: MobileItemBucket;
}

export type PaymentMethod =
  | 'CASH'
  | 'JAZZCASH'
  | 'EASYPAISA'
  | 'BANK_TRANSFER'
  | 'CARD'
  | 'CREDIT';

export interface SplitPaymentLine {
  id: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export type MobilePosMode = 'SALE' | 'RETURN' | 'REPLACE';

interface SaleCustomerLocal {
  id: string;
  name: string;
  phone?: string;
  mobile?: string;
  currentBalance: number;
  creditLimit: number;
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: '💵 Cash',
  JAZZCASH: '📱 JazzCash',
  EASYPAISA: '📲 EasyPaisa',
  BANK_TRANSFER: '🏦 Bank Transfer',
  CARD: '💳 Card / POS',
  CREDIT: '📒 Credit / Ledger',
};

const MOBILE_NAV_TABS = [
  { label: 'Inventory', href: '/dashboard/shop-admin/mobiles' },
  { label: 'Mobile Sale (POS)', href: '/dashboard/shop-admin/mobiles/sale' },
  { label: 'Sale History', href: '/dashboard/shop-admin/mobiles/sale-history' },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtPKR(value: number): string {
  return `Rs. ${value.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getPtaBadge(status: string) {
  if (status === 'PTA_APPROVED') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
        <ShieldCheck className="w-2.5 h-2.5" /> PTA
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
      <AlertTriangle className="w-2.5 h-2.5" /> {status.replace('_', ' ')}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main On-Page Mobile POS Component (Matches Products POS Pattern)
// ─────────────────────────────────────────────────────────────────────────────

export const MobileSaleDashboard: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canRevealCost =
    user?.role === 'ADMIN' ||
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'SHOP_ADMIN';

  const activeShop = useOrganizationStore((s) => s.activeShop);
  const activeShopId = useOrganizationStore((s) => s.activeShopId);
  const branchId = activeShopId || activeShop?._id || activeShop?.id || undefined;

  // ── POS Operational Mode: Regular Sale, Mobile Return, Mobile Replace ──
  const [posMode, setPosMode] = useState<MobilePosMode>('SALE');
  const [replaceBucket, setReplaceBucket] = useState<'RETURN' | 'SALE'>('RETURN');

  // ── Inventory Search State (Only shown in floating dropdown on search, never pre-listed) ──
  const [allDevices, setAllDevices] = useState<MobileDeviceRow[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [revealedCostId, setRevealedCostId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  // ── Cart State ──
  const [cart, setCart] = useState<CartItem[]>([]);
  const [priceErrors, setPriceErrors] = useState<Record<string, string>>({});
  const [lastAddedDeviceId, setLastAddedDeviceId] = useState<string | null>(null);
  const salePriceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Auto-focus and highlight/select Sale Price input immediately after adding a mobile to cart
  useEffect(() => {
    if (!lastAddedDeviceId) return;
    const timer = setTimeout(() => {
      const inputEl = salePriceInputRefs.current[lastAddedDeviceId];
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }
      setLastAddedDeviceId(null);
    }, 40);
    return () => clearTimeout(timer);
  }, [lastAddedDeviceId, cart]);

  // ── Customer & Ledger Panel State (Right 4 Columns, matching PosCustomerLedgerPanel) ──
  const [customer, setCustomer] = useState<SaleCustomerLocal | null>(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [isCustomerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerResults, setCustomerResults] = useState<DBCustomer[]>([]);
  const [isCustomersLoading, setIsCustomersLoading] = useState(false);
  const [customerSelectedIndex, setCustomerSelectedIndex] = useState(0);
  const [isSettlementModalOpen, setSettlementModalOpen] = useState(false);

  const customerInputRef = useRef<HTMLInputElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const customerSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Multi-Payment Split State ──
  const [payments, setPayments] = useState<SplitPaymentLine[]>([
    { id: 'pay-1', method: 'CASH', amount: 0 },
  ]);

  // ── Review & Return/Replace Modals ──
  const [saleNotes, setSaleNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedSaleResult, setCompletedSaleResult] = useState<any | null>(null);
  const { settings: printerSettings, shopHeader } = usePrinterStore();
  const openPrintPreview = usePrintStore((s) => s.openPreview);
  const [showReview, setShowReview] = useState(false);
  const [actionNoticeModal, setActionNoticeModal] = useState<{
    open: boolean;
    title: string;
    mode: 'RETURN' | 'REPLACE';
    referenceInvoice: string;
    reason: string;
  }>({
    open: false,
    title: '',
    mode: 'RETURN',
    referenceInvoice: '',
    reason: '',
  });

  // ── Load Branch Mobile Inventory in Background for Instant Omnibox Search ──
  const loadInventory = useCallback(async () => {
    setIsLoadingCatalog(true);
    try {
      const res = await mobileApi.getMobiles({
        branch_id: branchId,
        limit: 250,
      });
      setAllDevices(res.devices || []);
    } catch {
      // Handled gracefully in search dropdown
    } finally {
      setIsLoadingCatalog(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  // Auto-focus mobile search input on mount & F1 shortcut, F2 for customer search
  useEffect(() => {
    searchInputRef.current?.focus();
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F2') {
        e.preventDefault();
        customerInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchDropdownRef.current &&
        !searchDropdownRef.current.contains(e.target as Node)
      ) {
        setSearchDropdownOpen(false);
      }
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(e.target as Node)
      ) {
        setCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Customer Search Debounce ──
  useEffect(() => {
    if (customerSearchTimerRef.current) clearTimeout(customerSearchTimerRef.current);
    const q = customerSearchTerm.trim();
    if (!q) {
      setCustomerResults([]);
      return;
    }
    setIsCustomersLoading(true);
    customerSearchTimerRef.current = setTimeout(async () => {
      try {
        const res = await customerApi.searchCustomers(q);
        setCustomerResults(res.data || []);
      } catch {
        setCustomerResults([]);
      } finally {
        setIsCustomersLoading(false);
      }
    }, 250);
    return () => {
      if (customerSearchTimerRef.current) clearTimeout(customerSearchTimerRef.current);
    };
  }, [customerSearchTerm]);

  // ── Live Customer Ledger Hook (Same as PosCustomerLedgerPanel) ──
  const ledgerQueryArg = useMemo(() => {
    if (!customer || !customer.id) return null;
    return {
      id: customer.id,
      type: 'CUSTOMER' as const,
      name: customer.name,
      balance: customer.currentBalance ?? 0,
      creditLimit: customer.creditLimit ?? 0,
    };
  }, [customer]);

  const { timeline, isLedgerLoading, refetchLedger } = useLedger(ledgerQueryArg);

  // ── Active Bucket Determination (Matches ProductSearch.tsx) ──
  const activeBucket: MobileItemBucket =
    posMode === 'RETURN'
      ? 'RETURN'
      : posMode === 'REPLACE'
      ? replaceBucket
      : 'SALE';

  // ── Search Results (ONLY computed when user types in search box) ──
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    // For regular sale or replacement new item: search IN_STOCK devices.
    // For return bucket: allow searching all devices (or SOLD/IN_STOCK) by IMEI/model.
    const pool =
      activeBucket === 'RETURN'
        ? allDevices
        : allDevices.filter((d) => d.status === 'IN_STOCK');

    return pool
      .filter((d) => {
        return (
          d.brand.toLowerCase().includes(q) ||
          d.model.toLowerCase().includes(q) ||
          (d.color && d.color.toLowerCase().includes(q)) ||
          (d.storage && d.storage.toLowerCase().includes(q)) ||
          (d.serial_number && d.serial_number.toLowerCase().includes(q)) ||
          (d.imeis && d.imeis.some((i) => i.imei.toLowerCase().includes(q)))
        );
      })
      .slice(0, 12);
  }, [allDevices, searchQuery, activeBucket]);

  // ── Cart Helpers ──
  const isInCart = useCallback(
    (deviceId: string) => cart.some((c) => c.device.id === deviceId),
    [cart]
  );

  // Sync single-line payment helper
  const syncDefaultPaymentToNetTotal = useCallback((nextCart: CartItem[]) => {
    const saleNet = nextCart
      .filter((i) => i.bucket === 'SALE')
      .reduce((acc, item) => acc + Math.max(0, item.salePrice), 0);
    const returnNet = nextCart
      .filter((i) => i.bucket === 'RETURN')
      .reduce((acc, item) => acc + Math.max(0, item.salePrice), 0);
    const netPayable = Math.max(0, saleNet - returnNet);

    setPayments((currPays) => {
      if (currPays.length === 1) {
        return [{ ...currPays[0], amount: netPayable }];
      }
      return currPays;
    });
  }, []);

  const addToCart = useCallback(
    (device: MobileDeviceRow, bucketOverride?: MobileItemBucket) => {
      const targetBucket = bucketOverride || activeBucket;
      if (isInCart(device.id)) {
        toast.error('This mobile device (IMEI) is already in the cart');
        const existingInput = salePriceInputRefs.current[device.id];
        if (existingInput) {
          existingInput.focus();
          existingInput.select();
        }
        return;
      }
      if (targetBucket === 'SALE' && device.status !== 'IN_STOCK') {
        toast.error('Only IN_STOCK mobile devices can be sold');
        return;
      }

      const price = parseFloat(device.expected_sale_price ?? '0') || 0;
      setCart((prev) => {
        const nextCart: CartItem[] = [
          ...prev,
          {
            device,
            salePrice: price,
            bucket: targetBucket,
          },
        ];
        syncDefaultPaymentToNetTotal(nextCart);
        return nextCart;
      });

      setSearchQuery('');
      setSearchDropdownOpen(false);
      setSelectedIndex(0);
      // Focus and highlight the newly added mobile's Sale Price input for instant negotiation edit
      setLastAddedDeviceId(device.id);
    },
    [activeBucket, isInCart, syncDefaultPaymentToNetTotal]
  );

  const removeFromCart = useCallback(
    (deviceId: string) => {
      delete salePriceInputRefs.current[deviceId];
      setCart((prev) => {
        const nextCart = prev.filter((c) => c.device.id !== deviceId);
        syncDefaultPaymentToNetTotal(nextCart);
        return nextCart;
      });
      setPriceErrors((prev) => {
        const next = { ...prev };
        delete next[`${deviceId}_salePrice`];
        return next;
      });
    },
    [syncDefaultPaymentToNetTotal]
  );

  const clearCart = useCallback(() => {
    salePriceInputRefs.current = {};
    setCart([]);
    setPriceErrors({});
    setPayments([{ id: 'pay-1', method: 'CASH', amount: 0 }]);
    setPosMode('SALE');
  }, []);

  const updateCartItemPrice = useCallback(
    (deviceId: string, raw: string) => {
      const num = raw === '' ? 0 : parseFloat(raw);
      const isValid = !isNaN(num) && num >= 0;

      setPriceErrors((prev) => {
        const next = { ...prev };
        if (!isValid) {
          next[`${deviceId}_salePrice`] = 'Invalid amount';
        } else {
          delete next[`${deviceId}_salePrice`];
        }
        return next;
      });

      if (!isValid) return;

      setCart((prev) => {
        const nextCart = prev.map((item) =>
          item.device.id === deviceId ? { ...item, salePrice: num } : item
        );
        syncDefaultPaymentToNetTotal(nextCart);
        return nextCart;
      });
    },
    [syncDefaultPaymentToNetTotal]
  );

  // ── Separated Cart Buckets & Bill Totals (Matches CartTable.tsx & CartSummary.tsx) ──
  const saleItems = useMemo(() => cart.filter((i) => i.bucket === 'SALE'), [cart]);
  const returnItems = useMemo(() => cart.filter((i) => i.bucket === 'RETURN'), [cart]);

  const saleSubtotal = useMemo(
    () => saleItems.reduce((acc, item) => acc + item.salePrice, 0),
    [saleItems]
  );
  const returnCreditTotal = useMemo(
    () => returnItems.reduce((acc, item) => acc + Math.max(0, item.salePrice), 0),
    [returnItems]
  );

  const netSignedBalance = saleSubtotal - returnCreditTotal;
  const grandTotal = Math.max(0, netSignedBalance);
  const isNetRefund = netSignedBalance < 0;

  // ── Multi-Payment Split Helpers ──
  const totalReceived = useMemo(
    () => payments.reduce((sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0), 0),
    [payments]
  );

  const remainingBalance = grandTotal - totalReceived;

  const handleAddPaymentLine = (defaultMethod?: PaymentMethod) => {
    const rem = Math.max(0, grandTotal - totalReceived);
    const chosenMethod: PaymentMethod =
      defaultMethod ||
      (payments.some((p) => p.method === 'CASH') ? 'JAZZCASH' : 'CASH');

    setPayments((prev) => [
      ...prev,
      {
        id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        method: chosenMethod,
        amount: rem,
      },
    ]);
  };

  const handleUpdatePaymentLine = (
    id: string,
    patch: Partial<Pick<SplitPaymentLine, 'method' | 'amount' | 'reference'>>
  ) => {
    setPayments((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line))
    );
  };

  const handleRemovePaymentLine = (id: string) => {
    setPayments((prev) => {
      if (prev.length <= 1) {
        return [{ ...prev[0], amount: 0 }];
      }
      return prev.filter((line) => line.id !== id);
    });
  };

  // ── Execute Live Mobile POS Sale ──
  const handleExecuteMobileSale = async () => {
    if (cart.length === 0) {
      toast.error("Mobile cart is empty");
      return;
    }
    if (hasErrors) {
      toast.error("Please correct price errors before submitting");
      return;
    }
    if (remainingBalance > 0 && !customer) {
      toast.error("Credit sales require a selected customer. Walk-in customers cannot have due balance.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        items: cart.map((c) => ({
          deviceId: c.device.id,
          salePrice: c.salePrice,
        })),
        payments: payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          referenceNumber: p.reference ?? null,
        })),
        customerId: customer?.id ?? null,
        branchId: branchId ?? null,
        notes: saleNotes.trim() || null,
      };

      const res = await mobileApi.completeMobileSale(payload);
      toast.success("Sale Completed! Invoice #" + res.invoiceNumber);
      setCompletedSaleResult(res);
      setShowReview(false);

      // Trigger unified thermal print document (Type 2: Mobile Sale Invoice)
      try {
        const effectiveShop = shopHeader || {
          name: activeShop?.name || "Niazi Mobile Mart",
          branchName: activeShop?.name || "Main Branch",
          address: (activeShop as any)?.address || "",
          phone: (activeShop as any)?.phone || "",
          whatsapp: "",
          email: "",
          taxNumber: "",
          footerText: "Thank you for shopping with Niazi Mobile Mart!",
          returnPolicy: "Mobile handsets once sold are covered by check warranty as per invoice terms.",
        };

        const effectiveSettings = printerSettings || {
          enabled: true,
          printerType: 'THERMAL_80MM',
          connectionType: 'BROWSER_PRINT',
          paperSize: { width: '80mm' },
          layout: { orientation: 'portrait', marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
          font: { size: 12, family: 'sans-serif' },
          invoice: {
            showLogo: true,
            showShopInfo: true,
            showBarcode: true,
            showQR: false,
            showTax: false,
            showDiscount: true,
          },
          autoPrint: false,
          printCopyCount: 1,
        };

        const printOrder = {
          invoiceNumber: res.invoiceNumber,
          createdAt: res.createdAt,
          customer: customer ? { name: customer.name, phone: customer.phone } : { name: "Walk-In Customer" },
          cashier: res.cashier.name + " (" + res.cashier.role + ")",
          items: res.devices.map((d) => ({
            name: d.brand + " " + d.model,
            qty: 1,
            price: d.salePrice,
            total: d.salePrice,
            imei: d.imei1,
            specs: (() => {
              const matchedCart = cart.find(c => c.device.id === d.deviceId);
              return [matchedCart?.device.storage, matchedCart?.device.ram, matchedCart?.device.color].filter(Boolean).join(" • ") || undefined;
            })(),
          })),
          subtotal: res.subtotal,
          discount: res.discount,
          total: res.totalAmount,
          paymentBreakdown: res.payments,
          tendered: res.paidAmount,
          change: res.changeAmount,
          due: res.creditAmount,
        };

        const printHtml = printFormatter.formatMobileSaleInvoice(printOrder, effectiveSettings as any, effectiveShop as any);
        openPrintPreview({
          html: printHtml,
          documentType: 'MobileSaleInvoice',
          referenceId: res.invoiceNumber,
          title: "Mobile Sale Receipt - " + res.invoiceNumber,
        });

        await DocumentService.logPrint(res.invoiceNumber, "PRINT");
      } catch (printErr) {
        console.warn("Advisory printing error:", printErr);
      }

      // Clear cart and reload inventory
      clearCart();
      setCustomer(null);
      setSaleNotes("");
      loadInventory();
      refetchLedger();
      window.dispatchEvent(new CustomEvent("pos:sale-completed"));
    } catch (err: any) {
      const msg = err?.message || err?.error || "Failed to process mobile sale";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

    const hasErrors = Object.keys(priceErrors).length > 0;
  const canReview = cart.length > 0 && !hasErrors && totalReceived >= 0;

  // ── Omnibox Keyboard Navigation (Matches ProductSearch.tsx) ──
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSearchDropdownOpen || searchResults.length === 0) {
      if (e.key === 'Enter' && searchQuery.trim().length >= 4) {
        const q = searchQuery.trim().toLowerCase();
        const exactMatch = allDevices.find(
          (d) =>
            (d.imeis && d.imeis.some((i) => i.imei.toLowerCase() === q)) ||
            (d.serial_number && d.serial_number.toLowerCase() === q)
        );
        if (exactMatch) {
          e.preventDefault();
          addToCart(exactMatch);
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = searchResults[selectedIndex];
      if (target) {
        addToCart(target);
      }
    } else if (e.key === 'Escape') {
      setSearchDropdownOpen(false);
    }
  };

  // ── Customer Selector Handlers ──
  const handleSelectCustomer = (c: DBCustomer) => {
    setCustomer({
      id: c.id || (c as any)._id,
      name: c.name,
      phone: c.phone || c.mobile,
      mobile: c.mobile || c.phone,
      currentBalance: c.currentBalance ?? 0,
      creditLimit: c.creditLimit ?? 0,
    });
    setCustomerSearchTerm('');
    setCustomerDropdownOpen(false);
    setCustomerSelectedIndex(0);
  };

  const handleCustomerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isCustomerDropdownOpen || customerResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCustomerSelectedIndex((prev) =>
        prev < customerResults.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCustomerSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (customerResults[customerSelectedIndex]) {
        handleSelectCustomer(customerResults[customerSelectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setCustomerDropdownOpen(false);
    }
  };

  // Determine border theme class matching CartPanel.tsx
  const cartBorderClass =
    posMode === 'RETURN'
      ? 'border border-warning/50 rounded-2xl'
      : posMode === 'REPLACE'
      ? 'pos-animated-border-green'
      : 'pos-animated-border-blue';

  return (
    <div className="flex flex-col flex-1 h-full w-full min-h-0 overflow-hidden bg-background select-none">
      {/* ═════════════════════════════════════════════════════════════════════════
          1. TOP POS HEADER BAR (Matches PosHeader.tsx + ProductSearch.tsx)
             - Left: Brand & Module Navigation (Inventory | Mobile Sale | Sale History)
             - Center: Mobile Omnibox Search (Mobiles ONLY show on search, never pre-listed)
             - Right: POS Operational Mode Buttons (Regular Sale | Mobile Return | Mobile Replace)
         ═════════════════════════════════════════════════════════════════════════ */}
      <header className="min-h-[54px] px-3 sm:px-4 py-1.5 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0 z-20 shadow-xs">
        {/* Left Section: Brand Badge & Mobile Module Nav */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-7 h-7 rounded-lg bg-[#006970] text-white flex items-center justify-center font-black text-xs shadow-xs">
              <Smartphone className="w-4 h-4" />
            </span>
            <span className="hidden md:inline font-bold text-xs tracking-tight text-text-primary">
              Mobile<span className="text-[#006970] dark:text-[#00B4BB] font-black">POS</span>
            </span>
          </div>

          <div className="h-4 w-px bg-border hidden sm:block" />

          {/* Sub-Navigation Pills */}
          <nav className="flex items-center gap-1">
            {MOBILE_NAV_TABS.map((tab) => {
              const isActive =
                tab.href === '/dashboard/shop-admin/mobiles'
                  ? pathname === '/dashboard/shop-admin/mobiles'
                  : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  to={tab.href}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    isActive
                      ? 'bg-[#006970] text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Center Section: Primary Mobile / IMEI Omnibox Search (Exact same pattern as ProductSearch.tsx) */}
        <div
          className="flex-1 min-w-[240px] sm:min-w-[300px] md:min-w-[380px] max-w-2xl relative z-50"
          ref={searchDropdownRef}
        >
          <div className="pos-search-animated-border relative flex items-center w-full">
            <Search className="h-4 w-4 text-text-muted absolute left-3.5 z-10 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchDropdownOpen(true);
                setSelectedIndex(0);
              }}
              onFocus={() => {
                if (searchQuery.trim().length > 0) setSearchDropdownOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={
                activeBucket === 'RETURN'
                  ? 'Scan Returned IMEI, Serial No, or search Mobile Model to return (F1)...'
                  : 'Scan 15-digit IMEI, Serial No, or search Mobile Brand / Model to add (F1)...'
              }
              className="w-full h-9 pl-10 pr-24 text-xs border-none rounded-[10px] bg-surface text-text-primary placeholder:text-text-muted focus:outline-none transition-all font-medium relative z-0"
            />

            {/* Right-side Search Input Controls */}
            <div className="absolute right-2 z-10 flex items-center gap-1">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchDropdownOpen(false);
                    searchInputRef.current?.focus();
                  }}
                  className="p-1 text-text-muted hover:text-text-primary rounded"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={loadInventory}
                title="Refresh branch mobile inventory"
                className="p-1 text-text-muted hover:text-text-primary rounded transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCatalog ? 'animate-spin' : ''}`} />
              </button>
              <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-bold bg-surface-hover text-text-muted rounded border border-border">
                F1
              </span>
            </div>
          </div>

          {/* ── Floating Mobile Search Results Dropdown (ONLY visible when user types a search query) ── */}
          {isSearchDropdownOpen && searchQuery.trim().length > 0 && (
            <div className="absolute left-0 right-0 mt-1.5 w-full lg:w-[680px] bg-surface border border-border rounded-xl shadow-modal max-h-[60vh] overflow-y-auto z-50 divide-y divide-border/60">
              {/* Dropdown Header Bar */}
              <div className="px-3 py-2 bg-background border-b border-border flex items-center justify-between text-[11px] font-bold text-text-secondary uppercase tracking-wider sticky top-0 z-10 gap-2">
                <span>Matching Mobile Devices ({searchResults.length})</span>

                <div className="flex items-center gap-2">
                  {/* Replace Mode Bucket Switcher (Same as ProductSearch.tsx) */}
                  {posMode === 'REPLACE' && (
                    <div className="flex items-center bg-surface border border-border rounded-md p-0.5 gap-0.5">
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setReplaceBucket('RETURN');
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-black flex items-center gap-1 transition-colors ${
                          replaceBucket === 'RETURN'
                            ? 'bg-warning text-white'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        <ArrowDownToLine className="w-3 h-3" /> RETURN
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setReplaceBucket('SALE');
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-black flex items-center gap-1 transition-colors ${
                          replaceBucket === 'SALE'
                            ? 'bg-primary text-white'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        <ArrowUpFromLine className="w-3 h-3" /> NEW
                      </button>
                    </div>
                  )}

                  {posMode === 'RETURN' && (
                    <span className="px-2 py-0.5 rounded bg-warning/15 text-warning text-[10px] font-black border border-warning/30">
                      ADDING AS RETURN
                    </span>
                  )}

                  <span className="hidden sm:inline text-[10px] font-normal text-text-muted">
                    Use ↓↑ arrows, Enter to select, ESC to close
                  </span>
                </div>
              </div>

              {isLoadingCatalog ? (
                <div className="p-4 text-center text-xs text-text-muted flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Searching mobile inventory…
                </div>
              ) : searchResults.length > 0 ? (
                <ul className="py-1">
                  {searchResults.map((device, index) => {
                    const isSelected = index === selectedIndex;
                    const inCart = isInCart(device.id);
                    const imei1 = device.imeis?.find((i) => i.slot === 'IMEI1')?.imei ?? '—';
                    const imei2 = device.imeis?.find((i) => i.slot === 'IMEI2')?.imei;
                    const expectedPrice = parseFloat(device.expected_sale_price ?? '0') || 0;
                    const costPrice = parseFloat(device.cost_price ?? '0') || 0;
                    const isCostRevealed = revealedCostId === device.id;

                    return (
                      <li
                        key={device.id}
                        className={`px-4 py-2.5 cursor-pointer flex items-center justify-between gap-4 transition-colors ${
                          isSelected ? 'bg-primary/10' : 'hover:bg-surface-hover'
                        } ${inCart ? 'opacity-60' : ''}`}
                        onMouseDown={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest('[data-cost-reveal="true"]')) return;
                          e.preventDefault();
                          if (!inCart) addToCart(device);
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        {/* Left: Mobile Brand, Model, Specs & IMEI */}
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-sm font-bold truncate ${
                                isSelected ? 'text-primary' : 'text-text-primary'
                              }`}
                            >
                              {device.brand} {device.model}
                            </span>

                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                device.condition === 'NEW'
                                  ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                                  : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                              }`}
                            >
                              {device.condition === 'NEW' ? 'NEW PINPACK' : 'USED'}
                            </span>

                            {getPtaBadge(device.pta_status)}

                            {inCart && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/20 text-primary">
                                In Cart
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5 flex-wrap">
                            <span className="font-semibold text-text-secondary">
                              {device.storage}
                              {device.ram ? ` / ${device.ram}` : ''}
                              {device.color ? ` · ${device.color}` : ''}
                            </span>
                            <span>•</span>
                            <span className="font-mono text-[#006970] dark:text-[#00B4BB] font-semibold">
                              IMEI: {imei1}
                              {imei2 ? ` / ${imei2}` : ''}
                            </span>
                          </div>
                        </div>

                        {/* Right: Price, Hold-to-Reveal Cost & ADD Button */}
                        <div className="flex items-center gap-4 shrink-0">
                          {canRevealCost && costPrice > 0 && (
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] text-text-muted uppercase">Cost</span>
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-mono font-bold text-text-secondary tabular-nums">
                                  {isCostRevealed ? fmtPKR(costPrice) : '••••'}
                                </span>
                                <button
                                  type="button"
                                  data-cost-reveal="true"
                                  title="Hold to view cost price"
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setRevealedCostId(device.id);
                                  }}
                                  onMouseUp={(e) => {
                                    e.stopPropagation();
                                    setRevealedCostId(null);
                                  }}
                                  onMouseLeave={() => {
                                    if (isCostRevealed) setRevealedCostId(null);
                                  }}
                                  className="p-0.5 rounded hover:bg-border/60 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                                >
                                  {isCostRevealed ? (
                                    <EyeOff className="w-3.5 h-3.5 text-warning" />
                                  ) : (
                                    <Eye className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="flex flex-col items-end w-24">
                            <span className="text-[10px] text-text-muted uppercase">Sale Price</span>
                            <span className="text-sm font-black text-text-primary tabular-nums">
                              {fmtPKR(expectedPrice)}
                            </span>
                          </div>

                          <button
                            type="button"
                            disabled={inCart}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!inCart) addToCart(device);
                            }}
                            className={`h-8 px-3 rounded-lg font-bold text-xs flex items-center gap-1 transition-all cursor-pointer ${
                              inCart
                                ? 'bg-surface-hover text-text-muted cursor-not-allowed'
                                : activeBucket === 'RETURN'
                                ? 'bg-warning text-white shadow-sm'
                                : isSelected
                                ? 'bg-primary text-white shadow-sm'
                                : 'bg-surface-hover text-text-secondary hover:bg-primary hover:text-white'
                            }`}
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                            {inCart ? 'ADDED' : activeBucket === 'RETURN' ? 'RETURN' : 'ADD'}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="p-6 text-center text-sm text-text-muted">
                  No matching mobile devices found for &ldquo;
                  <span className="text-text-primary font-bold">{searchQuery}</span>&rdquo;
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Section: POS Mode Switcher (Regular Sale | Mobile Return | Mobile Replace) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setPosMode('SALE')}
            className={`h-9 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              posMode === 'SALE'
                ? 'bg-[#006970] text-white shadow-xs'
                : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Regular Sale</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPosMode('RETURN');
              setActionNoticeModal({
                open: true,
                title: 'Mobile Return (Invoice / IMEI Lookup)',
                mode: 'RETURN',
                referenceInvoice: '',
                reason: '',
              });
            }}
            className={`h-9 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
              posMode === 'RETURN'
                ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mobile Return</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPosMode('REPLACE');
              setReplaceBucket('RETURN');
              setActionNoticeModal({
                open: true,
                title: 'Mobile Replace / Exchange Device',
                mode: 'REPLACE',
                referenceInvoice: '',
                reason: '',
              });
            }}
            className={`h-9 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
              posMode === 'REPLACE'
                ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 hover:bg-purple-500/20'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mobile Replace</span>
          </button>
        </div>
      </header>

      {/* ═════════════════════════════════════════════════════════════════════════
          2. MAIN POS WORKSPACE (Exact same 8-Col Left Cart + 4-Col Right Ledger layout as SaleWorkspace.tsx)
         ═════════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 min-h-0 overflow-hidden">
        {/* ───────────────────────────────────────────────────────────────────────
            LEFT 2/3 (8 COLUMNS): MOBILE POS CART PANEL + MULTI-PAYMENT CHECKOUT
            (Matches CartPanel.tsx + CartTable.tsx + CartSummary.tsx)
           ─────────────────────────────────────────────────────────────────────── */}
        <section
          className={`lg:col-span-8 flex flex-col h-full min-h-0 bg-surface shadow-xs overflow-hidden transition-colors ${cartBorderClass}`}
        >
          {/* 1. Cart Header Bar */}
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-surface shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black uppercase tracking-wider text-text-primary">
                Mobile POS Cart
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#006970]/15 text-[#006970] dark:text-[#00B4BB]">
                {cart.length} {cart.length === 1 ? 'Mobile' : 'Mobiles'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {posMode === 'RETURN' && (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-warning/15 text-warning text-xs font-bold border border-warning/30">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Return Mode Active</span>
                </div>
              )}
              {posMode === 'REPLACE' && (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 text-xs font-bold border border-purple-500/30">
                  <Repeat className="w-3.5 h-3.5" />
                  <span>Replace / Exchange Mode Active</span>
                </div>
              )}
            </div>
          </div>

          {/* 2. Cart Items Table (Scrollable internally, never overflows viewport) */}
          <div className="flex-1 min-h-0 overflow-y-auto relative">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-text-muted select-none">
                <div className="w-14 h-14 rounded-2xl bg-surface-hover border border-border flex items-center justify-center mb-3">
                  <ScanBarcode className="w-7 h-7 text-[#006970] dark:text-[#00B4BB] opacity-70" />
                </div>
                <p className="text-sm font-bold text-text-primary">Mobile POS Cart is Empty</p>
                <p className="text-xs text-text-muted mt-1 max-w-md text-center">
                  Scan a 15-digit IMEI barcode or search by Brand / Model in the top search bar (
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-surface-hover border border-border rounded">
                    F1
                  </kbd>
                  ) to add a mobile device to the sale cart.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse select-none">
                <thead className="sticky top-0 bg-background/95 backdrop-blur-xs shadow-2xs z-10 text-[11px] font-bold text-text-secondary uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="py-2.5 pl-4 pr-2 w-10">#</th>
                    <th className="py-2.5 px-2">Mobile Brand, Model & Specs</th>
                    <th className="py-2.5 px-2 w-48">IMEI / Serial No</th>
                    <th className="py-2.5 px-2 w-40 text-right">Sale Price</th>
                    <th className="py-2.5 px-2 w-36 text-right">Net Total</th>
                    <th className="py-2.5 pl-2 pr-4 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {/* ── Returned Mobile Devices Section (When in Return/Replace Mode) ── */}
                  {returnItems.length > 0 && (
                    <>
                      <tr className="bg-warning/10 border-y border-warning/30">
                        <td colSpan={6} className="py-1.5 px-4">
                          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-warning">
                            <ArrowDownToLine className="w-3.5 h-3.5" />
                            <span>Returned Mobile Devices ({returnItems.length})</span>
                          </div>
                        </td>
                      </tr>
                      {returnItems.map((item, idx) => {
                        const imei1 =
                          item.device.imeis?.find((i) => i.slot === 'IMEI1')?.imei ?? '—';
                        const imei2 = item.device.imeis?.find((i) => i.slot === 'IMEI2')?.imei;
                        const lineTotal = Math.max(0, item.salePrice);

                        return (
                          <tr
                            key={item.device.id}
                            className="group bg-warning/5 hover:bg-warning/10 transition-colors"
                          >
                            <td className="py-2.5 pl-4 pr-2 font-mono text-xs text-warning font-bold">
                              R{idx + 1}
                            </td>
                            <td className="py-2.5 px-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-text-primary text-xs sm:text-sm">
                                  {item.device.brand} {item.device.model}
                                </span>
                                <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-warning/20 text-warning border border-warning/30">
                                  RETURN
                                </span>
                                {getPtaBadge(item.device.pta_status)}
                              </div>
                              <div className="text-[11px] text-text-muted mt-0.5">
                                {item.device.storage}
                                {item.device.ram ? ` / ${item.device.ram}` : ''}
                                {item.device.color ? ` · ${item.device.color}` : ''} ·{' '}
                                {item.device.condition}
                              </div>
                            </td>
                            <td className="py-2.5 px-2 font-mono text-xs text-warning font-semibold">
                              <div>{imei1}</div>
                              {imei2 && (
                                <div className="text-[10px] text-text-muted">{imei2}</div>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-right">
                              <input
                                ref={(el) => {
                                  salePriceInputRefs.current[item.device.id] = el;
                                }}
                                type="number"
                                min="0"
                                step="100"
                                value={item.salePrice}
                                onFocus={(e) => e.currentTarget.select()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    searchInputRef.current?.focus();
                                  }
                                }}
                                onChange={(e) =>
                                  updateCartItemPrice(item.device.id, e.target.value)
                                }
                                className="w-32 bg-background border border-warning/40 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-right text-text-primary focus:outline-none focus:border-warning focus:ring-2 focus:ring-warning/30"
                              />
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono font-black text-warning tabular-nums">
                              −{fmtPKR(lineTotal)}
                            </td>
                            <td className="py-2.5 pl-2 pr-4 text-center">
                              <button
                                type="button"
                                onClick={() => removeFromCart(item.device.id)}
                                className="text-text-muted hover:text-danger p-1 rounded-md hover:bg-danger/10 transition-colors cursor-pointer"
                                title="Remove Returned Mobile"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}

                  {/* ── New / Outgoing Mobile Sale Items Section ── */}
                  {saleItems.length > 0 && returnItems.length > 0 && (
                    <tr className="bg-primary/10 border-y border-primary/30">
                      <td colSpan={6} className="py-1.5 px-4">
                        <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-primary">
                          <ArrowUpFromLine className="w-3.5 h-3.5" />
                          <span>Replacement / New Mobile Devices ({saleItems.length})</span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {saleItems.map((item, idx) => {
                    const imei1 = item.device.imeis?.find((i) => i.slot === 'IMEI1')?.imei ?? '—';
                    const imei2 = item.device.imeis?.find((i) => i.slot === 'IMEI2')?.imei;
                    const lineTotal = Math.max(0, item.salePrice);
                    const salePriceErr = priceErrors[`${item.device.id}_salePrice`];
                    const expectedPrice =
                      parseFloat(item.device.expected_sale_price ?? '0') || 0;
                    const priceDelta = item.salePrice - expectedPrice;

                    return (
                      <tr
                        key={item.device.id}
                        className="group hover:bg-surface-hover/60 transition-colors"
                      >
                        <td className="py-2.5 pl-4 pr-2 font-mono text-xs text-text-muted">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-text-primary text-xs sm:text-sm">
                              {item.device.brand} {item.device.model}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                item.device.condition === 'NEW'
                                  ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                                  : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                              }`}
                            >
                              {item.device.condition === 'NEW' ? 'NEW' : 'USED'}
                            </span>
                            {getPtaBadge(item.device.pta_status)}
                          </div>
                          <div className="text-[11px] text-text-muted mt-0.5">
                            {item.device.storage}
                            {item.device.ram ? ` / ${item.device.ram}` : ''}
                            {item.device.color ? ` · ${item.device.color}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 font-mono text-xs text-[#006970] dark:text-[#00B4BB] font-semibold">
                          <div>{imei1}</div>
                          {imei2 && <div className="text-[10px] text-text-muted">{imei2}</div>}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <input
                              ref={(el) => {
                                salePriceInputRefs.current[item.device.id] = el;
                              }}
                              type="number"
                              min="0"
                              step="100"
                              value={item.salePrice}
                              onFocus={(e) => e.currentTarget.select()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  searchInputRef.current?.focus();
                                }
                              }}
                              onChange={(e) =>
                                updateCartItemPrice(item.device.id, e.target.value)
                              }
                              title="Direct editable Sale Price (Press Enter to return to search)"
                              className={`w-32 bg-background border-2 rounded-lg px-2.5 py-1.5 text-xs font-mono font-extrabold text-right text-text-primary focus:outline-none focus:border-[#006970] focus:ring-2 focus:ring-[#006970]/25 transition-all ${
                                salePriceErr ? 'border-danger' : 'border-[#006970]/40'
                              }`}
                            />
                            {expectedPrice > 0 && priceDelta !== 0 && (
                              <span
                                className={`text-[10px] font-mono font-semibold ${
                                  priceDelta < 0 ? 'text-amber-500' : 'text-emerald-500'
                                }`}
                              >
                                {priceDelta < 0
                                  ? `Disc: −${fmtPKR(Math.abs(priceDelta))}`
                                  : `Extra: +${fmtPKR(priceDelta)}`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-black text-text-primary tabular-nums">
                          {fmtPKR(lineTotal)}
                        </td>
                        <td className="py-2.5 pl-2 pr-4 text-center">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.device.id)}
                            className="text-text-muted hover:text-danger p-1 rounded-md hover:bg-danger/10 transition-colors cursor-pointer"
                            title="Remove Mobile"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* 3. Checkout & Multi-Payment Split Summary Footer (Pinned at bottom of Cart Panel) */}
          <div className="shrink-0 border-t border-border bg-surface p-3 flex flex-col gap-2.5">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
              {/* Left 5 Cols of Footer: Bill Breakdown & Net Payable Box */}
              <div className="xl:col-span-5 flex flex-col justify-between bg-background/60 border border-border rounded-xl p-2.5 gap-1.5">
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between text-text-secondary">
                    <span>Gross Sale Subtotal ({saleItems.length}):</span>
                    <span className="font-mono font-bold text-text-primary tabular-nums">
                      {fmtPKR(saleSubtotal)}
                    </span>
                  </div>

                  {returnCreditTotal > 0 && (
                    <div className="flex items-center justify-between text-warning">
                      <span>Return Credit ({returnItems.length}):</span>
                      <span className="font-mono font-bold tabular-nums">
                        −{fmtPKR(returnCreditTotal)}
                      </span>
                    </div>
                  )}
                </div>

                <div
                  className={`p-2 rounded-lg border flex items-center justify-between ${
                    isNetRefund
                      ? 'bg-warning/10 border-warning/30'
                      : 'bg-[#006970]/10 border-[#006970]/30'
                  }`}
                >
                  <span className="text-xs font-black uppercase tracking-wider text-text-primary">
                    {isNetRefund ? 'Net Refund Due' : 'Net Payable'}
                  </span>
                  <span
                    className={`text-lg font-black font-mono tabular-nums ${
                      isNetRefund ? 'text-warning' : 'text-[#006970] dark:text-[#00B4BB]'
                    }`}
                  >
                    {fmtPKR(Math.abs(netSignedBalance))}
                  </span>
                </div>

                {/* Action Buttons: Clear, Hold, Complete Sale & Print */}
                <div className="grid grid-cols-12 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    disabled={cart.length === 0}
                    onClick={clearCart}
                    className="col-span-3 py-2 rounded-lg text-xs font-bold bg-surface border border-border hover:bg-danger/10 hover:text-danger hover:border-danger/30 text-text-secondary disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    Clear
                  </button>

                  <button
                    type="button"
                    disabled={cart.length === 0}
                    onClick={() =>
                      toast('Mobile Sale held locally (Frontend Preview)', { icon: '🧾' })
                    }
                    className="col-span-3 py-2 rounded-lg text-xs font-bold bg-surface border border-border hover:bg-surface-hover text-text-primary disabled:opacity-40 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <PauseCircle className="w-3.5 h-3.5" /> Hold
                  </button>

                  <button
                    type="button"
                    disabled={!canReview}
                    onClick={() => setShowReview(true)}
                    className="col-span-6 py-2 rounded-lg text-xs font-black bg-[#006970] hover:bg-[#005a60] disabled:opacity-40 text-white flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" /> Complete & Print
                  </button>
                </div>
              </div>

              {/* Right 7 Cols of Footer: Multi-Payment Split Box (Cash + JazzCash / EasyPaisa / Bank / Credit) */}
              <div className="xl:col-span-7 bg-background/80 border border-[#006970]/40 rounded-xl p-2.5 flex flex-col justify-between gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#006970] dark:text-[#00B4BB] flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5" /> Receive Payments (Multi-Method Split)
                  </span>
                  <div className="flex items-center gap-1">
                    {(
                      [
                        ['JAZZCASH', '+ JazzCash'],
                        ['EASYPAISA', '+ EasyPaisa'],
                        ['BANK_TRANSFER', '+ Bank'],
                        ['CREDIT', '+ Credit'],
                      ] as [PaymentMethod, string][]
                    ).map(([m, label]) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleAddPaymentLine(m)}
                        className="px-1.5 py-0.5 rounded bg-surface hover:bg-surface-hover text-[10px] font-bold text-text-secondary hover:text-text-primary border border-border cursor-pointer"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Split Payment Lines List */}
                <div className="max-h-24 overflow-y-auto space-y-1 pr-0.5">
                  {payments.map((line) => (
                    <div
                      key={line.id}
                      className="grid grid-cols-12 gap-1.5 items-center bg-surface px-2 py-1 rounded-lg border border-border"
                    >
                      <div className="col-span-5">
                        <select
                          value={line.method}
                          onChange={(e) =>
                            handleUpdatePaymentLine(line.id, {
                              method: e.target.value as PaymentMethod,
                            })
                          }
                          className="w-full bg-background text-text-primary text-xs font-bold rounded px-2 py-1 border border-border focus:outline-none"
                        >
                          {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-6">
                        <div className="relative flex items-center">
                          <span className="absolute left-2 text-[10px] text-text-muted font-mono">
                            Rs.
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="500"
                            value={line.amount || ''}
                            placeholder="0"
                            onChange={(e) => {
                              const val =
                                e.target.value === '' ? 0 : parseFloat(e.target.value);
                              handleUpdatePaymentLine(line.id, {
                                amount: Number.isFinite(val) ? Math.max(0, val) : 0,
                              });
                            }}
                            className="w-full bg-background border border-border rounded pl-7 pr-2 py-1 text-xs text-emerald-500 font-bold font-mono text-right focus:outline-none focus:border-[#006970]"
                          />
                        </div>
                      </div>

                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemovePaymentLine(line.id)}
                          className="text-text-muted hover:text-danger text-xs font-bold cursor-pointer"
                          title="Remove payment method"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Live Total Received vs Remaining Footer */}
                <div className="border-t border-border/70 pt-1 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-text-muted mr-1.5">Total Received:</span>
                    <span className="font-mono font-extrabold text-emerald-500">
                      {fmtPKR(totalReceived)}
                    </span>
                  </div>
                  <div>
                    {remainingBalance === 0 ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 font-mono font-bold text-[11px]">
                        Rs. 0 (Settled ✓)
                      </span>
                    ) : remainingBalance > 0 ? (
                      <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 font-mono font-bold text-[11px]">
                        Remaining Due: {fmtPKR(remainingBalance)}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-500 border border-cyan-500/30 font-mono font-bold text-[11px]">
                        Change: {fmtPKR(Math.abs(remainingBalance))}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ───────────────────────────────────────────────────────────────────────
            RIGHT 1/3 (4 COLUMNS): CUSTOMER & LEDGER PANEL
            (Exact same structure as PosCustomerLedgerPanel.tsx in Products POS)
           ─────────────────────────────────────────────────────────────────────── */}
        <aside className="lg:col-span-4 flex flex-col gap-2.5 h-full min-h-0 overflow-hidden select-none">
          {/* 1. Customer Search Surface (Same as CustomerSelector searchOnly=true) */}
          <div
            className="bg-surface p-2.5 rounded-2xl border border-border shadow-xs shrink-0 relative"
            ref={customerDropdownRef}
          >
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-text-secondary">
                Select Customer / Khata
              </span>
              <span className="text-[10px] text-text-muted font-medium">F2 to focus</span>
            </div>

            <div className="relative">
              <Search className="h-4 w-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={customerInputRef}
                type="text"
                value={customerSearchTerm}
                onChange={(e) => {
                  setCustomerSearchTerm(e.target.value);
                  setCustomerDropdownOpen(true);
                  setCustomerSelectedIndex(0);
                }}
                onFocus={() => {
                  if (customerSearchTerm.trim().length > 0) setCustomerDropdownOpen(true);
                }}
                onKeyDown={handleCustomerKeyDown}
                placeholder="Search customer (Name, Phone, Khata)..."
                className="w-full pl-9 pr-8 py-2 text-xs border border-border rounded-xl bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-focus-ring transition-all"
              />
              {customerSearchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerSearchTerm('');
                    setCustomerDropdownOpen(false);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Customer Search Dropdown Results */}
            {isCustomerDropdownOpen && customerSearchTerm.trim().length > 0 && (
              <div className="absolute left-0 right-0 z-50 mt-1.5 bg-surface border border-border rounded-xl shadow-modal max-h-60 overflow-y-auto p-1">
                {isCustomersLoading ? (
                  <div className="p-3 text-xs text-text-muted text-center flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching customers...
                  </div>
                ) : customerResults.length > 0 ? (
                  <ul className="space-y-0.5">
                    {customerResults.map((cust, index) => (
                      <li
                        key={cust.id || (cust as any)._id}
                        className={`px-3 py-2 rounded-lg cursor-pointer flex justify-between items-center transition-colors ${
                          index === customerSelectedIndex
                            ? 'bg-primary/10 text-primary font-bold'
                            : 'hover:bg-surface-hover text-text-primary'
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectCustomer(cust);
                        }}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold truncate">{cust.name}</span>
                          <span className="text-[10px] text-text-muted">
                            {cust.phone || cust.mobile || 'No phone'}
                          </span>
                        </div>
                        <div className="text-xs font-black tabular-nums text-text-secondary shrink-0">
                          Rs {(cust.currentBalance || 0).toLocaleString()}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-3 text-xs text-text-muted text-center">
                    No customers found
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Customer Details + Live Customer Ledger Statement Card (Matches PosCustomerLedgerPanel.tsx) */}
          <div className="flex-1 flex flex-col min-h-0 bg-surface rounded-2xl border border-border shadow-xs overflow-hidden">
            {/* Customer Details Header */}
            <div className="p-3 border-b border-border bg-background/40 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                  <UserCircle2 className="w-3.5 h-3.5 text-primary" />
                  Customer Details
                </span>
                <div className="flex items-center gap-1.5">
                  {customer && (
                    <>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          customer.currentBalance > 0
                            ? 'bg-danger/10 text-danger border border-danger/20'
                            : 'bg-success/10 text-success border border-success/20'
                        }`}
                      >
                        {customer.currentBalance > 0 ? 'Outstanding' : 'Clear'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCustomer(null)}
                        className="text-[10px] text-text-muted hover:text-danger px-1.5 py-0.5 rounded border border-border hover:border-danger/30 transition-colors cursor-pointer"
                        title="Reset to Walk-In Customer"
                      >
                        Reset
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-xs">
                <div>
                  <span className="text-[10px] text-text-muted block">Customer Name</span>
                  <span className="font-bold text-text-primary truncate block">
                    {customer ? customer.name : 'Walk-In Customer'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block">Phone</span>
                  <span className="font-mono font-semibold text-text-secondary truncate block">
                    {customer?.phone || customer?.mobile || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block">Credit Limit</span>
                  <span className="font-mono font-semibold text-text-secondary tabular-nums block">
                    Rs {(customer?.creditLimit ?? 0).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block">Current Balance</span>
                  <span
                    className={`font-mono font-black tabular-nums block ${
                      (customer?.currentBalance ?? 0) > 0 ? 'text-danger' : 'text-emerald-600'
                    }`}
                  >
                    Rs {(customer?.currentBalance ?? 0).toLocaleString()}{' '}
                    {(customer?.currentBalance ?? 0) > 0 ? 'Dr' : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Ledger Statement Header */}
            <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-surface shrink-0">
              <span className="text-[11px] font-black uppercase tracking-wider text-text-secondary">
                Customer Ledger Statement
              </span>
              {customer && (
                <button
                  type="button"
                  onClick={() => refetchLedger()}
                  className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              )}
            </div>

            {/* Ledger Mini-Statement Table */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {!customer ? (
                <div className="h-full flex flex-col items-center justify-center p-4 text-center text-text-muted">
                  <Receipt className="w-7 h-7 stroke-[1.5] mb-1.5 opacity-40" />
                  <p className="text-xs font-medium">Walk-In Customer Active</p>
                  <p className="text-[11px] opacity-75 mt-0.5">
                    Select a customer above to view their live ledger statement and credit history.
                  </p>
                </div>
              ) : isLedgerLoading ? (
                <div className="h-full flex items-center justify-center p-4 text-xs text-text-muted">
                  Loading ledger entries...
                </div>
              ) : timeline.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-4 text-center text-text-muted">
                  <p className="text-xs font-medium">No ledger transactions found</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead className="sticky top-0 bg-background/95 backdrop-blur-xs text-[10px] font-bold text-text-muted uppercase border-b border-border">
                    <tr>
                      <th className="py-1.5 pl-3 pr-1.5">Date</th>
                      <th className="py-1.5 px-1.5">Ref #</th>
                      <th className="py-1.5 px-1.5 text-right">Debit</th>
                      <th className="py-1.5 px-1.5 text-right">Credit</th>
                      <th className="py-1.5 pl-1.5 pr-3 text-right">Bal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-mono">
                    {timeline.slice(0, 10).map((entry, idx) => (
                      <tr key={entry.id || `${entry.transactionId}-${idx}`} className="hover:bg-surface-hover/50">
                        <td className="py-1.5 pl-3 pr-1.5 text-text-secondary whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleDateString('en-PK', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </td>
                        <td className="py-1.5 px-1.5 text-text-primary font-sans font-medium truncate max-w-[80px]" title={entry.transactionId}>
                          {entry.transactionId}
                        </td>
                        <td className="py-1.5 px-1.5 text-right text-danger tabular-nums">
                          {entry.debit > 0 ? entry.debit.toLocaleString() : '—'}
                        </td>
                        <td className="py-1.5 px-1.5 text-right text-emerald-600 tabular-nums">
                          {entry.credit > 0 ? entry.credit.toLocaleString() : '—'}
                        </td>
                        <td className="py-1.5 pl-1.5 pr-3 text-right font-bold text-text-primary tabular-nums">
                          {entry.runningBalance.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Bottom Ledger Actions: Receive Payment & View Full Statement */}
            <div className="p-2.5 border-t border-border bg-background/40 grid grid-cols-2 gap-2 shrink-0">
              <button
                type="button"
                disabled={!customer}
                onClick={() => setSettlementModalOpen(true)}
                className="h-9 px-3 rounded-xl bg-primary text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs hover:bg-primary-hover disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
              >
                <Receipt className="w-3.5 h-3.5" />
                Receive Payment
              </button>
              <button
                type="button"
                disabled={!customer}
                onClick={() => {
                  if (customer) {
                    navigate('/dashboard/shop-admin/customers');
                  }
                }}
                className="h-9 px-3 rounded-xl border border-border bg-surface text-text-primary font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-surface-hover disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Full Statement
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL 1: Standalone Customer Payment Collection (Matches PosCustomerLedgerPanel)
         ═══════════════════════════════════════════════════════════════════════ */}
      {isSettlementModalOpen && customer && (
        <LedgerSettlementModal
          customer={customer as any}
          invoiceTotal={0}
          standaloneMode={true}
          onClose={() => setSettlementModalOpen(false)}
          onSuccess={(paidAmount, updatedCust) => {
            setCustomer({
              ...customer,
              currentBalance: Math.max(0, (updatedCust.currentBalance ?? 0) - paidAmount),
            });
            refetchLedger();
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL 2: Mobile Sale Invoice (Type 2 Invoice Preview & Print)
         ═══════════════════════════════════════════════════════════════════════ */}
      {showReview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card
            variant="default"
            padding="none"
            className="w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <ReceiptText className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-text-primary tracking-tight">
                    Mobile Sale Invoice Preview
                  </h2>
                  <p className="text-[11px] text-text-muted">
                    Official Document Type 2 • Serialized Mobile Terminal
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReview(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Styled Real Invoice Paper Container */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">

              {/* 1. Authentic Organization / Shop Header */}
              <div className="rounded-xl border border-border/80 bg-background/80 p-3.5 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-[#006970] to-[#00B4BB]" />
                <h3 className="font-extrabold text-base uppercase text-text-primary tracking-wide">
                  {shopHeader?.name || activeShop?.name || 'Niazi Mobile Mart'}
                </h3>
                <p className="text-[11px] text-text-muted font-medium mt-0.5">
                  {shopHeader?.branchName || activeShop?.name || 'Main Branch'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-text-secondary mt-1.5 font-mono">
                  {(shopHeader?.address || (activeShop as any)?.address) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-text-muted shrink-0" />
                      {shopHeader?.address || (activeShop as any)?.address}
                    </span>
                  )}
                  {(shopHeader?.phone || (activeShop as any)?.phone) && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-text-muted shrink-0" />
                      {shopHeader?.phone || (activeShop as any)?.phone}
                    </span>
                  )}
                  {shopHeader?.taxNumber && (
                    <span className="font-bold text-text-primary">
                      NTN: {shopHeader.taxNumber}
                    </span>
                  )}
                </div>
              </div>

              {/* 2. Invoice Meta & Cashier / User Accountability */}
              <div className="grid grid-cols-2 gap-3">
                {/* Cashier / User Accountability Card */}
                <div className="rounded-xl border border-border/80 bg-background/50 p-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-text-muted tracking-wider">
                      Processed By
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#006970]/10 text-[#006970] dark:text-[#00B4BB]">
                      {user?.role || 'CASHIER'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <span className="font-bold text-text-primary truncate">
                      {user?.name || user?.username || 'Current Staff'}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-text-muted">
                    User ID: {user?.id ? user.id.slice(0, 8) + '...' : 'System'}
                  </p>
                </div>

                {/* Customer Details Card */}
                <div className="rounded-xl border border-border/80 bg-background/50 p-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-text-muted tracking-wider">
                      Customer / Khata
                    </span>
                    {customer && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        VERIFIED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <UserCircle2 className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <span className="font-bold text-text-primary truncate">
                      {customer ? customer.name : 'Walk-In Customer'}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-text-muted">
                    {customer ? (customer.phone || customer.mobile || 'No Phone') : 'General Cash Sale'}
                    {customer && customer.currentBalance > 0 && (
                      <span className="text-warning ml-1">
                        (Due: {fmtPKR(customer.currentBalance)})
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* 3. Serialized Mobile Handsets Table */}
              <div className="rounded-xl border border-border/80 bg-background/50 overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 border-b border-border/60 flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase text-text-secondary tracking-wider">
                    Mobile Inventory Items ({cart.length})
                  </span>
                  <span className="text-[10px] font-medium text-text-muted">
                    Serial & IMEI Tracked
                  </span>
                </div>
                <div className="divide-y divide-border/60">
                  {cart.map((item, idx) => {
                    const imei1 = item.device.imeis?.find((i) => i.slot === 'IMEI1')?.imei ?? '—';
                    const imei2 = item.device.imeis?.find((i) => i.slot === 'IMEI2')?.imei;
                    const specs = [item.device.storage, item.device.ram, item.device.color].filter(Boolean).join(' • ');

                    return (
                      <div key={item.device.id} className="p-2.5 flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-text-muted">#{idx + 1}</span>
                            <span className="font-bold text-text-primary">
                              {item.device.brand} {item.device.model}
                            </span>
                            {specs && (
                              <span className="text-[10px] text-text-secondary font-medium">
                                ({specs})
                              </span>
                            )}
                            {item.bucket === 'RETURN' && (
                              <span className="px-1.5 py-0.5 text-[9px] rounded font-bold bg-warning/20 text-warning">
                                RETURN
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10.5px] font-mono text-text-muted">
                            <span>IMEI 1: <strong className="text-text-secondary">{imei1}</strong></span>
                            {imei2 && <span>| IMEI 2: {imei2}</span>}
                          </div>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          <p className={`font-bold ${item.bucket === 'RETURN' ? 'text-warning' : 'text-text-primary'}`}>
                            {item.bucket === 'RETURN' ? '−' : ''}{fmtPKR(item.salePrice)}
                          </p>
                          <span className="text-[9px] text-text-muted">Qty: 1</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. Payment Breakdown & Financial Totals */}
              <div className="rounded-xl border border-border/80 bg-background/50 p-3 space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
                  <span className="text-[10px] font-extrabold uppercase text-text-secondary tracking-wider">
                    Payment Method Split
                  </span>
                  <span className="text-[10px] font-medium text-text-muted">
                    Instant Tender Settlement
                  </span>
                </div>
                <div className="space-y-1.5">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {PAYMENT_METHOD_LABELS[p.method]}
                        {p.reference && <span className="text-[10px] text-text-muted">({p.reference})</span>}
                      </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {fmtPKR(p.amount)}
                      </span>
                    </div>
                  ))}

                  <div className="border-t border-border/80 pt-2 space-y-1">
                    <div className="flex items-center justify-between text-xs font-medium text-text-secondary">
                      <span>Total Tendered:</span>
                      <span className="font-mono font-bold text-text-primary">{fmtPKR(totalReceived)}</span>
                    </div>
                    {totalReceived > grandTotal && (
                      <div className="flex items-center justify-between text-xs font-medium text-emerald-500">
                        <span>Change Return:</span>
                        <span className="font-mono font-bold">{fmtPKR(totalReceived - grandTotal)}</span>
                      </div>
                    )}
                    {remainingBalance > 0 && (
                      <div className="flex items-center justify-between text-xs font-bold text-warning">
                        <span>Remaining Due (Customer Ledger):</span>
                        <span className="font-mono">{fmtPKR(remainingBalance)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between font-extrabold text-sm pt-1 border-t border-dashed border-border/80">
                      <span className="text-text-primary">Net Total Payable:</span>
                      <span className="text-[#006970] dark:text-[#00B4BB] font-mono text-base">
                        {fmtPKR(grandTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. Check Warranty & Sale Notes */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-text-secondary flex items-center gap-1">
                  <ShieldIcon className="w-3.5 h-3.5 text-text-muted" />
                  Check Warranty & Terms Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. 7 Days Check Warranty / Original accessories included"
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

            </div>

            {/* Modal Footer Controls */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-border bg-muted/20">
              <Button variant="outline" size="sm" onClick={() => setShowReview(false)}>
                ← Back to POS Cart
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                onClick={handleExecuteMobileSale}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing & Printing...</span>
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    <span>Confirm Sale & Print Invoice (F12)</span>
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL 3: Mobile Return & Mobile Replace Quick Action Dialog
         ═══════════════════════════════════════════════════════════════════════ */}
      {actionNoticeModal.open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card
            variant="default"
            padding="md"
            className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl flex flex-col gap-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                {actionNoticeModal.mode === 'RETURN' ? (
                  <RotateCcw className="w-4 h-4 text-amber-500" />
                ) : (
                  <Repeat className="w-4 h-4 text-purple-500" />
                )}
                <h3 className="text-sm font-bold text-text-primary">{actionNoticeModal.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActionNoticeModal((s) => ({ ...s, open: false }))}
                className="p-1 text-text-muted hover:text-text-primary rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-text-secondary block mb-1">
                  Scan or Enter Sold IMEI / Invoice Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 356789123456789 or INV-1024…"
                  value={actionNoticeModal.referenceInvoice}
                  onChange={(e) =>
                    setActionNoticeModal((s) => ({ ...s, referenceInvoice: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary font-mono focus:outline-none focus:border-[#006970]"
                />
              </div>

              <div>
                <label className="font-semibold text-text-secondary block mb-1">
                  {actionNoticeModal.mode === 'RETURN'
                    ? 'Return Reason / Condition Check'
                    : 'Replacement Reason & Difference Settlement'}
                </label>
                <input
                  type="text"
                  placeholder={
                    actionNoticeModal.mode === 'RETURN'
                      ? 'Customer return within check warranty…'
                      : 'Exchange with upgraded model in cart…'
                  }
                  value={actionNoticeModal.reason}
                  onChange={(e) =>
                    setActionNoticeModal((s) => ({ ...s, reason: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-[#006970]"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-surface-hover border border-border text-text-muted">
                {actionNoticeModal.mode === 'RETURN'
                  ? 'In Mobile Return mode, search the returned IMEI in the top search bar to add it as a Return item. The refund can be settled via Cash, JazzCash, EasyPaisa, or Customer Ledger.'
                  : 'In Mobile Replace mode, use the RETURN / NEW toggle inside the top search dropdown to add both the incoming returned mobile and the outgoing replacement mobile.'}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPosMode('SALE');
                  setActionNoticeModal((s) => ({ ...s, open: false }));
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const refQ = actionNoticeModal.referenceInvoice.trim().toLowerCase();
                  if (refQ) {
                    const matched = allDevices.find(
                      (d) =>
                        (d.imeis && d.imeis.some((i) => i.imei.toLowerCase() === refQ)) ||
                        (d.serial_number && d.serial_number.toLowerCase() === refQ)
                    );
                    if (matched && !isInCart(matched.id)) {
                      addToCart(matched, 'RETURN');
                    } else {
                      setSearchQuery(actionNoticeModal.referenceInvoice.trim());
                      setSearchDropdownOpen(true);
                    }
                  }
                  toast.success(
                    `${
                      actionNoticeModal.mode === 'RETURN' ? 'Mobile Return' : 'Mobile Replace'
                    } mode active — use top search bar to scan IMEI`
                  );
                  setActionNoticeModal((s) => ({ ...s, open: false }));
                }}
              >
                Apply on POS
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
