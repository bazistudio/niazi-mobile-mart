'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Plus, Minus, AlertTriangle, Package, RefreshCw, CheckCircle2, 
  ShieldAlert, DollarSign, Tag, Search, Truck, Layers, Building, 
  Palette, Sparkles, Check
} from 'lucide-react';
import { InventoryProduct, InventoryAdjustmentType } from '../types';
import { stockService } from '../stock/stock.service';
import { useInventoryStore } from '../core/inventory.store';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMISSIONS } from '@/constants/permissions';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { supplierApi, FrontendSupplier } from '@/services/supplier.api';
import toast from 'react-hot-toast';

interface QuickStockAdjustModalProps {
  product: InventoryProduct;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialMode?: 'RESTOCK' | 'ADJUST';
}

export const QuickStockAdjustModal: React.FC<QuickStockAdjustModalProps> = ({
  product: initialProduct,
  isOpen,
  onClose,
  onSuccess,
  initialMode
}) => {
  const { hasPermission, role } = usePermissions();
  const canManageInventory = hasPermission(PERMISSIONS.INVENTORY_EDIT);
  const isOrgAdmin = role === 'SUPER_ADMIN' || role === 'MULTI_ADMIN' || role === 'OWNER' || role === 'ADMIN';
  
  const allProducts = useInventoryStore(state => state.products);
  const fetchProducts = useInventoryStore(state => state.fetchProducts);

  // Active product (can be switched via search bar if needed)
  const [activeProduct, setActiveProduct] = useState<InventoryProduct>(initialProduct);
  const [productSearch, setProductSearch] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // Suppliers state
  const [suppliers, setSuppliers] = useState<FrontendSupplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState<boolean>(false);

  // Form states
  const defaultDirection = initialMode === 'RESTOCK' || canManageInventory ? 'increase' : 'decrease';
  const [direction, setDirection] = useState<'increase' | 'decrease'>(defaultDirection);
  const [amount, setAmount] = useState<number>(1);
  const [unitCost, setUnitCost] = useState<number>(initialProduct.purchasePrice ?? 0);
  const [salePrice, setSalePrice] = useState<number>(initialProduct.price ?? 0);
  const [adjustmentType, setAdjustmentType] = useState<string>(
    initialMode === 'RESTOCK' || canManageInventory ? 'RESTOCK' : 'DAMAGE'
  );
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronize when product changes
  useEffect(() => {
    setActiveProduct(initialProduct);
    setUnitCost(initialProduct.purchasePrice ?? 0);
    setSalePrice(initialProduct.price ?? 0);
  }, [initialProduct]);

  // Load suppliers
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setIsLoadingSuppliers(true);
    supplierApi.getSuppliers(1, 100)
      .then(res => {
        if (isMounted && res.success && res.data) {
          setSuppliers(res.data);
          if (res.data.length > 0 && !selectedSupplierId) {
            setSelectedSupplierId(res.data[0].id);
          }
        }
      })
      .catch(err => {
        console.error('Failed to load suppliers:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingSuppliers(false);
      });
    return () => { isMounted = false; };
  }, [isOpen]);

  // Filtered products for search dropdown
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return [];
    const q = productSearch.toLowerCase().trim();
    return allProducts.filter(p => 
      p.name.toLowerCase().includes(q) || 
      (p.sku && p.sku.toLowerCase().includes(q)) || 
      (p.barcode && p.barcode.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [allProducts, productSearch]);

  if (!isOpen) return null;

  const isRestock = direction === 'increase' && adjustmentType === 'RESTOCK';
  const currentStock = activeProduct.stock || 0;
  const previousPurchasePrice = activeProduct.purchasePrice ?? 0;
  const currentSalePrice = activeProduct.price ?? 0;
  const currentAvgCost = activeProduct.averageCost ?? activeProduct.purchasePrice ?? 0;

  const calculatedNewStock = direction === 'increase'
    ? currentStock + (Number(amount) || 0)
    : Math.max(0, currentStock - (Number(amount) || 0));

  // Projected WAC: C_WAC = round((Q_old * C_old + Q_rec * C_new) / (Q_old + Q_rec))
  const qOld = currentStock;
  const qRec = Number(amount) || 0;
  const cNew = Number(unitCost) || 0;
  const projectedWac = qOld + qRec > 0
    ? Math.round((qOld * currentAvgCost + qRec * cNew) / (qOld + qRec))
    : cNew;

  const handleAmountChange = (val: number) => {
    setAmount(Math.max(1, Math.floor(val)));
    setError(null);
  };

  const handleSelectProduct = (p: InventoryProduct) => {
    setActiveProduct(p);
    setUnitCost(p.purchasePrice ?? 0);
    setSalePrice(p.price ?? 0);
    setProductSearch('');
    setIsSearchOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageInventory) {
      toast.error('Permission denied: inventory.edit permission required.');
      return;
    }

    if (direction === 'increase' && adjustmentType !== 'RESTOCK' && !isOrgAdmin) {
      const msg = 'Manual stock increase requires Organization Admin. Use Stock Restock to receive inventory.';
      setError(msg);
      toast.error(msg);
      return;
    }

    if (amount <= 0) {
      setError('Adjustment amount must be at least 1.');
      return;
    }

    if (direction === 'decrease' && amount > currentStock && adjustmentType !== 'MANUAL_CORRECTION') {
      setError(`Cannot decrease stock by ${amount}. Only ${currentStock} available.`);
      return;
    }

    if (isRestock && unitCost < 0) {
      setError('Unit cost cannot be negative.');
      return;
    }

    if (isRestock && salePrice < 0) {
      setError('Sale price cannot be negative.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      if (isRestock) {
        const store = useOrganizationStore.getState();
        const branchId = store.activeShop?._id || store.activeShop?.id || store.activeShopId;
        if (!branchId) {
          throw new Error('No active branch selected. Please select a shop before restocking.');
        }

        const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);
        const supplierNote = selectedSupplier ? `Vendor: ${selectedSupplier.name}` : '';
        const finalNotes = [reason.trim(), supplierNote].filter(Boolean).join(' | ') || `Supplier restock: +${amount} units @ Rs ${Math.round(unitCost)}`;

        const result = await stockService.receiveStock({
          product_id: activeProduct.id,
          branch_id: branchId,
          quantity_received: amount,
          unit_cost: Math.round(unitCost),
          new_sale_price: Math.round(salePrice),
          supplier_id: selectedSupplierId || null,
          notes: finalNotes,
        });

        toast.success(
          `Stock restocked: ${result.new_quantity} ${activeProduct.unit || 'units'} · Purchase: Rs ${Math.round(unitCost).toLocaleString()} · Sale: Rs ${Math.round(salePrice).toLocaleString()}`
        );
      } else {
        let targetType: InventoryAdjustmentType;
        if (adjustmentType === 'DAMAGE') {
          targetType = InventoryAdjustmentType.DAMAGE;
        } else {
          targetType = direction === 'increase'
            ? InventoryAdjustmentType.INCREASE
            : InventoryAdjustmentType.DECREASE;
        }

        const notes = reason.trim() || `${direction === 'increase' ? 'Increased' : 'Decreased'} by ${amount} (${adjustmentType})`;
        await stockService.adjustStock(activeProduct.id, amount, targetType, notes);
        toast.success(`Stock successfully updated to ${calculatedNewStock} ${activeProduct.unit || 'units'}`);
      }

      await fetchProducts();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Failed to adjust stock.';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-4xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* ── 1. Top Header with ACTION BUTTONS ON TOP RIGHT ── */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#006970]/15 text-[#006970] dark:bg-[#006970]/25 dark:text-[#00B4BB] border border-[#006970]/30 flex items-center justify-center shadow-inner">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white leading-tight">
                {isRestock ? 'Stock Restock & Receive Inventory' : 'Quick Stock Adjust'}
              </h2>
              <p className="text-xs text-neutral-500">
                {isRestock ? 'Adjust unit cost, live selling price & branch stock balance' : 'Modify live inventory balance'}
              </p>
            </div>
          </div>

          {/* Action Buttons in Header */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !canManageInventory}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#006970] to-[#00878e] hover:from-[#005a60] hover:to-[#00747b] text-white text-xs font-bold shadow-md shadow-[#006970]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isRestock ? 'Receiving...' : 'Updating...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isRestock ? 'Confirm & Receive Stock' : 'Confirm Adjust'}</span>
                </>
              )}
            </button>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="overflow-y-auto p-5 sm:p-6 space-y-4">
          {!canManageInventory && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>You do not have permission to modify inventory stock.</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── 2. Product Search Bar ── */}
          <div className="relative">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-3.5 text-neutral-400 pointer-events-none" />
              <input
                type="text"
                value={productSearch}
                onChange={e => {
                  setProductSearch(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Search product by name, barcode, or SKU to switch product..."
                className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#006970]"
              />
            </div>

            {/* Search Dropdown */}
            {isSearchOpen && filteredProducts.length > 0 && (
              <div className="absolute left-0 right-0 top-12 z-20 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl overflow-hidden py-1 max-h-56 overflow-y-auto">
                {filteredProducts.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProduct(p)}
                    className="w-full px-4 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/60 flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-neutral-900 dark:text-white">{p.name}</div>
                      <div className="text-neutral-400 font-mono text-[11px]">{p.sku} · {p.category}</div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-neutral-800 dark:text-neutral-200">{p.stock || 0}</span>
                      <span className="text-neutral-500 text-[10px]"> in stock</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── 3. Product Name & Comprehensive Specifications Card ── */}
          <div className="p-4 bg-neutral-50 dark:bg-neutral-950/70 border border-neutral-200/80 dark:border-neutral-800/80 rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wider font-bold text-neutral-400">Selected Product</div>
                <h3 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white truncate">
                  {activeProduct.name}
                </h3>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/60 rounded-full self-start sm:self-center">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  Current Branch Stock: {currentStock} {activeProduct.unit || 'units'}
                </span>
              </div>
            </div>

            {/* Specifications Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {activeProduct.sku && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#006970]/10 border border-[#006970]/30 text-xs font-mono font-bold text-[#006970] dark:text-[#00B4BB]">
                  SKU: {activeProduct.sku}
                </span>
              )}
              {activeProduct.category && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-200/60 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-700 dark:text-neutral-300">
                  <Layers className="w-3 h-3 text-neutral-400" />
                  Category: <strong className="text-neutral-900 dark:text-white">{activeProduct.category}</strong>
                </span>
              )}
              {activeProduct.brand && activeProduct.brand !== '-' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-200/60 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-700 dark:text-neutral-300">
                  <Building className="w-3 h-3 text-neutral-400" />
                  Brand: <strong className="text-neutral-900 dark:text-white">{activeProduct.brand}</strong>
                </span>
              )}
              {activeProduct.color && activeProduct.color !== '-' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-200/60 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-700 dark:text-neutral-300">
                  <Palette className="w-3 h-3 text-neutral-400" />
                  Color: <strong className="text-neutral-900 dark:text-white">{activeProduct.color}</strong>
                </span>
              )}
              {activeProduct.quality && activeProduct.quality !== '-' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-200/60 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-700 dark:text-neutral-300">
                  <Sparkles className="w-3 h-3 text-neutral-400" />
                  Quality: <strong className="text-neutral-900 dark:text-white">{activeProduct.quality}</strong>
                </span>
              )}
            </div>
          </div>

          {/* ── 4. Form Grid: Quantity & Comparative Pricing ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left: Quantity to Restock Card (4 cols) */}
            <div className="lg:col-span-4 p-4 bg-neutral-50 dark:bg-neutral-950/70 border border-neutral-200/80 dark:border-neutral-800/80 rounded-xl space-y-3.5 flex flex-col justify-between">
              <div>
                <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                  {isRestock ? 'Quantity to Restock' : 'Quantity to Adjust'}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAmountChange(amount - 1)}
                    disabled={amount <= 1 || isSubmitting}
                    className="w-11 h-11 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-200 font-bold hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40 transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={amount}
                    onChange={e => handleAmountChange(parseInt(e.target.value, 10) || 1)}
                    className="flex-1 h-11 text-center bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl text-lg font-black text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970] tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => handleAmountChange(amount + 1)}
                    disabled={isSubmitting}
                    className="w-11 h-11 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-200 font-bold hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {[5, 10, 20, 50].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleAmountChange(val)}
                      className={`py-1 text-xs font-semibold rounded-lg border transition-colors ${
                        amount === val
                          ? 'bg-[#006970]/15 text-[#006970] border-[#006970]/40 dark:bg-[#006970]/25 dark:text-[#00B4BB]'
                          : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                      }`}
                    >
                      +{val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stock Progression Indicator */}
              <div className="p-3 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                  Projected Stock Balance
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-neutral-500 tabular-nums">
                    {currentStock} units
                  </span>
                  <span className="text-xs font-bold text-[#006970] dark:text-[#00B4BB]">➔</span>
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {calculatedNewStock} {activeProduct.unit || 'units'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: 3 Comparative Pricing Cards (8 cols) */}
            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Card 1: Historical Baseline + AVERAGE COST */}
              <div className="p-3.5 bg-neutral-50 dark:bg-neutral-950/70 border border-neutral-200/80 dark:border-neutral-800/80 rounded-xl flex flex-col justify-between space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                  Pricing Baseline
                </div>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-neutral-500 block text-[11px]">Prev. Purchase:</span>
                    <span className="text-sm font-bold text-neutral-800 dark:text-neutral-200 tabular-nums">
                      Rs {previousPurchasePrice.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[11px]">Current Sale:</span>
                    <span className="text-sm font-bold text-neutral-800 dark:text-neutral-200 tabular-nums">
                      Rs {currentSalePrice.toLocaleString()}
                    </span>
                  </div>
                  <div className="pt-1.5 border-t border-neutral-200 dark:border-neutral-800">
                    <span className="text-neutral-500 block text-[11px]">Average Cost (WAC):</span>
                    <span className="text-sm font-black text-[#006970] dark:text-[#00B4BB] tabular-nums">
                      Rs {currentAvgCost.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: New Purchase Price (Input) */}
              <div className="p-3.5 bg-white dark:bg-neutral-900 border-2 border-[#006970]/50 dark:border-[#006970]/60 rounded-xl flex flex-col justify-between space-y-2 shadow-sm">
                <div>
                  <label className="block text-[11px] font-bold text-[#006970] dark:text-[#00B4BB] uppercase tracking-wider mb-1">
                    New Purchase Price (Rs) *
                  </label>
                  <p className="text-[10px] text-neutral-400 mb-2 leading-tight">Supplier unit invoice cost</p>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 absolute left-2.5 top-2.5 text-neutral-400 pointer-events-none" />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={unitCost}
                      onChange={e => setUnitCost(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                      className="w-full pl-8 pr-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm font-black text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970] tabular-nums"
                    />
                  </div>
                </div>
                <div className="text-[10px] text-neutral-400 leading-tight">
                  Recalculates global WAC valuation
                </div>
              </div>

              {/* Card 3: New Sale Price (Input) */}
              <div className="p-3.5 bg-white dark:bg-neutral-900 border-2 border-[#006970]/50 dark:border-[#006970]/60 rounded-xl flex flex-col justify-between space-y-2 shadow-sm">
                <div>
                  <label className="block text-[11px] font-bold text-[#006970] dark:text-[#00B4BB] uppercase tracking-wider mb-1">
                    New Sale Price (Rs) *
                  </label>
                  <p className="text-[10px] text-neutral-400 mb-2 leading-tight">Customer retail selling price</p>
                  <div className="relative">
                    <Tag className="w-4 h-4 absolute left-2.5 top-2.5 text-neutral-400 pointer-events-none" />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={salePrice}
                      onChange={e => setSalePrice(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                      className="w-full pl-8 pr-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm font-black text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970] tabular-nums"
                    />
                  </div>
                </div>
                <div className="text-[10px] text-neutral-400 leading-tight">
                  Updates POS retail price instantly
                </div>
              </div>
            </div>
          </div>

          {/* ── 5. Live Financial Intelligence Bar ── */}
          {isRestock && (
            <div className="p-3.5 bg-gradient-to-r from-[#006970]/10 via-emerald-500/10 to-[#006970]/10 border border-[#006970]/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-neutral-500 font-medium">Projected Retail Markup:</span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold tabular-nums">
                  +Rs {(salePrice - unitCost).toLocaleString()} {unitCost > 0 ? `(${Math.round(((salePrice - unitCost) / unitCost) * 100)}%)` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-neutral-500 font-medium">New Weighted Average Cost (WAC):</span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#006970]/20 text-[#006970] dark:text-[#00B4BB] font-black tabular-nums">
                  Rs {projectedWac.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* ── 6. Dedicated Supplier / Vendor Selector & Invoice Reference ── */}
          {isRestock && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Supplier Select */}
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
                  Supplier / Vendor Select
                </label>
                <div className="relative">
                  <Truck className="w-4 h-4 absolute left-3 top-3 text-neutral-400 pointer-events-none" />
                  <select
                    value={selectedSupplierId}
                    onChange={e => setSelectedSupplierId(e.target.value)}
                    disabled={isLoadingSuppliers || isSubmitting}
                    className="w-full pl-9 pr-3 py-2 bg-neutral-50 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-xl text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970] disabled:opacity-50"
                  >
                    <option value="">-- No Supplier Selected (General Direct Purchase) --</option>
                    {suppliers.map(sup => (
                      <option key={sup.id} value={sup.id}>
                        {sup.name} {sup.phone ? `(${sup.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Invoice / PO Reference Note */}
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
                  Invoice / PO Reference (Optional)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. PO-2026-Batch 4 / Inv #9842"
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-xl text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#006970]"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
