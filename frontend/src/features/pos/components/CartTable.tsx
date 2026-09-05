'use client';

import React, { useState } from 'react';
import { Minus, Plus, Trash2, ArrowDownToLine } from 'lucide-react';
import { usePosStore } from '../store/usePosStore';
import { CartItem } from '../store/usePosStore';

export const CartTable = () => {
  const activeSession = usePosStore(state => state.getActiveSession());
  const updateQuantity = usePosStore(state => state.updateQuantity);
  const removeFromCart = usePosStore(state => state.removeFromCart);

  // Local state for quantity input to allow empty string during typing
  const [localQuantities, setLocalQuantities] = useState<Record<string, string>>({});

  if (!activeSession) return null;
  const cart = activeSession?.cart ?? [];
  const returnedItems = activeSession?.returnedItems ?? [];
  const mode = activeSession?.mode;

  // Local render-time calculations (display previews only, not mutating business state)
  const totalItems = cart.length;
  const totalQuantity = cart.reduce((acc, item) => acc + item.quantity, 0);
  const returnItemsCount = returnedItems.length;
  const returnQuantity = returnedItems.reduce((acc, item) => acc + item.quantity, 0);

  const handleQtyChange = (productId: string, value: string, maxStock: number, isReturn: boolean) => {
    setLocalQuantities(prev => ({ ...prev, [`${isReturn ? 'ret' : 'new'}-${productId}`]: value }));

    if (value === '') return;

    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0) {
      if (!isReturn && parsed > maxStock) {
        import('react-hot-toast').then(m => m.default.error(`Only ${maxStock} items in stock`));
        return;
      }
      updateQuantity(productId, parsed, isReturn);
    }
  };

  const handleQtyBlur = (productId: string, currentQty: number, isReturn: boolean) => {
    setLocalQuantities(prev => {
      const next = { ...prev };
      delete next[`${isReturn ? 'ret' : 'new'}-${productId}`];
      return next;
    });
  };

  const renderItemRow = (item: CartItem, isReturn: boolean, index: number) => {
    const key = `${isReturn ? 'ret' : 'new'}-${item.productId}`;
    const inputValue = localQuantities[key] !== undefined ? localQuantities[key] : item.quantity;

    return (
      <div
        key={key}
        className={`flex items-center px-2 py-0.5 border-b last:border-b-0 transition-colors group ${
          isReturn
            ? 'border-warning/20 bg-warning/5'
            : 'border-border hover:bg-surface-hover'
        }`}
      >
        {/* S.No */}
        <div className="w-10 text-xs font-bold text-text-muted">
          {index + 1}
        </div>

        {/* Product Name */}
        <div className="flex-1 min-w-[120px] pr-2">
          <p
            className={`text-sm font-bold truncate flex items-center gap-1.5 ${
              isReturn ? 'text-warning' : 'text-text-primary'
            }`}
            title={item.productName}
          >
            {isReturn && <ArrowDownToLine className="h-3.5 w-3.5 shrink-0" />}
            <span>{item.productName}</span>
          </p>
        </div>

        {/* Stock Qty */}
        <div className="w-16 text-center text-xs font-medium text-text-muted">
          {!isReturn && item.maxStock <= 3 ? (
            <span className="text-danger font-bold">{item.maxStock}</span>
          ) : (
            item.maxStock
          )}
        </div>

        {/* Sale Price */}
        <div className="w-24 text-right text-sm font-black text-primary tabular-nums">
          {item.unitPrice.toLocaleString()}
        </div>

        {/* Sale Qty Controls */}
        <div className="w-32 flex justify-center px-2">
          <div className="flex items-center gap-1 bg-surface-hover p-0.5 rounded-md border border-border">
            <button
              type="button"
              onClick={() => updateQuantity(item.productId, item.quantity - 1, isReturn)}
              disabled={item.quantity <= 1}
              aria-label="Decrease quantity"
              className="p-1 rounded bg-surface text-text-secondary hover:bg-border/30 transition-all disabled:opacity-30 shadow-xs"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              type="number"
              value={inputValue}
              onChange={(e) => handleQtyChange(item.productId, e.target.value, item.maxStock, isReturn)}
              onBlur={() => handleQtyBlur(item.productId, item.quantity, isReturn)}
              aria-label={`Quantity for ${item.productName}`}
              className="text-sm font-black w-8 text-center tabular-nums bg-transparent text-text-primary focus:outline-none focus:bg-surface rounded no-spinners"
              min="1"
              max={isReturn ? undefined : item.maxStock}
            />
            <button
              type="button"
              onClick={() => updateQuantity(item.productId, item.quantity + 1, isReturn)}
              disabled={!isReturn && item.quantity >= item.maxStock}
              aria-label="Increase quantity"
              className="p-1 rounded bg-surface text-text-secondary hover:bg-border/30 transition-all disabled:opacity-30 shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Delete Icon */}
        <div className="w-12 flex justify-center">
          <button
            type="button"
            onClick={() => removeFromCart(item.productId, isReturn)}
            aria-label={`Remove ${item.productName}`}
            className="text-text-muted hover:text-danger hover:bg-danger/10 p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden min-h-0 bg-surface border border-border rounded-xl shadow-card">

      {/* Table Header */}
      <div className="flex items-center px-2 py-1.5 border-b border-border bg-surface-hover/60 text-[10px] font-black text-text-muted uppercase tracking-widest shrink-0">
        <div className="w-10">S.No</div>
        <div className="flex-1 min-w-[120px]">Product Name</div>
        <div className="w-16 text-center">Stock</div>
        <div className="w-24 text-right">Sale Price</div>
        <div className="w-32 text-center">Qty</div>
        <div className="w-12 text-center">Act</div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pb-2">
        {cart.length === 0 && returnedItems.length === 0 ? null : (
          <div className="flex flex-col">
            {/* Returned Items Section */}
            {mode === 'replace' && returnedItems.length > 0 && (
              <div className="mb-2 border-b border-border pb-2">
                <div className="px-4 py-2 bg-warning/10 text-xs font-black text-warning uppercase tracking-widest flex items-center gap-2">
                  <ArrowDownToLine className="h-4 w-4" />
                  Items Returned by Customer
                </div>
                {returnedItems.map((item, idx) => renderItemRow(item, true, idx))}
              </div>
            )}

            {/* New Items Section */}
            {cart.length > 0 && (
              <div>
                {mode === 'replace' && returnedItems.length > 0 && (
                  <div className="px-4 py-2 bg-primary/5 text-xs font-black text-primary uppercase tracking-widest">
                    New Items Purchased
                  </div>
                )}
                {cart.map((item, idx) => renderItemRow(item, false, idx))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cart Footer */}
      {(cart.length > 0 || returnedItems.length > 0) && (
        <div className="flex items-center gap-6 px-4 py-2.5 border-t border-border bg-surface-hover/40 shrink-0">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Total Lines</span>
            <span className="text-sm font-black text-text-primary tabular-nums">{totalItems}</span>
          </div>
          {returnItemsCount > 0 && (
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-warning uppercase tracking-wider">Return Lines</span>
              <span className="text-sm font-black text-warning tabular-nums">{returnItemsCount}</span>
            </div>
          )}
          <div className="w-px h-7 bg-border mx-1" />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Total Qty</span>
            <span className="text-sm font-black text-text-primary tabular-nums">{totalQuantity}</span>
          </div>
          {returnQuantity > 0 && (
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-warning uppercase tracking-wider">Return Qty</span>
              <span className="text-sm font-black text-warning tabular-nums">{returnQuantity}</span>
            </div>
          )}
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .no-spinners::-webkit-inner-spin-button,
        .no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .no-spinners {
          -moz-appearance: textfield;
        }
      `}} />
    </div>
  );
};
