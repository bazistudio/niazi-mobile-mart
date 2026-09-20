'use client';

import React, { useState, useEffect } from 'react';
import { X, ArrowRightLeft, Package, AlertTriangle, RefreshCw, CheckCircle2, ShieldAlert } from 'lucide-react';
import { InventoryProduct } from '../types';
import { useInventoryStore } from '../core/inventory.store';
import { usePermissions } from '@/lib/auth/usePermissions';
import { tauriClient, Branch } from '@/lib/tauri/tauriClient';
import toast from 'react-hot-toast';

interface StockTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProduct?: InventoryProduct | null;
  onSuccess?: () => void;
}

export const StockTransferModal: React.FC<StockTransferModalProps> = ({
  isOpen,
  onClose,
  initialProduct,
  onSuccess,
}) => {
  const { role } = usePermissions();
  const isOrgAdmin = role === 'SUPER_ADMIN' || role === 'MULTI_ADMIN' || role === 'OWNER' || role === 'ADMIN';
  const products = useInventoryStore((state) => state.products);
  const fetchProducts = useInventoryStore((state) => state.fetchProducts);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProduct?.id || '');
  const [fromBranchId, setFromBranchId] = useState<string>('00000000-0000-0000-0000-000000000002'); // Main Branch default
  const [toBranchId, setToBranchId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState<string>('');
  const [sourceStock, setSourceStock] = useState<number>(0);
  const [isLoadingStock, setIsLoadingStock] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load branches
  useEffect(() => {
    if (!isOpen) return;

    async function loadBranches() {
      try {
        const list = await tauriClient.branchList();
        if (list && list.length > 0) {
          setBranches(list);
          const mainBranch = list.find((b) => b.code === 'MAIN' || b.name.toLowerCase().includes('main')) || list[0];
          setFromBranchId(mainBranch.id);
          // Default destination to a different branch if available
          const otherBranch = list.find((b) => b.id !== mainBranch.id);
          if (otherBranch) setToBranchId(otherBranch.id);
        } else {
          // Default fallback branches for development/testing
          const fallbackBranches: Branch[] = [
            { id: '00000000-0000-0000-0000-000000000002', organization_id: 'org1', name: 'Main Branch', code: 'MAIN', is_active: true, created_at: '', updated_at: '' },
            { id: '00000000-0000-0000-0000-000000000003', organization_id: 'org1', name: 'Branch 2 (Gulberg)', code: 'BR-02', is_active: true, created_at: '', updated_at: '' },
            { id: '00000000-0000-0000-0000-000000000004', organization_id: 'org1', name: 'Branch 3 (Saddar)', code: 'BR-03', is_active: true, created_at: '', updated_at: '' },
          ];
          setBranches(fallbackBranches);
          setFromBranchId(fallbackBranches[0].id);
          setToBranchId(fallbackBranches[1].id);
        }
      } catch {
        const fallbackBranches: Branch[] = [
          { id: '00000000-0000-0000-0000-000000000002', organization_id: 'org1', name: 'Main Branch', code: 'MAIN', is_active: true, created_at: '', updated_at: '' },
          { id: '00000000-0000-0000-0000-000000000003', organization_id: 'org1', name: 'Branch 2 (Gulberg)', code: 'BR-02', is_active: true, created_at: '', updated_at: '' },
        ];
        setBranches(fallbackBranches);
        setFromBranchId(fallbackBranches[0].id);
        setToBranchId(fallbackBranches[1].id);
      }
    }

    loadBranches();
  }, [isOpen]);

  // Set initial product ID if provided
  useEffect(() => {
    if (initialProduct?.id) {
      setSelectedProductId(initialProduct.id);
    } else if (products.length > 0 && !selectedProductId) {
      setSelectedProductId(products[0].id);
    }
  }, [initialProduct, products, selectedProductId]);

  // Fetch live stock at source branch when product or source branch changes
  useEffect(() => {
    if (!selectedProductId || !fromBranchId || !isOpen) return;

    let isMounted = true;
    setIsLoadingStock(true);

    tauriClient
      .inventoryGetStock(selectedProductId, fromBranchId)
      .then((stock) => {
        if (isMounted) {
          setSourceStock(stock);
          setIsLoadingStock(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          // Fallback to product stock in state if fetch fails
          const prod = products.find((p) => p.id === selectedProductId);
          setSourceStock(prod?.stock || 0);
          setIsLoadingStock(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedProductId, fromBranchId, isOpen, products]);

  if (!isOpen) return null;

  const targetProduct = products.find((p) => p.id === selectedProductId) || initialProduct;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isOrgAdmin) {
      setError('Permission denied: Organization Admin required for stock transfers.');
      toast.error('Permission denied: Organization Admin required for stock transfers.');
      return;
    }

    if (!selectedProductId) {
      setError('Please select a product to transfer.');
      return;
    }

    if (!fromBranchId || !toBranchId) {
      setError('Please select both source and destination branches.');
      return;
    }

    if (fromBranchId === toBranchId) {
      setError('Source and destination branches cannot be the same.');
      return;
    }

    if (quantity <= 0) {
      setError('Transfer quantity must be at least 1.');
      return;
    }

    if (quantity > sourceStock) {
      setError(`Insufficient stock at source branch (${sourceStock} available).`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await tauriClient.inventoryTransfer({
        product_id: selectedProductId,
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        quantity,
        reason: reason.trim() || 'Organization Stock Transfer',
      });

      const sourceBranchName = branches.find((b) => b.id === fromBranchId)?.name || 'Source';
      const destBranchName = branches.find((b) => b.id === toBranchId)?.name || 'Destination';

      toast.success(`Transferred ${quantity} ${targetProduct?.unit || 'pcs'} from ${sourceBranchName} to ${destBranchName}`);
      
      await fetchProducts();

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to complete stock transfer.';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Stock Transfer Dispatch</h2>
              <p className="text-xs text-gray-500">Reallocate inventory across branches</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!isOrgAdmin && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl flex items-center gap-2.5 text-xs text-amber-700 dark:text-amber-400">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Stock transfer is an Organization Admin operation.</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Product Selection */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Select Product Master
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970]"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku || 'No SKU'})
                </option>
              ))}
            </select>
          </div>

          {/* Source & Destination Branches */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Source Branch
              </label>
              <select
                value={fromBranchId}
                onChange={(e) => setFromBranchId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970]"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Destination Branch
              </label>
              <select
                value={toBranchId}
                onChange={(e) => setToBranchId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970]"
              >
                {branches
                  .filter((b) => b.id !== fromBranchId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Available Stock Indicator */}
          <div className="p-3 bg-gray-50 dark:bg-gray-950/60 rounded-xl border border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs">
            <span className="text-gray-500">Available at Source Branch:</span>
            <span className="font-bold text-gray-900 dark:text-white tabular-nums">
              {isLoadingStock ? 'Loading...' : `${sourceStock} ${targetProduct?.unit || 'pcs'}`}
            </span>
          </div>

          {/* Quantity Stepper */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Transfer Quantity
            </label>
            <input
              type="number"
              min="1"
              max={sourceStock > 0 ? sourceStock : 1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full px-3.5 py-2.5 text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-lg font-black text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970] tabular-nums"
            />
          </div>

          {/* Reason / Memo */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Transfer Notes / Reason (Optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Branch stock balancing, high demand restocking"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006970]"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isOrgAdmin || sourceStock <= 0}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#006970] hover:bg-[#005a60] active:scale-95 text-white text-sm font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Transferring...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Confirm Transfer
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StockTransferModal;
