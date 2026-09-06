'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ShoppingCart, Plus, Trash2, CheckCircle2, AlertTriangle, RefreshCw, Building2 } from 'lucide-react';
import { supplierApi } from '@/services/supplier.api';
import { purchaseApi } from '@/services/purchase.api';
import { tauriClient } from '@/lib/tauri/tauriClient';
import { useInventoryStore } from '@/features/inventory/core/inventory.store';
import { usePermissions } from '@/lib/auth/usePermissions';
import toast from 'react-hot-toast';

interface PurchaseOrderItem {
  id: string;
  productId?: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  qty: number;
  costPrice: number;
  salePrice: number;
  lowStockAlert: number;
}

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSupplierId?: string;
  onSuccess?: () => void;
}

const createBlankItem = (): PurchaseOrderItem => ({
  id: crypto.randomUUID(),
  name: '',
  sku: '',
  barcode: '',
  category: 'General',
  qty: 1,
  costPrice: 0,
  salePrice: 0,
  lowStockAlert: 5,
});

export const PurchaseOrderModal: React.FC<PurchaseOrderModalProps> = ({
  isOpen,
  onClose,
  defaultSupplierId,
  onSuccess,
}) => {
  const { hasPermission } = usePermissions();
  const canManagePurchases = hasPermission('PURCHASES_MANAGE') || hasPermission('purchases.manage');
  const inventoryProducts = useInventoryStore(state => state.products);
  const fetchProducts = useInventoryStore(state => state.fetchProducts);

  const [supplierId, setSupplierId] = useState<string>(defaultSupplierId || '');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [items, setItems] = useState<PurchaseOrderItem[]>([createBlankItem()]);
  const [discount, setDiscount] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load active suppliers
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => supplierApi.getSuppliers(1, 200),
    enabled: isOpen,
  });
  const suppliers = suppliersData?.data || [];

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems(prev => [...prev, createBlankItem()]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) {
      setItems([createBlankItem()]);
      return;
    }
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof PurchaseOrderItem, value: any) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        return { ...item, [field]: value };
      })
    );
    setError(null);
  };

  const handleProductSelect = (id: string, selectedProductId: string) => {
    const matched = inventoryProducts.find(p => p.id === selectedProductId);
    if (!matched) return;

    setItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        return {
          ...item,
          productId: matched.id,
          name: matched.name,
          sku: matched.sku,
          barcode: matched.barcode || '',
          category: matched.category || 'General',
          costPrice: matched.purchasePrice || 0,
          salePrice: matched.price || 0,
          lowStockAlert: matched.minStockThreshold || 5,
        };
      })
    );
  };

  const subtotal = items.reduce((sum, item) => {
    const q = Number(item.qty) || 0;
    const c = Number(item.costPrice) || 0;
    return sum + q * c;
  }, 0);

  const netTotal = Math.max(0, subtotal - (Number(discount) || 0));
  const payable = Math.max(0, netTotal - (Number(paidAmount) || 0));

  const paymentStatus =
    paidAmount >= netTotal ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'UNPAID';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManagePurchases) {
      toast.error('Permission denied: PURCHASES_MANAGE required.');
      return;
    }

    if (!supplierId) {
      setError('Please select a supplier for this purchase.');
      return;
    }

    // Validate rows
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.name.trim()) {
        setError(`Row #${i + 1}: Item name or selected product is required.`);
        return;
      }
      if (item.qty <= 0) {
        setError(`Row #${i + 1}: Quantity must be greater than 0.`);
        return;
      }
      if (item.costPrice < 0) {
        setError(`Row #${i + 1}: Cost price cannot be negative.`);
        return;
      }
    }

    if (paidAmount < 0) {
      setError('Paid amount cannot be negative.');
      return;
    }

    if (paidAmount > netTotal) {
      setError(`Paid amount (Rs ${paidAmount}) cannot exceed net total (Rs ${netTotal}).`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Resolve or create products
      const preparedLines: { productId: string; quantity: number; unitCost: number }[] = [];

      for (const item of items) {
        let pId = item.productId;
        if (!pId) {
          // Check if existing product matches by sku or name
          const existing = inventoryProducts.find(
            p =>
              (item.sku && p.sku.toLowerCase() === item.sku.trim().toLowerCase()) ||
              p.name.toLowerCase() === item.name.trim().toLowerCase()
          );
          if (existing) {
            pId = existing.id;
          } else {
            // Create product in catalog
            const createdProd = await tauriClient.productCreate({
              name: item.name.trim(),
              sku: item.sku.trim() || `SKU-${Date.now().toString().slice(-6)}`,
              barcode: item.barcode?.trim() || null,
              category_id: '00000000-0000-0000-0000-000000000001', // Default category
              purchase_price: Number(item.costPrice),
              sale_price: Number(item.salePrice) || Math.round(Number(item.costPrice) * 1.2),
              low_stock_threshold: Number(item.lowStockAlert) || 5,
            });
            pId = createdProd.id;
          }
        }

        preparedLines.push({
          productId: pId,
          quantity: Number(item.qty),
          unitCost: Math.round(Number(item.costPrice)),
        });
      }

      const res = await purchaseApi.completePurchase({
        supplier_id: supplierId,
        items: preparedLines.map(p => ({
          product_id: p.productId,
          quantity: p.quantity,
          unit_cost: p.unitCost,
          discount: 0,
        })),
        discount: Math.round(Number(discount) || 0),
        paid_amount: Math.round(Number(paidAmount) || 0),
        notes: notes.trim() || (invoiceNumber.trim() ? `Bill #: ${invoiceNumber.trim()}` : null),
      });

      toast.success(
        `Purchase ${res.purchase.purchase_number} completed! Payment: ${res.purchase.payment_status}`
      );

      await fetchProducts();

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      const errMsg = err?.message || err?.toString() || 'Failed to process purchase order.';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#006970]/10 text-[#006970] dark:text-[#00B4BB] rounded-xl">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white tracking-tight">
                New Purchase Order & Stock In
              </h2>
              <p className="text-xs text-neutral-500">
                Receive stock, update inventory, and manage supplier payables.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Scrollable Area */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {error && (
              <div className="p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Supplier & Invoice Info Header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-neutral-50 dark:bg-neutral-950/60 p-4 rounded-xl border border-neutral-100 dark:border-neutral-800">
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" /> Supplier *
                </label>
                <select
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970]"
                >
                  <option value="">-- Select Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.supplier_code ? `[${s.supplier_code}] ` : ''}{s.name} {s.phone ? `(${s.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
                  Supplier Bill / Invoice #
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. SUP-INV-9821"
                  className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#006970]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
                  Procurement Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Delivered via freight"
                  className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#006970]"
                />
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  Purchased Items ({items.length})
                </label>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#006970] dark:text-[#00B4BB] hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Another Item
                </button>
              </div>

              <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 uppercase font-bold border-b border-neutral-200 dark:border-neutral-700">
                    <tr>
                      <th className="px-3 py-2.5 w-10 text-center">#</th>
                      <th className="px-3 py-2.5 min-w-[180px]">Item / Existing Product</th>
                      <th className="px-3 py-2.5 w-28">SKU</th>
                      <th className="px-3 py-2.5 w-20 text-center">Qty</th>
                      <th className="px-3 py-2.5 w-28 text-right">Cost (Rs)</th>
                      <th className="px-3 py-2.5 w-28 text-right">Sale (Rs)</th>
                      <th className="px-3 py-2.5 w-28 text-right">Total (Rs)</th>
                      <th className="px-3 py-2.5 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {items.map((item, idx) => {
                      const lineTotal = (Number(item.qty) || 0) * (Number(item.costPrice) || 0);
                      return (
                        <tr key={item.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                          <td className="px-3 py-2 text-center font-bold text-neutral-400">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <div className="space-y-1">
                              <select
                                onChange={e => handleProductSelect(item.id, e.target.value)}
                                defaultValue=""
                                className="w-full px-2 py-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs text-neutral-700 dark:text-neutral-300"
                              >
                                <option value="">-- Match Existing Product (Optional) --</option>
                                {inventoryProducts.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.sku})
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={item.name}
                                onChange={e => handleItemChange(item.id, 'name', e.target.value)}
                                placeholder="Enter Product Name"
                                required
                                className="w-full px-2 py-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs font-semibold text-neutral-900 dark:text-white"
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={item.sku}
                              onChange={e => handleItemChange(item.id, 'sku', e.target.value)}
                              placeholder="SKU"
                              className="w-full px-2 py-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs font-mono text-neutral-700 dark:text-neutral-300"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={e => handleItemChange(item.id, 'qty', parseInt(e.target.value, 10) || 1)}
                              className="w-full px-2 py-1 text-center bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs font-bold text-neutral-900 dark:text-white tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              value={item.costPrice}
                              onChange={e => handleItemChange(item.id, 'costPrice', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 text-right bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs font-semibold text-neutral-900 dark:text-white tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              value={item.salePrice}
                              onChange={e => handleItemChange(item.id, 'salePrice', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 text-right bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs font-semibold text-neutral-700 dark:text-neutral-300 tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-black text-neutral-900 dark:text-white tabular-nums">
                            {lineTotal.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors cursor-pointer"
                              title="Remove Line"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Summary & Payment Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-neutral-50 dark:bg-neutral-950/40 border border-neutral-200 dark:border-neutral-800 text-xs">
              <div>
                <span className="text-neutral-500 font-bold block mb-1">Subtotal</span>
                <span className="text-base font-black text-neutral-800 dark:text-neutral-200 tabular-nums">
                  Rs {subtotal.toLocaleString()}
                </span>
              </div>

              <div>
                <label className="text-neutral-500 font-bold block mb-1">Discount (Rs)</label>
                <input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={e => setDiscount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg font-bold text-neutral-900 dark:text-white tabular-nums"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-neutral-500 font-bold">Paid Amount (Rs)</label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setPaidAmount(netTotal)}
                      className="text-[10px] text-[#006970] dark:text-[#00B4BB] hover:underline font-bold cursor-pointer"
                    >
                      Full
                    </button>
                    <span className="text-neutral-300">|</span>
                    <button
                      type="button"
                      onClick={() => setPaidAmount(0)}
                      className="text-[10px] text-neutral-500 hover:underline font-bold cursor-pointer"
                    >
                      Credit
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  max={netTotal}
                  value={paidAmount}
                  onChange={e => setPaidAmount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg font-bold text-neutral-900 dark:text-white tabular-nums"
                />
              </div>

              <div>
                <span className="text-neutral-500 font-bold block mb-1">Payable (Credit)</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-base font-black tabular-nums ${
                      payable > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    Rs {payable.toLocaleString()}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                      paymentStatus === 'PAID'
                        ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                        : paymentStatus === 'PARTIALLY_PAID'
                        ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                        : 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                    }`}
                  >
                    {paymentStatus}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50">
            <div>
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block">
                Net Total:
              </span>
              <span className="text-xl font-black text-neutral-900 dark:text-white tabular-nums">
                Rs {netTotal.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="py-2.5 px-4 rounded-xl border border-neutral-200 dark:border-neutral-700 text-sm font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !canManagePurchases}
                className="py-2.5 px-5 rounded-xl bg-[#006970] hover:bg-[#005a60] active:scale-95 text-white text-sm font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Receive & Stock In
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
