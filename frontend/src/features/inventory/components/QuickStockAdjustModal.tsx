'use client';

import React, { useState } from 'react';
import { X, Plus, Minus, AlertTriangle, Package, RefreshCw, CheckCircle2, ShieldAlert, DollarSign } from 'lucide-react';
import { InventoryProduct, InventoryAdjustmentType } from '../types';
import { stockService } from '../stock/stock.service';
import { useInventoryStore } from '../core/inventory.store';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMISSIONS } from '@/constants/permissions';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import toast from 'react-hot-toast';

interface QuickStockAdjustModalProps {
  product: InventoryProduct;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const QuickStockAdjustModal: React.FC<QuickStockAdjustModalProps> = ({
  product,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { hasPermission, role } = usePermissions();
  const canManageInventory = hasPermission(PERMISSIONS.INVENTORY_EDIT);
  const isOrgAdmin = role === 'SUPER_ADMIN' || role === 'MULTI_ADMIN' || role === 'OWNER' || role === 'ADMIN' || role === 'SHOP_ADMIN';
  const fetchProducts = useInventoryStore(state => state.fetchProducts);

  const [direction, setDirection] = useState<'increase' | 'decrease'>(isOrgAdmin ? 'increase' : 'decrease');
  const [amount, setAmount] = useState<number>(1);
  const [unitCost, setUnitCost] = useState<number>(product.purchasePrice ?? 0);
  const [adjustmentType, setAdjustmentType] = useState<string>(isOrgAdmin ? 'RESTOCK' : 'DAMAGE');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isRestock = direction === 'increase' && adjustmentType === 'RESTOCK';
  const currentStock = product.stock || 0;
  const calculatedNewStock = direction === 'increase'
    ? currentStock + (Number(amount) || 0)
    : Math.max(0, currentStock - (Number(amount) || 0));

  // WAC preview: C_WAC = round((Q_old * C_old + Q_rec * C_new) / (Q_old + Q_rec))
  const currentAvgCost = product.averageCost ?? product.purchasePrice ?? 0;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageInventory) {
      toast.error('Permission denied: inventory.edit permission required.');
      return;
    }

    if (direction === 'increase' && !isOrgAdmin) {
      const msg = 'Branch users cannot increase stock. Organization Admin required.';
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

    try {
      setIsSubmitting(true);
      setError(null);

      if (isRestock) {
        // ── WAC restock path — calls POST /api/v1/inventory/receive ──
        const store = useOrganizationStore.getState();
        const branchId = store.activeShop?._id || store.activeShop?.id || store.activeShopId;
        if (!branchId) {
          throw new Error('No active branch selected. Please select a shop before restocking.');
        }

        const result = await stockService.receiveStock({
          product_id: product.id,
          branch_id: branchId,
          quantity_received: amount,
          unit_cost: Math.round(unitCost),
          notes: reason.trim() || `Supplier restock: +${amount} units @ Rs ${Math.round(unitCost)}`,
        });

        toast.success(
          `Stock restocked: ${result.new_quantity} ${product.unit || 'units'} · Avg cost updated to Rs ${result.new_average_cost.toLocaleString()}`
        );
      } else {
        // ── Regular adjust path (decrease / manual correction) ──
        let targetType: InventoryAdjustmentType;
        if (adjustmentType === 'DAMAGE') {
          targetType = InventoryAdjustmentType.DAMAGE;
        } else {
          targetType = direction === 'increase'
            ? InventoryAdjustmentType.INCREASE
            : InventoryAdjustmentType.DECREASE;
        }

        const notes = reason.trim() || `${direction === 'increase' ? 'Increased' : 'Decreased'} by ${amount} (${adjustmentType})`;
        await stockService.adjustStock(product.id, amount, targetType, notes);
        toast.success(`Stock successfully updated to ${calculatedNewStock} ${product.unit || 'units'}`);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#006970]/10 text-[#006970] dark:bg-[#006970]/20 dark:text-[#00B4BB] flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                {isRestock ? 'Stock Receive / Restock' : 'Quick Stock Adjust'}
              </h2>
              <p className="text-xs text-neutral-500">
                {isRestock ? 'Updates WAC & records purchase receipt' : 'Modify live inventory balance'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Product Identity Banner */}
        <div className="px-6 py-3.5 bg-neutral-50 dark:bg-neutral-950/70 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <div className="font-semibold text-sm text-neutral-900 dark:text-white truncate">{product.name}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <code className="text-xs bg-neutral-200/80 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-600 dark:text-neutral-300 font-mono">
                {product.sku || 'NO-SKU'}
              </code>
              <span className="text-xs text-neutral-500">{product.category || 'General'}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-neutral-500 uppercase tracking-wider font-medium">Current</div>
            <div className="text-base font-black text-neutral-900 dark:text-white tabular-nums">
              {currentStock} <span className="text-xs font-normal text-neutral-500">{product.unit || 'pcs'}</span>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {!canManageInventory && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl flex items-center gap-2.5 text-xs text-amber-700 dark:text-amber-400">
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

          {/* Direction Toggle */}
          <div>
            <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Adjustment Action</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!isOrgAdmin}
                onClick={() => {
                  if (!isOrgAdmin) return;
                  setDirection('increase');
                  if (adjustmentType === 'DAMAGE') setAdjustmentType('RESTOCK');
                }}
                title={!isOrgAdmin ? 'Branch users are not authorized to increase stock.' : undefined}
                className={`py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-all ${
                  direction === 'increase'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700/50'
                } ${!isOrgAdmin ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <Plus className="w-4 h-4" /> Increase (+)
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirection('decrease');
                  if (adjustmentType === 'RESTOCK') setAdjustmentType('DAMAGE');
                }}
                className={`py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-all ${
                  direction === 'decrease'
                    ? 'bg-red-600 text-white border-red-600 shadow-sm'
                    : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700/50'
                }`}
              >
                <Minus className="w-4 h-4" /> Decrease (-)
              </button>
            </div>
          </div>

          {/* Adjustment Reason / Type */}
          <div>
            <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Reason Type</label>
            <select
              value={adjustmentType}
              onChange={e => setAdjustmentType(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm font-medium text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970]"
            >
              {direction === 'increase' ? (
                <>
                  <option value="RESTOCK">Stock In / Restock — updates Weighted Avg Cost</option>
                  <option value="MANUAL_CORRECTION">Manual Count Correction (no cost update)</option>
                </>
              ) : (
                <>
                  <option value="DAMAGE">Damaged / Expired Item (DAMAGE)</option>
                  <option value="MANUAL_CORRECTION">Manual Count Correction (MANUAL_CORRECTION)</option>
                </>
              )}
            </select>
          </div>

          {/* Amount Stepper */}
          <div>
            <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
              {isRestock ? 'Quantity Received' : 'Quantity to Adjust'}
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAmountChange(amount - 1)}
                disabled={amount <= 1 || isSubmitting}
                className="w-10 h-10 rounded-xl border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>

              <input
                type="number"
                min="1"
                value={amount}
                onChange={e => handleAmountChange(parseInt(e.target.value, 10) || 1)}
                className="flex-1 text-center py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-lg font-black text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970] tabular-nums"
              />

              <button
                type="button"
                onClick={() => handleAmountChange(amount + 1)}
                disabled={isSubmitting}
                className="w-10 h-10 rounded-xl border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex items-center gap-2 mt-2">
              {[1, 5, 10, 25, 50].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleAmountChange(val)}
                  className={`flex-1 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                    amount === val
                      ? 'bg-[#006970]/10 text-[#006970] border-[#006970]/30 dark:bg-[#006970]/20 dark:text-[#00B4BB]'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  +{val}
                </button>
              ))}
            </div>
          </div>

          {/* Unit Cost field — only for RESTOCK direction */}
          {isRestock && (
            <div>
              <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
                Unit Purchase Cost (Rs) <span className="text-[#006970] font-black">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <DollarSign className="w-4 h-4 text-neutral-400" />
                </div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={unitCost}
                  onChange={e => setUnitCost(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  placeholder="Enter purchase price per unit"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-white dark:bg-neutral-800 border border-[#006970]/50 dark:border-[#006970]/40 rounded-xl text-sm font-bold text-neutral-900 dark:text-white placeholder:text-neutral-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-[#006970] tabular-nums"
                />
              </div>
              {/* WAC Preview — DEF-09: Note that preview uses branch-local stock while
                   backend WAC uses global product stock across all branches */}
              <div className="mt-2 px-3.5 py-2 bg-[#006970]/5 dark:bg-[#006970]/10 border border-[#006970]/20 rounded-xl flex items-center justify-between text-xs">
                <span className="text-neutral-500 font-medium">New Weighted Avg Cost:</span>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-400 line-through tabular-nums">Rs {currentAvgCost.toLocaleString()}</span>
                  <span className="font-black text-[#006970] dark:text-[#00B4BB] tabular-nums">
                    Rs {projectedWac.toLocaleString()}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                Preview uses this branch&apos;s stock. Actual WAC is recalculated by the server using total stock across all branches.
              </p>
            </div>
          )}

          {/* Note / Memo */}
          <div>
            <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Notes / Audit Memo (Optional)</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={isRestock ? 'e.g. Supplier delivery batch, PO-2024-001' : 'e.g. Physical inventory count, damaged goods'}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#006970]"
            />
          </div>

          {/* Projected Result Preview */}
          <div className="p-3.5 bg-neutral-50 dark:bg-neutral-950 rounded-xl border border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-sm">
            <span className="text-neutral-500 font-medium">Projected New Stock:</span>
            <div className="flex items-center gap-2">
              <span className="text-neutral-400 line-through tabular-nums text-xs">{currentStock}</span>
              <span className="font-black text-neutral-900 dark:text-white tabular-nums text-base text-[#006970] dark:text-[#00B4BB]">
                {calculatedNewStock} {product.unit || 'pcs'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl border border-neutral-200 dark:border-neutral-700 text-sm font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !canManageInventory}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#006970] hover:bg-[#005a60] active:scale-95 text-white text-sm font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {isRestock ? 'Receiving...' : 'Updating...'}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  {isRestock ? 'Receive Stock' : 'Confirm Adjust'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
