'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Package,
  Search,
  User,
  UserCircle2,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  Building2,
} from 'lucide-react';
import { useInventoryStore } from '@/features/inventory/core/inventory.store';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { DynamicMasterSelect } from '@/features/inventory/components/master-data/DynamicMasterSelect';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useQuery } from '@tanstack/react-query';
import { customerApi } from '@/services/customer.api';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { DBCustomer } from '@/types/db.types';
import { httpClient } from '@/lib/http/httpClient';
import type { Branch } from '@/lib/tauri/tauriClient';
import toast from 'react-hot-toast';

export interface CustomerVoucherModalProps {
  customer?: {
    id: string;
    name: string;
    phone?: string;
    currentBalance?: number;
    creditLimit?: number;
  } | null;
  onClose: () => void;
  onSuccess?: (voucherData: any) => void;
}

const FieldError: React.FC<{ message?: string }> = ({ message }) =>
  message ? (
    <p className="text-[11px] text-danger flex items-center gap-1 mt-0.5">
      <AlertCircle className="w-3 h-3 shrink-0" />
      {message}
    </p>
  ) : null;

export const PosCustomerVoucherModal: React.FC<CustomerVoucherModalProps> = ({
  customer: initialCustomer,
  onClose,
  onSuccess,
}) => {
  // ── Product Creation Hook & Inventory Store ────────────────────────────────
  const { createProduct } = useProducts({ page: 1, limit: 10 }, { enabled: false });
  const fetchProducts = useInventoryStore((state) => state.fetchProducts);
  const inventoryProducts = useInventoryStore((s) => s.products);

  // ── User Auth & Active Shop Context ─────────────────────────────────────────
  const user = useAuthStore((s) => s.user);
  const activeShop = useOrganizationStore((s) => s.activeShop);
  const activeShopId = useOrganizationStore((s) => s.activeShopId);

  const isOrgAdmin =
    user?.role === 'ADMIN' ||
    user?.role === 'OWNER' ||
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'MULTI_ADMIN';

  const userBranchId = (user as any)?.branch_id || (user as any)?.branchId || (user as any)?.shopId || null;

  // ── Branches state (for stock destination) ─────────────────────────────────
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [isLoadingBranches, setIsLoadingBranches] = useState<boolean>(false);

  // ── Product search state ───────────────────────────────────────────────────
  const [productQuery, setProductQuery] = useState('');
  const [debouncedProductQuery, setDebouncedProductQuery] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [isProductDropOpen, setProductDropOpen] = useState(false);
  const [selectedProductIdx, setSelectedProductIdx] = useState(0);
  const productDropRef = useRef<HTMLDivElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ── Selected Existing Inventory Product vs New Form ─────────────────────────
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<any | null>(null);

  // ── Form State ──────────────────────────────────────────────────────────────
  // 1. Basic Information
  const [name, setName] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [salePrice, setSalePrice] = useState(''); // Inventory Catalog Sale Price

  // POS Sale-time override & Open stock placed in the highlighted box
  const [customSalePrice, setCustomSalePrice] = useState(''); // POS Accepted Sale Price
  const [openStock, setOpenStock] = useState('1');

  // 2. Product Classification (Uses organization master data)
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [colorId, setColorId] = useState('');
  const [qualityId, setQualityId] = useState('');

  // ── Customer state ──────────────────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState<DBCustomer | null>(
    initialCustomer ? (initialCustomer as unknown as DBCustomer) : null
  );
  const [customerQuery, setCustomerQuery] = useState('');
  const [isCustDropOpen, setCustDropOpen] = useState(false);
  const [selectedCustIdx, setSelectedCustIdx] = useState(0);
  const custDropRef = useRef<HTMLDivElement>(null);

  // ── Validation & submit state ───────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Load branches on mount and default to Main Branch or User's Branch ──────
  useEffect(() => {
    let cancelled = false;
    setIsLoadingBranches(true);
    httpClient.get<Branch[]>('/api/v1/branches')
      .then((list) => {
        if (cancelled) return;
        if (list && list.length > 0) {
          setBranches(list);

          let targetBranch: Branch | undefined;

          // 1. If non-admin user is tagged to a branch, default/tag to their assigned branch
          if (!isOrgAdmin && userBranchId) {
            targetBranch = list.find((b) => b.id === userBranchId);
          }

          // 2. Otherwise check active shop context from POS / UI navigation
          if (!targetBranch && (activeShopId || activeShop?._id)) {
            const targetId = activeShopId || activeShop?._id;
            targetBranch = list.find((b) => b.id === targetId);
          }

          // 3. Default to Main Branch for vouchers
          if (!targetBranch) {
            targetBranch = list.find(
              (b) => b.code === 'MAIN' || b.name.toLowerCase().includes('main branch') || b.name.toLowerCase() === 'main'
            );
          }

          // 4. Fallback to warehouse or first available
          if (!targetBranch) {
            targetBranch =
              list.find((b) => b.id === '00000000-0000-0000-0000-000000000003') ||
              list.find((b) => b.code === 'WAREHOUSE' || b.name.toLowerCase().includes('warehouse')) ||
              list[0];
          }

          if (targetBranch) {
            setSelectedBranchId(targetBranch.id);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('[PosCustomerVoucherModal] Failed to load branches:', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingBranches(false);
      });

    // Load remembered master selections if available
    try {
      const remembered = localStorage.getItem('niazi_last_product_masters') || localStorage.getItem('tijaratpro_last_product_masters');
      if (remembered) {
        const parsed = JSON.parse(remembered);
        if (parsed.categoryId) setCategoryId(parsed.categoryId);
        if (parsed.brandId) setBrandId(parsed.brandId);
        if (parsed.companyId) setCompanyId(parsed.companyId);
        if (parsed.colorId) setColorId(parsed.colorId);
        if (parsed.qualityId) setQualityId(parsed.qualityId);
      }
    } catch (e) {
      // ignore
    }

    return () => {
      cancelled = true;
    };
  }, [isOrgAdmin, userBranchId, activeShopId, activeShop]);

  // ── Customer search query ───────────────────────────────────────────────────
  const { data: customerResponse, isLoading: isCustLoading } = useQuery({
    queryKey: queryKeys.customers.search(customerQuery),
    queryFn: () => customerApi.searchCustomers(customerQuery),
    enabled: customerQuery.trim().length > 0,
    staleTime: 60_000,
  });
  const customerResults: DBCustomer[] = customerResponse?.data || [];

  // ── Debounce product search ─────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedProductQuery(productQuery), 250);
    return () => clearTimeout(t);
  }, [productQuery]);

  // ── Filter inventory products ───────────────────────────────────────────────
  useEffect(() => {
    if (!debouncedProductQuery.trim()) {
      setProductResults([]);
      setProductDropOpen(false);
      return;
    }
    const q = debouncedProductQuery.toLowerCase();
    const filtered = inventoryProducts
      .filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.company || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.color || '').toLowerCase().includes(q) ||
        (p.quality || '').toLowerCase().includes(q)
      )
      .slice(0, 15);
    setProductResults(filtered);
    setSelectedProductIdx(0);
    setProductDropOpen(true);
  }, [debouncedProductQuery, inventoryProducts]);

  // ── Click-outside handlers ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (productDropRef.current && !productDropRef.current.contains(e.target as Node)) {
        setProductDropOpen(false);
      }
      if (custDropRef.current && !custDropRef.current.contains(e.target as Node)) {
        setCustDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Select an existing inventory product ────────────────────────────────────
  const handleSelectInventoryProduct = (p: any) => {
    setSelectedInventoryItem(p);
    setName(p.name || '');
    const detectedPurchase = String(p.purchasePrice ?? p.costPrice ?? '');
    const detectedSale = String(p.price ?? p.salePrice ?? '');
    setPurchasePrice(detectedPurchase);
    setSalePrice(detectedSale);
    // Autofill customSalePrice with existing sale price if empty
    setCustomSalePrice((prev) => (prev ? prev : detectedSale));
    setCategoryId(p.categoryId || p.category_id || '');
    setBrandId(p.brandId || p.brand_id || '');
    setCompanyId(p.companyId || p.company_id || '');
    setColorId(p.colorId || p.color_id || '');
    setQualityId(p.qualityId || p.quality_id || '');
    setOpenStock('1');
    setProductQuery('');
    setProductDropOpen(false);
    setErrors({});
  };

  // ── Clear selected product & reset form ─────────────────────────────────────
  const handleClearProduct = () => {
    setSelectedInventoryItem(null);
    setName('');
    setPurchasePrice('');
    setSalePrice('');
    setCustomSalePrice('');
    setOpenStock('1');
    setErrors({});
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!name.trim()) {
      errs.name = 'Product name is required.';
    }

    const costNum = parseFloat(purchasePrice);
    if (!purchasePrice || isNaN(costNum) || costNum <= 0) {
      errs.purchaseCost = 'Purchase price must be greater than 0.';
    }

    const saleNum = parseFloat(salePrice);
    if (!salePrice || isNaN(saleNum) || saleNum <= 0) {
      errs.salePrice = 'Sale price must be greater than 0.';
    }

    const effectiveCustomPrice = customSalePrice.trim() ? parseFloat(customSalePrice) : saleNum;
    if (isNaN(effectiveCustomPrice) || effectiveCustomPrice <= 0) {
      errs.customSalePrice = 'Custom sale price must be greater than 0.';
    }

    const stockNum = parseFloat(openStock);
    if (isNaN(stockNum) || stockNum < 0) {
      errs.openStock = 'Open stock must be 0 or greater.';
    }

    if (!selectedInventoryItem) {
      if (!categoryId.trim()) {
        errs.category = 'Type (Category) is required.';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit / Create Voucher & Add Stock to Inventory ─────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);

    try {
      let finalProduct = selectedInventoryItem;
      const actualAcceptedSalePrice = customSalePrice.trim() ? Number(customSalePrice) : Number(salePrice);
      const catalogSalePrice = Number(salePrice) || actualAcceptedSalePrice;

      // If not from inventory, instantly create product and add open stock
      if (!selectedInventoryItem) {
        // Remember master selections for convenience
        try {
          localStorage.setItem('niazi_last_product_masters', JSON.stringify({
            categoryId,
            brandId,
            companyId,
            colorId,
            qualityId,
          }));
        } catch (e) {
          // ignore
        }

        const autoCode = 'PRD-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const qtyNumber = Number(openStock) || 0;

        const newProductPayload = {
          name: name.trim(),
          productCode: autoCode,
          sku: autoCode,
          barcode: '',
          description: 'Created via POS Product Voucher',
          categoryId,
          brandId: brandId || undefined,
          companyId: companyId || undefined,
          colorId: colorId || undefined,
          qualityId: qualityId || undefined,
          purchasePrice: Number(purchasePrice) || 0,
          price: catalogSalePrice, // Inventory catalog sale price
          quantity: qtyNumber,
          branchId: selectedBranchId || undefined,
          branch_id: selectedBranchId || undefined,
          lowStockThreshold: 2,
          trackInventory: true,
        };

        const created = await createProduct(newProductPayload);
        finalProduct = created || {
          ...newProductPayload,
          id: (created as any)?.id || autoCode,
        };

        // Immediately refresh inventory cache
        try {
          fetchProducts({ scope: 'organization' });
        } catch (e) {
          // ignore
        }

        toast.success(`Product "${name.trim()}" added to inventory with ${qtyNumber} units!`);
      }

      // ── Persist voucher to backend (/api/v1/pos/vouchers) ─────────────────────
      // INSTANT_INVENTORY: registration-only, no payment tenders required.
      // The backend service enforces this — payments array MUST be empty for this type.
      const idempotencyKey = `vchr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const productId: string | null = (finalProduct as any)?.id || (finalProduct as any)?._id || null;

      const voucherDto = {
        voucher_type: 'INSTANT_INVENTORY' as const,
        branch_id: selectedBranchId || null,
        customer_id: selectedCustomer
          ? ((selectedCustomer as any).id || (selectedCustomer as any)._id || null)
          : null,
        customer_name: selectedCustomer ? selectedCustomer.name : 'Walk-In Customer',
        customer_phone: selectedCustomer ? (selectedCustomer as any).phone || null : null,
        product_id: productId,
        product_name: name.trim(),
        spec_category: categoryId || null,
        spec_brand: brandId || null,
        spec_company: companyId || null,
        spec_color: colorId || null,
        spec_quality: qualityId || null,
        voucher_qty: Math.max(1, Number(openStock) || 1),
        locked_purchase_price: Number(purchasePrice) || 0,
        catalog_sale_price: catalogSalePrice || null,
        voucher_sale_price: actualAcceptedSalePrice || catalogSalePrice || 0,
        payments: [], // INSTANT_INVENTORY: no advance payment collected at registration
        notes: null,
        idempotency_key: idempotencyKey,
      };

      let backendVoucher: any = null;
      try {
        const response = await httpClient.post('/api/v1/pos/vouchers', voucherDto);
        backendVoucher = (response as any)?.data ?? response;
      } catch (voucherErr: any) {
        // Log but do not block the UI — the product was already created.
        // The POS operator should be notified so they can retry if needed.
        console.error('[PosCustomerVoucherModal] Backend voucher registration failed:', voucherErr);
        const vErrMsg =
          voucherErr?.response?.data?.message ||
          voucherErr?.message ||
          'Voucher registration failed — product was saved but voucher record was not created.';
        toast.error(`Voucher Warning: ${vErrMsg}`);
        // Continue flow — do not re-throw, let onSuccess receive partial payload
      }

      // Build voucher result payload (enriched with backend response if available)
      const voucherPayload = {
        voucherId: backendVoucher?.id || backendVoucher?.voucher?.id || null,
        voucherNumber: backendVoucher?.voucher_number || backendVoucher?.voucher?.voucher_number || null,
        product: {
          id: productId,
          name: name.trim(),
          purchaseCost: purchasePrice,
          salePrice: catalogSalePrice,
          customSalePrice: actualAcceptedSalePrice,
          acceptedSalePrice: actualAcceptedSalePrice,
          categoryId,
          brandId,
          companyId,
          colorId,
          qualityId,
          openStock: openStock,
          branchId: selectedBranchId,
          isFromInventory: !!selectedInventoryItem,
        },
        customer: selectedCustomer
          ? { id: (selectedCustomer as any).id || (selectedCustomer as any)._id, name: selectedCustomer.name }
          : { id: 'walk-in', name: 'Walk-In Customer' },
        isWalkIn: !selectedCustomer,
        createdAt: new Date().toISOString(),
      };

      toast.success(
        backendVoucher
          ? `Voucher ${backendVoucher?.voucher_number || backendVoucher?.voucher?.voucher_number || ''} created!`
          : 'Product Voucher created successfully!'
      );
      if (onSuccess) onSuccess(voucherPayload);
      setTimeout(onClose, 600);
    } catch (err: any) {
      console.error('[PosCustomerVoucherModal] Creation failed:', err);
      const errMsg =
        err?.response?.data?.message ||
        err?.message ||
        (typeof err === 'string' ? err : '') ||
        'Failed to save product in inventory.';
      toast.error(`Error: ${errMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Branch locked if non-org-admin user is tagged to a specific branch
  const isBranchLocked = !isOrgAdmin && !!userBranchId;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[95vh] overflow-hidden">

        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-border bg-surface-hover/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-text-primary tracking-wide">
                  Product Advance Voucher
                </h3>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                  Instant Inventory Add
                </span>
              </div>
              <p className="text-xs text-text-muted">
                Configure catalog specifications, pricing, and add open stock directly into inventory with this voucher.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Branch Destination Selector (Defaults to Main Branch / User Branch) */}
            <div className="flex items-center gap-1.5 bg-surface border border-border px-2.5 py-1.5 rounded-lg text-xs">
              <Building2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                disabled={isLoadingBranches || branches.length === 0 || isBranchLocked}
                className={`bg-transparent text-xs font-semibold text-text-primary focus:outline-none cursor-pointer pr-1 ${isBranchLocked ? 'opacity-85 cursor-not-allowed' : ''}`}
                title={isBranchLocked ? 'Tagged to your assigned branch' : 'Select destination branch'}
              >
                {isLoadingBranches && <option value="">Loading branches...</option>}
                {!isLoadingBranches && branches.length === 0 && <option value="">Main Branch</option>}
                {!isLoadingBranches && branches.map((b) => (
                  <option key={b.id} value={b.id} className="bg-surface text-text-primary">
                    {b.name} {b.is_warehouse === 1 || b.id === '00000000-0000-0000-0000-000000000003' ? '(Warehouse)' : b.code ? `(${b.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <form id="advance-voucher-form" onSubmit={handleSubmit} className="flex flex-col gap-6">

            {/* ── Inventory Product Search Bar ── */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                Inventory Product Search
              </label>

              <div className="relative" ref={productDropRef}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <input
                  ref={productInputRef}
                  type="text"
                  value={productQuery}
                  disabled={!!selectedInventoryItem}
                  onChange={(e) => {
                    setProductQuery(e.target.value);
                    if (!isProductDropOpen) setProductDropOpen(true);
                  }}
                  onFocus={() => {
                    if (productResults.length > 0) setProductDropOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSelectedProductIdx((i) => Math.min(i + 1, productResults.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSelectedProductIdx((i) => Math.max(i - 1, 0));
                    } else if (e.key === 'Enter' && isProductDropOpen && productResults[selectedProductIdx]) {
                      e.preventDefault();
                      handleSelectInventoryProduct(productResults[selectedProductIdx]);
                    } else if (e.key === 'Escape') {
                      setProductDropOpen(false);
                    }
                  }}
                  placeholder="Search existing product in inventory to autofill, or enter new below..."
                  className={`w-full pl-9 pr-3 py-2.5 bg-surface border ${errors.product ? 'border-danger' : 'border-border'} focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 rounded-xl text-xs text-text-primary placeholder:text-text-muted focus:outline-none transition-all ${!!selectedInventoryItem ? 'opacity-50 cursor-not-allowed' : ''}`}
                />

                {/* Results dropdown */}
                {isProductDropOpen && debouncedProductQuery.trim() && (
                  <div className="absolute top-full left-0 mt-1.5 w-full z-50 bg-surface border border-border rounded-xl shadow-modal overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                    {productResults.length > 0 ? (
                      productResults.map((p, idx) => (
                        <div
                          key={p.id || p._id}
                          onMouseDown={() => handleSelectInventoryProduct(p)}
                          className={`px-3 py-2.5 cursor-pointer border-b border-border/50 last:border-0 transition-colors ${idx === selectedProductIdx ? 'bg-teal-500/10' : 'hover:bg-surface-hover'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-bold text-text-primary leading-snug">{p.name}</span>
                            <span className="text-xs font-black tabular-nums text-text-secondary shrink-0">
                              Rs {(p.price ?? p.salePrice ?? 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {p.category && p.category !== '-' && (
                              <span className="px-1.5 py-0 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded text-[9px] font-bold uppercase">
                                {p.category}
                              </span>
                            )}
                            {p.brand && p.brand !== '-' && (
                              <span className="px-1.5 py-0 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded text-[9px]">
                                {p.brand}
                              </span>
                            )}
                            <span className="text-[9px] font-mono text-text-muted ml-auto">
                              Stock: {p.stock ?? 0}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center">
                        <p className="text-xs text-text-muted mb-2">
                          No inventory items found for &ldquo;{debouncedProductQuery}&rdquo;
                        </p>
                        <button
                          type="button"
                          onMouseDown={() => {
                            setProductDropOpen(false);
                            setName(productQuery.trim());
                            setProductQuery('');
                            nameInputRef.current?.focus();
                          }}
                          className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 mx-auto"
                        >
                          <Plus className="w-3.5 h-3.5" /> Use &ldquo;{productQuery.trim()}&rdquo; as new product name
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Selected existing item badge or clear button */}
            {selectedInventoryItem && (
              <div className="flex items-center justify-between p-3 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-teal-600 text-white rounded-md text-[10px] font-black uppercase tracking-wider">
                    Linked Inventory Product
                  </span>
                  <span className="text-xs font-bold text-text-primary">{selectedInventoryItem.name}</span>
                </div>
                <button
                  type="button"
                  onClick={handleClearProduct}
                  className="text-xs text-text-muted hover:text-danger flex items-center gap-1 font-bold"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Switch to New Product
                </button>
              </div>
            )}

            {/* ── Two Column Grid matching Layout ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

              {/* LEFT COLUMN: Section 1. Basic Information */}
              <div className="flex flex-col gap-6">
                <section>
                  <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-4 border-b border-border pb-2">
                    1. Basic Information
                  </h4>

                  <div className="space-y-4">
                    {/* Product Name * */}
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">
                        Product Name *
                      </label>
                      <input
                        ref={nameInputRef}
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Samsung A55"
                        readOnly={!!selectedInventoryItem}
                        className={`block w-full px-3 py-2 border ${errors.name ? 'border-danger' : 'border-border'} rounded-lg shadow-xs focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-surface text-text-primary text-xs font-bold placeholder:text-text-muted transition-all ${!!selectedInventoryItem ? 'opacity-80 cursor-default' : ''}`}
                      />
                      <FieldError message={errors.name} />
                    </div>

                    {/* Purchase Price & Sale Price (Inventory) * */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                          Purchase Price *
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-xs font-bold text-text-muted">
                            Rs.
                          </span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={purchasePrice}
                            onChange={(e) => setPurchasePrice(e.target.value)}
                            placeholder="0.00"
                            className={`block w-full pl-9 pr-3 py-2 border ${errors.purchaseCost ? 'border-danger' : 'border-border'} rounded-lg shadow-xs focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-surface text-text-primary text-xs font-black tabular-nums placeholder:text-text-muted transition-all`}
                          />
                        </div>
                        <FieldError message={errors.purchaseCost} />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                          Sale Price *
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-xs font-bold text-text-muted">
                            Rs.
                          </span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={salePrice}
                            onChange={(e) => {
                              setSalePrice(e.target.value);
                              // Auto-sync custom sale price if user hasn't typed an explicit custom one
                              if (!customSalePrice) setCustomSalePrice(e.target.value);
                            }}
                            placeholder="0.00"
                            className={`block w-full pl-9 pr-3 py-2 border ${errors.salePrice ? 'border-danger' : 'border-border'} rounded-lg shadow-xs focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-surface text-text-primary text-xs font-black tabular-nums placeholder:text-text-muted transition-all`}
                          />
                        </div>
                        <FieldError message={errors.salePrice} />
                      </div>
                    </div>
                  </div>
                </section>

                {/* ── HIGHLIGHTED SECTION: Custom Sale Price & Open Stock ── */}
                <div className="border border-border/80 bg-surface-hover/40 rounded-xl p-3.5 flex flex-col gap-3 shadow-xs">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Custom Sale Price */}
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">
                        Custom Sale Price
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-xs font-bold text-text-muted">
                          Rs.
                        </span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={customSalePrice}
                          onChange={(e) => setCustomSalePrice(e.target.value)}
                          placeholder={salePrice || '0.00'}
                          className={`block w-full pl-9 pr-3 py-2 border ${errors.customSalePrice ? 'border-danger' : 'border-border'} rounded-lg shadow-xs focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-surface text-text-primary text-xs font-black tabular-nums placeholder:text-text-muted transition-all`}
                        />
                      </div>
                      <FieldError message={errors.customSalePrice} />
                    </div>

                    {/* Open Stock * */}
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">
                        Open Stock *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={openStock}
                        onChange={(e) => setOpenStock(e.target.value)}
                        placeholder="0"
                        className={`block w-full px-3 py-2 border ${errors.openStock ? 'border-danger' : 'border-border'} rounded-lg shadow-xs focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-surface text-text-primary text-xs font-black tabular-nums placeholder:text-text-muted transition-all`}
                      />
                      <FieldError message={errors.openStock} />
                    </div>
                  </div>
                </div>

              </div>

              {/* RIGHT COLUMN: Section 2. Product Classification */}
              <div className="flex flex-col gap-6">

                {/* Section 2: Product Classification */}
                <section>
                  <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-4 border-b border-border pb-2">
                    2. Product Classification
                  </h4>

                  <div className="space-y-4">
                    {/* Type * & Brand */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                          Type *
                        </label>
                        <DynamicMasterSelect
                          entity="category"
                          value={categoryId}
                          onChange={(v) => setCategoryId(v)}
                          showAddButton
                          hideAllOption
                        />
                        <FieldError message={errors.category} />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                          Brand
                        </label>
                        <DynamicMasterSelect
                          entity="brand"
                          value={brandId}
                          onChange={(v) => setBrandId(v)}
                          showAddButton
                          hideAllOption
                        />
                      </div>
                    </div>

                    {/* Company & Color */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                          Company
                        </label>
                        <DynamicMasterSelect
                          entity="company"
                          value={companyId}
                          onChange={(v) => setCompanyId(v)}
                          showAddButton
                          hideAllOption
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                          Color
                        </label>
                        <DynamicMasterSelect
                          entity="color"
                          value={colorId}
                          onChange={(v) => setColorId(v)}
                          showAddButton
                          hideAllOption
                        />
                      </div>
                    </div>

                    {/* Quality */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                          Quality
                        </label>
                        <DynamicMasterSelect
                          entity="quality"
                          value={qualityId}
                          onChange={(v) => setQualityId(v)}
                          showAddButton
                          hideAllOption
                        />
                      </div>
                    </div>
                  </div>
                </section>

              </div>
            </div>

            {/* ── Section 3: Customer Selection ── */}
            <div className="border-t border-border pt-4 flex flex-col gap-2">
              <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                Customer
                <span className="text-text-muted font-medium normal-case text-[10px]">
                  — optional, leave blank for walk-in
                </span>
              </label>

              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3 bg-surface-hover/60 border border-border rounded-xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <UserCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-text-primary">{selectedCustomer.name}</p>
                      <p className="text-[10px] text-text-muted font-mono">
                        {selectedCustomer.phone || (selectedCustomer as any).mobile || 'No phone'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedCustomer(null); setCustomerQuery(''); }}
                    className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                    title="Clear customer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative" ref={custDropRef}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input
                    type="text"
                    value={customerQuery}
                    onChange={(e) => {
                      setCustomerQuery(e.target.value);
                      setCustDropOpen(true);
                      setSelectedCustIdx(0);
                    }}
                    onFocus={() => {
                      if (customerQuery.trim().length > 0) setCustDropOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (!isCustDropOpen || customerResults.length === 0) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSelectedCustIdx((i) => Math.min(i + 1, customerResults.length - 1));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSelectedCustIdx((i) => Math.max(i - 1, 0));
                      } else if (e.key === 'Enter' && customerResults[selectedCustIdx]) {
                        e.preventDefault();
                        setSelectedCustomer(customerResults[selectedCustIdx]);
                        setCustomerQuery('');
                        setCustDropOpen(false);
                      } else if (e.key === 'Escape') {
                        setCustDropOpen(false);
                      }
                    }}
                    placeholder="Search customer name or phone number..."
                    className="w-full pl-9 pr-3 py-2 bg-surface border border-border focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 rounded-xl text-xs text-text-primary placeholder:text-text-muted focus:outline-none transition-all"
                  />

                  {isCustDropOpen && customerQuery.trim().length > 0 && (
                    <div className="absolute top-full left-0 mt-1.5 w-full z-50 bg-surface border border-border rounded-xl shadow-modal overflow-hidden max-h-48 overflow-y-auto custom-scrollbar p-1">
                      {isCustLoading ? (
                        <div className="p-3 text-xs text-text-muted text-center">Searching customers...</div>
                      ) : customerResults.length > 0 ? (
                        <ul className="space-y-0.5">
                          {customerResults.map((c, idx) => (
                            <li
                              key={(c as any).id || (c as any)._id}
                              onMouseDown={() => {
                                setSelectedCustomer(c);
                                setCustomerQuery('');
                                setCustDropOpen(false);
                              }}
                              className={`px-3 py-2 rounded-lg cursor-pointer flex justify-between items-center transition-colors ${
                                idx === selectedCustIdx
                                  ? 'bg-teal-500/10 text-teal-600'
                                  : 'hover:bg-surface-hover text-text-primary'
                              }`}
                            >
                              <div>
                                <p className="text-xs font-bold">{c.name}</p>
                                <p className="text-[10px] text-text-muted">
                                  {c.phone || (c as any).mobile || 'No phone'}
                                </p>
                              </div>
                              <span className="text-xs font-black tabular-nums text-text-secondary shrink-0">
                                Rs {((c as any).currentBalance || 0).toLocaleString()}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="p-3 text-xs text-text-muted text-center">
                          No customers found for &ldquo;{customerQuery}&rdquo;
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

          </form>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-border bg-surface-hover/30 shrink-0 flex flex-col gap-2.5">
          {!selectedCustomer && (
            <p className="text-[10px] text-text-muted flex items-center gap-1.5">
              <UserCircle2 className="w-3.5 h-3.5 text-text-muted shrink-0" />
              No customer selected — will be recorded as a walk-in cash advance voucher.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border border-border bg-surface hover:bg-surface-hover text-text-secondary font-bold text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="advance-voucher-form"
              disabled={isSubmitting}
              className="h-10 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wide transition-all shadow-md flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <CheckCircle className="w-4 h-4 animate-bounce" />
                  <span>Registering Stock & Creating Voucher...</span>
                </>
              ) : (
                <>
                  <Package className="w-4 h-4" />
                  <span>Create Voucher & Add Stock</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
