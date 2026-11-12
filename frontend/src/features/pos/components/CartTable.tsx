import React, { useState, useRef, useEffect } from 'react';
import { Minus, Plus, Trash2, ArrowDownToLine } from 'lucide-react';
import { usePosStore, ReturnLineItem } from '../store/usePosStore';
import { CartItem } from '../store/usePosStore';
import { useInventoryStore } from '@/features/inventory/core/inventory.store';

export const CartTable = () => {
  const activeSession = usePosStore(state => state.saleTabs.find(t => t.id === state.activeTabId));
  const updateQuantity = usePosStore(state => state.updateQuantity);
  const updateUnitPrice = usePosStore(state => state.updateUnitPrice);
  const removeFromCart = usePosStore(state => state.removeFromCart);
  // Phase 1B/F: return mode state and per-line controls
  const isReturnMode = !!(activeSession?.isReturnMode);
  const returnLines = activeSession?.returnLines ?? [];
  const toggleReturnLine = usePosStore(state => state.toggleReturnLine);
  const setReturnLineQty = usePosStore(state => state.setReturnLineQty);
  const inventoryProducts = useInventoryStore(state => state.products);

  // Local state for quantity input to allow empty string during typing
  const [localQuantities, setLocalQuantities] = useState<Record<string, string>>({});
  const [localPrices, setLocalPrices] = useState<Record<string, string>>({});
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const priceRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Focus newly added cart item quantity automatically
  useEffect(() => {
    const handleFocusCartItem = (e: Event) => {
      const detail = (e as CustomEvent<{ productId: string }>).detail;
      if (detail?.productId) {
        setTimeout(() => {
          const input = qtyRefs.current[`new-${detail.productId}`] || qtyRefs.current[`ret-${detail.productId}`];
          if (input) {
            input.focus();
            input.select();
          }
        }, 60);
      }
    };
    window.addEventListener("pos:focus-cart-item", handleFocusCartItem);
    return () => window.removeEventListener("pos:focus-cart-item", handleFocusCartItem);
  }, []);

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

  const handlePriceChange = (productId: string, value: string, isReturn: boolean) => {
    const key = `${isReturn ? "ret" : "new"}-${productId}`;
    setLocalPrices(prev => ({ ...prev, [key]: value }));

    if (value === "") return;

    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0) {
      // Immediately update unitPrice in store so cart-wide checks and shortcuts react instantly
      updateUnitPrice(productId, parsed, isReturn);
    }
  };

  const handlePriceBlur = (productId: string, isReturn: boolean) => {
    const key = `${isReturn ? "ret" : "new"}-${productId}`;
    const value = localPrices[key];

    if (value !== undefined) {
      if (value === "") {
        setLocalPrices(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        return;
      }

      const parsed = parseFloat(value);
      if (isNaN(parsed) || parsed < 0) {
        setLocalPrices(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        return;
      }

      // Minimum Selling Price Security: selling price must be strictly greater than cost price
      if (!isReturn) {
        const item = cart.find(i => i.productId === productId);
        const costPrice = item?.costPrice ?? 0;

        if (costPrice > 0 && parsed <= costPrice) {
          const minAllowed = costPrice + 1;
          import("react-hot-toast").then(m =>
            m.default.error(
              `Selling price (Rs. ${parsed.toLocaleString()}) cannot be equal to or below the latest purchase cost (Rs. ${costPrice.toLocaleString()}). Minimum allowed: Rs. ${minAllowed.toLocaleString()}.`,
              { duration: 4500, id: `min-price-${productId}` }
            )
          );
          setTimeout(() => {
            const inputEl = priceRefs.current[key];
            if (inputEl) {
              inputEl.focus();
              inputEl.select();
            }
          }, 50);
          return;
        }
      }

      updateUnitPrice(productId, parsed, isReturn);
      setLocalPrices(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
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
    const lineTotal = item.unitPrice * item.quantity;

    // Phase 1B/F: find matching returnLine metadata for this cart item
    const returnLine: ReturnLineItem | undefined = isReturnMode
      ? returnLines.find(l => l.productId === item.productId)
      : undefined;
    // A line is fully exhausted (already all returned) when returnableQty === 0
    const isExhausted = isReturnMode && returnLine !== undefined && returnLine.returnableQty === 0;
    // Effective quantity to display/constrain in return mode
    const effectiveMaxQty = returnLine ? returnLine.returnableQty : item.maxStock;
    // Whether this line is selected for return
    const isSelected = returnLine ? returnLine.selectedForReturn : true;

    return (
      <div
        key={key}
        className={`flex items-center px-3 py-1.5 border-b last:border-b-0 transition-colors group ${
          isReturnMode && isExhausted
            ? 'border-border/30 bg-surface/50 opacity-50'
            : isReturn
            ? 'border-warning/20 bg-warning/5'
            : 'border-border hover:bg-surface-hover'
        }`}
      >
        {/* 1. S.No / Checkbox in return mode */}
        <div className="w-12 text-xs font-bold text-text-muted flex items-center justify-start">
          {isReturnMode && !isExhausted && returnLine ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleReturnLine(returnLine.saleLineId)}
              aria-label={`Select ${item.productName} for return`}
              className="w-3.5 h-3.5 accent-red-500 cursor-pointer"
            />
          ) : (
            <span>{index + 1}</span>
          )}
        </div>

        {/* 2. Product Name & Specifications */}
        <div className="flex-1 min-w-[140px] pr-2 flex flex-col justify-center">
          <p
            className={`text-sm font-bold truncate flex items-center gap-1.5 ${
              isReturn ? 'text-warning' : 'text-text-primary'
            }`}
            title={item.productName}
          >
            {isReturn && <ArrowDownToLine className="h-3.5 w-3.5 shrink-0" />}
            <span>{item.productName}</span>
          </p>
          {(() => {
            const invProd = inventoryProducts.find(p => (p.id || (p as any)._id) === item.productId);
            if (!invProd) return null;
            const specs: string[] = [];
            if (invProd.category && invProd.category !== '-' && invProd.category.trim().length > 0 && invProd.category.toLowerCase() !== 'uncategorized') {
              specs.push(invProd.category);
            }
            if (invProd.quality && invProd.quality !== '-' && invProd.quality.trim().length > 0) specs.push(invProd.quality);
            if (invProd.color && invProd.color !== '-' && invProd.color.trim().length > 0) specs.push(invProd.color);
            if (invProd.brand && invProd.brand !== '-' && invProd.brand.trim().length > 0) specs.push(invProd.brand);
            if (invProd.company && invProd.company !== '-' && invProd.company.trim().length > 0) specs.push(invProd.company);
            if (specs.length === 0) return null;
            return (
              <span className="text-[10px] text-text-muted font-medium truncate leading-tight">
                {specs.join(' • ')}
              </span>
            );
          })()}
        </div>

        {/* 3. IMEI / Serial */}
        <div className="w-32 text-xs font-mono text-text-muted truncate pr-2">
          {item.barcode || item.sku || '—'}
        </div>

        {/* 4. Quantity Stepper — bounded to returnableQty in return mode */}
        <div className="w-28 flex justify-center px-1">
          {isReturnMode && returnLine ? (
            // Return mode: dedicated stepper using returnLine.returnQty
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1 bg-surface-hover p-0.5 rounded-md border border-red-300 dark:border-red-700">
                <button
                  type="button"
                  onClick={() => setReturnLineQty(returnLine.saleLineId, returnLine.returnQty - 1)}
                  disabled={isExhausted || !isSelected || returnLine.returnQty <= 1}
                  aria-label="Decrease return quantity"
                  className="p-1 rounded bg-surface text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all disabled:opacity-30 shadow-xs"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <input
                  type="number"
                  value={returnLine.returnQty}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) setReturnLineQty(returnLine.saleLineId, v);
                  }}
                  disabled={isExhausted || !isSelected}
                  aria-label={`Return quantity for ${item.productName}`}
                  className="text-xs font-black w-8 text-center tabular-nums bg-transparent text-red-600 dark:text-red-400 focus:outline-none rounded no-spinners"
                  min="1"
                  max={returnLine.returnableQty}
                />
                <button
                  type="button"
                  onClick={() => setReturnLineQty(returnLine.saleLineId, returnLine.returnQty + 1)}
                  disabled={isExhausted || !isSelected || returnLine.returnQty >= returnLine.returnableQty}
                  aria-label="Increase return quantity"
                  className="p-1 rounded bg-surface text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all disabled:opacity-30 shadow-xs"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              {/* Sold / Returned / Returnable info line */}
              <div className="text-[9px] text-text-muted tabular-nums whitespace-nowrap leading-tight">
                <span>Sold: <span className="font-bold text-text-secondary">{returnLine.originalSoldQty}</span></span>
                {returnLine.alreadyReturnedQty > 0 && (
                  <span className="ml-1 text-orange-500">Ret: {returnLine.alreadyReturnedQty}</span>
                )}
                <span className="ml-1 text-red-500">Left: {returnLine.returnableQty}</span>
              </div>
            </div>
          ) : (
            // Normal sale mode stepper
            <div className="flex items-center gap-1 bg-surface-hover p-0.5 rounded-md border border-border">
              <button
                type="button"
                onClick={() => updateQuantity(item.productId, item.quantity - 1, isReturn)}
                disabled={item.quantity <= 1}
                aria-label="Decrease quantity"
                className="p-1 rounded bg-surface text-text-secondary hover:bg-border/30 transition-all disabled:opacity-30 shadow-xs"
              >
                <Minus className="h-3 w-3" />
              </button>
              <input
                ref={(el) => { qtyRefs.current[key] = el; }}
                type="number"
                value={inputValue}
                onChange={(e) => handleQtyChange(item.productId, e.target.value, item.maxStock, isReturn)}
                onBlur={() => handleQtyBlur(item.productId, item.quantity, isReturn)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (isReturn || item.quantity < item.maxStock) {
                      updateQuantity(item.productId, item.quantity + 1, isReturn);
                    }
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (item.quantity > 1) {
                      updateQuantity(item.productId, item.quantity - 1, isReturn);
                    }
                  } else if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    const priceInput = priceRefs.current[key];
                    if (priceInput) {
                      priceInput.focus();
                      priceInput.select();
                    }
                  }
                }}
                aria-label={`Quantity for ${item.productName}`}
                className="text-xs font-black w-8 text-center tabular-nums bg-transparent text-text-primary focus:outline-none focus:bg-surface rounded no-spinners"
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
                <Plus className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* 5. Unit Price — static red in return mode; editable in sale mode (Phase 1B/F fix Defect #2) */}
        <div className="w-28 flex flex-col items-end justify-center">
          {isReturnMode ? (
            <div className="w-28 text-right text-xs font-black text-red-600 dark:text-red-400 tabular-nums pr-1">
              {isExhausted
                ? <span className="text-text-muted text-[10px] font-medium">—</span>
                : <span>-Rs {item.unitPrice.toLocaleString()}</span>}
            </div>
          ) : (
            <>
              <div className={`flex items-center px-1.5 py-0.5 rounded border transition-all ${
            !isReturn && item.costPrice > 0 && (localPrices[key] !== undefined ? (parseFloat(localPrices[key]) <= item.costPrice) : (item.unitPrice <= item.costPrice))
              ? "bg-rose-50 dark:bg-rose-950/40 border-rose-500 ring-1 ring-rose-500/50"
              : "bg-surface-hover border-border focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20"
          }`}>
            <span className="text-[10px] text-text-muted mr-1 font-bold">Rs</span>
            <input
              ref={(el) => { priceRefs.current[key] = el; }}
              type="number"
              value={localPrices[key] !== undefined ? localPrices[key] : item.unitPrice}
              onChange={(e) => handlePriceChange(item.productId, e.target.value, isReturn)}
              onBlur={() => handlePriceBlur(item.productId, isReturn)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  updateUnitPrice(item.productId, item.unitPrice + 50, isReturn);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const targetPrice = item.unitPrice - 50;
                  if (!isReturn && item.costPrice > 0 && targetPrice <= item.costPrice) {
                    import('react-hot-toast').then(m =>
                      m.default.error(
                        `Cannot decrease price below cost (Rs. ${item.costPrice.toLocaleString()}). Selling price must be higher than cost.`,
                        { duration: 3000, id: `min-price-${item.productId}` }
                      )
                    );
                    return;
                  }
                  if (targetPrice >= 0) {
                    updateUnitPrice(item.productId, targetPrice, isReturn);
                  }
                } else if (e.key === 'Tab' && !e.shiftKey) {
                  e.preventDefault();
                  // Focus back on POS Product Search
                  const searchInput = document.getElementById('pos-product-search-input') as HTMLInputElement | null;
                  if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                  }
                } else if (e.key === 'Tab' && e.shiftKey) {
                  e.preventDefault();
                  const qtyInput = qtyRefs.current[key];
                  if (qtyInput) {
                    qtyInput.focus();
                    qtyInput.select();
                  }
                }
              }}
              aria-label={`Unit price for ${item.productName}`}
              className="text-xs font-black w-16 text-right tabular-nums bg-transparent text-text-primary focus:outline-none no-spinners"
              min="0"
              step="1"
            />
          </div>
          {/* Immediate Below-Cost Warning while typing/focused */}
          {!isReturn && item.costPrice > 0 && (() => {
            const effectiveVal = localPrices[key] !== undefined ? parseFloat(localPrices[key]) : item.unitPrice;
            const isBelow = !isNaN(effectiveVal) && effectiveVal <= item.costPrice;
            if (!isBelow) return null;
            const minAllowed = item.costPrice + 1;
            return (
              <div className="text-[9px] text-rose-600 dark:text-rose-400 font-bold whitespace-nowrap mt-0.5 leading-tight flex items-center gap-0.5" title={`Product Cost: Rs. ${item.costPrice.toLocaleString()} | Minimum Sale Price: Rs. ${minAllowed.toLocaleString()}`}>
                <span>Min &gt; Rs.{item.costPrice.toLocaleString()}</span>
              </div>
            );
          })()}
            </>
          )}
        </div>

        {/* 6. Discount */}
        <div className="w-16 text-center text-xs font-medium text-text-muted">
          0%
        </div>

        {/* 7. Line Total — negative red in return mode (Phase 1B/F fix Defect #2) */}
        {isReturnMode ? (
          <div className={`w-28 text-right text-xs font-black tabular-nums ${isSelected ? 'text-red-600 dark:text-red-400' : 'text-text-muted'}`}>
            {isExhausted
              ? <span className="text-text-muted text-[10px] font-medium">Fully Returned</span>
              : !isSelected
              ? <span>-Rs 0</span>
              : <>-Rs {(item.unitPrice * (returnLine?.returnQty ?? item.quantity)).toLocaleString()}</>}
          </div>
        ) : (
          <div className="w-28 text-right text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
            Rs {lineTotal.toLocaleString()}
          </div>
        )}

        {/* 8. Delete Icon */}
        <div className="w-12 flex justify-center">
          <button
            type="button"
            onClick={() => removeFromCart(item.productId, isReturn)}
            aria-label={`Remove ${item.productName}`}
            className="text-text-muted hover:text-danger hover:bg-danger/10 p-1.5 rounded-md transition-all opacity-80 hover:opacity-100"
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden min-h-0 bg-surface">

      {/* Table Header: Exactly matching approved PNG */}
      <div className="flex items-center px-3 py-2 border-b border-border bg-surface-hover/70 text-[10px] font-black text-text-muted uppercase tracking-widest shrink-0">
        <div className="w-12">S.No</div>
        <div className="flex-1 min-w-[140px]">Product Name</div>
        <div className="w-32">IMEI / Serial</div>
        <div className="w-28 text-center">Qty</div>
        <div className="w-24 text-right">Price</div>
        <div className="w-16 text-center">Disc</div>
        <div className="w-28 text-right">Total</div>
        <div className="w-12 text-center">Del</div>
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
