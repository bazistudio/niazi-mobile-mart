import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Package, Loader2, ChevronDown, Building2, Store, Check, Info } from 'lucide-react';
import { useGlobalSearch, GlobalSearchResultItem } from '@/hooks/useGlobalSearch';
import { useCategories } from '@/features/inventory/hooks/useCategories';
import { ProductDetailsDrawer } from '@/features/inventory/product/components/ProductDetailsDrawer';
import { InventoryProduct, StockStatus } from '@/features/inventory/types';

interface SearchInputProps {
  placeholder?: string;
  onSearch?: (term: string) => void;
}

export const SearchInput = ({ placeholder = "Search products...", onSearch }: SearchInputProps) => {
  const [query, setQuery] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [isFocused, setIsFocused] = useState(false);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [revealedPriceId, setRevealedPriceId] = useState<string | null>(null);
  const [selectedProductForDetails, setSelectedProductForDetails] = useState<InventoryProduct | null>(null);

  // Dynamic Product Types master data from authoritative source
  const { categories, isLoading: isLoadingCategories } = useCategories();

  // Set 'Unit' as the default selected type once categories load (if available), fallback to empty ('All Products')
  useEffect(() => {
    if (categories && categories.length > 0 && selectedTypeId === '') {
      const unitType = categories.find(c => c.name.trim().toLowerCase() === 'unit');
      if (unitType) {
        setSelectedTypeId(unitType.id);
      }
    }
  }, [categories, selectedTypeId]);

  // Search results starting from the very 1st typed character
  const { results, isLoading, error, debouncedQuery } = useGlobalSearch(query, selectedTypeId, isFocused, 300);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Global Shortcuts: Ctrl+K or Ctrl+/
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === '/')) {
        e.preventDefault();
        document.getElementById('search-field')?.focus();
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsFocused(false);
        setIsTypeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Open Product Details without adding to POS cart or redirecting
  const handleProductClick = (product: GlobalSearchResultItem, e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    // Map GlobalSearchResultItem to InventoryProduct shape for ProductDetailsDrawer
    const mappedProduct: InventoryProduct = {
      id: product.id || product._id || '',
      name: product.name,
      sku: product.sku || '',
      barcode: product.barcode || '',
      description: '',
      price: product.price ?? product.salePrice ?? 0,
      costPrice: product.costPrice ?? product.purchasePrice,
      purchasePrice: product.purchasePrice ?? product.costPrice,
      stock: product.totalStock ?? product.quantity ?? 0,
      branchStock: product.branchStock,
      warehouseStock: product.warehouseStock,
      status: (product.totalStock ?? 0) > 2 ? StockStatus.IN_STOCK : ((product.totalStock ?? 0) > 0 ? StockStatus.LOW_STOCK : StockStatus.OUT_OF_STOCK),
      minStockThreshold: 2,
      category: product.typeName || '',
      brand: product.brand || '',
      unit: 'pcs',
      trackInventory: true,
      serialTracking: false,
      imeiTracking: false,
      batchTracking: false,
      expiryTracking: false,
      costMethod: 'Average Cost',
      compatibleModels: product.compatibleModels || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSelectedProductForDetails(mappedProduct);
    setIsFocused(false);
  };

  const hasResults = results.products.length > 0;

  useEffect(() => {
    setSelectedIndex(-1);
  }, [results, query]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isFocused || !hasResults) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.products.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : results.products.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.products.length) {
        handleProductClick(results.products[selectedIndex]);
      } else if (results.products.length > 0) {
        handleProductClick(results.products[0]);
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (selectedIndex >= 0) {
      const el = document.getElementById(`search-item-${selectedIndex}`);
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onSearch?.(val);
  };

  const activeTypeLabel = selectedTypeId 
    ? (categories.find(c => c.id === selectedTypeId)?.name || 'Product Type')
    : 'All Products';

  return (
    <>
      <div className="relative flex w-full min-w-0 md:ml-0 max-w-2xl" ref={dropdownRef}>
        <div className="w-full flex items-center bg-surface-hover rounded-full border border-border focus-within:border-primary focus-within:bg-surface focus-within:ring-2 focus-within:ring-focus-ring transition-all shadow-sm">
          <label htmlFor="search-field" className="sr-only">
            Search products
          </label>
          <div className="relative flex-grow text-text-muted focus-within:text-text-primary flex items-center">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              ) : (
                <Search className="h-5 w-5" aria-hidden="true" />
              )}
            </div>
            <input
              id="search-field"
              className="block h-10 w-full bg-transparent border-0 py-2 pl-10 pr-3 text-text-primary placeholder-text-muted focus:outline-none sm:text-sm"
              placeholder={placeholder}
              type="search"
              name="search"
              autoComplete="off"
              value={query}
              onChange={handleChange}
              onFocus={() => setIsFocused(true)}
              onKeyDown={handleInputKeyDown}
            />
          </div>
          
          {/* Dynamic Product Type Dropdown Toggle */}
          <div className="relative flex-shrink-0 border-l border-border h-6 mx-2"></div>
          <button
            type="button"
            onClick={() => { setIsTypeDropdownOpen(!isTypeDropdownOpen); setIsFocused(true); }}
            className="flex items-center gap-1.5 pr-4 pl-2 h-10 text-xs font-semibold text-text-secondary hover:text-text-primary focus:outline-none truncate max-w-[170px]"
            title={activeTypeLabel}
          >
            <span className="truncate">{activeTypeLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
          </button>
        </div>

        {/* Dynamic Product Types Dropdown Menu */}
        {isTypeDropdownOpen && (
          <div className="absolute top-12 right-0 w-56 max-h-72 overflow-y-auto bg-surface rounded-xl shadow-dropdown border border-border overflow-hidden z-[var(--z-dropdown)] py-1">
            <button
              type="button"
              className={`w-full text-left px-3.5 py-2 text-xs font-medium flex items-center justify-between hover:bg-surface-hover ${selectedTypeId === '' ? 'text-primary font-bold bg-surface-hover' : 'text-text-secondary'}`}
              onClick={() => {
                setSelectedTypeId('');
                setIsTypeDropdownOpen(false);
                document.getElementById('search-field')?.focus();
              }}
            >
              <span>All Products</span>
              {selectedTypeId === '' && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
            
            {isLoadingCategories && (
              <div className="px-3.5 py-2 text-xs text-text-muted flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading types...
              </div>
            )}

            {categories.map(cat => (
              <button
                key={cat.id}
                type="button"
                className={`w-full text-left px-3.5 py-2 text-xs font-medium flex items-center justify-between hover:bg-surface-hover ${selectedTypeId === cat.id ? 'text-primary font-bold bg-surface-hover' : 'text-text-secondary'}`}
                onClick={() => {
                  setSelectedTypeId(cat.id);
                  setIsTypeDropdownOpen(false);
                  document.getElementById('search-field')?.focus();
                }}
              >
                <span className="truncate">{cat.name}</span>
                {selectedTypeId === cat.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            ))}
          </div>
        )}

        {/* Dropdown UI for results (Triggers from 1st character) */}
        {isFocused && query.trim().length >= 1 && !isTypeDropdownOpen && (
          <div className="absolute top-12 left-0 w-full bg-surface rounded-xl shadow-dropdown border border-border overflow-hidden z-[var(--z-popover)]">
            <div className="max-h-[75vh] overflow-y-auto p-2">
              
              {error && (
                <div className="p-4 text-sm text-danger text-center">{error}</div>
              )}

              {!isLoading && !hasResults && !error && (
                <div className="p-8 text-center text-text-muted">
                  <p className="text-sm font-medium mb-1">No products with available stock found for "{query}"</p>
                  <p className="text-xs text-text-muted">Only products currently having positive stock (&gt; 0) in at least one branch or warehouse are displayed.</p>
                </div>
              )}

              {/* Products List */}
              {results.products.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[11px] font-bold text-text-muted uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-primary" /> Products ({results.products.length})
                    </span>
                    <span className="text-[10px] text-text-muted lowercase font-normal">Click to view details &amp; multi-branch availability</span>
                  </div>
                  <div className="space-y-1.5 mt-1">
                    {results.products.map((product, i) => {
                      const isSelected = selectedIndex === i;
                      const hasLocations = product.stockLocations && product.stockLocations.length > 0;
                      
                      return (
                        <button
                          type="button"
                          id={`search-item-${i}`}
                          key={product.id || product._id}
                          onClick={(e) => handleProductClick(product, e)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors group ${
                            isSelected 
                              ? 'bg-surface-hover border-primary/40 ring-1 ring-focus-ring' 
                              : 'border-border/60 hover:bg-surface-hover hover:border-border'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            {/* Product Info */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="text-base font-bold text-text-primary group-hover:text-primary leading-tight">
                                  {product.name}
                                </span>
                                {product.sku && (
                                  <span className="font-mono bg-surface px-1.5 py-0.5 rounded border border-border/70 text-[11px] text-text-muted">
                                    {product.sku}
                                  </span>
                                )}
                                {product.barcode && (
                                  <span className="font-mono bg-surface px-1.5 py-0.5 rounded border border-border/70 text-[11px] text-text-muted">
                                    {product.barcode}
                                  </span>
                                )}
                                {product.match_type === 'COMPATIBLE_MODEL' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                    Compatible: {product.matched_value || product.matched_compatible_model}
                                  </span>
                                )}
                              </div>
                              
                              {/* Full Product Specifications Line (Type, Quality, Color, Brand, Company, Fits) matching POS bar with scaled up text */}
                              <div className="flex items-center gap-2 text-xs mt-1.5 flex-wrap">
                                {product.typeName && (
                                  <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded font-bold uppercase tracking-wider text-xs">
                                    {product.typeName}
                                  </span>
                                )}
                                {product.quality && product.quality !== '-' && (
                                  <span className="px-2 py-0.5 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded font-medium text-xs">
                                    {product.quality}
                                  </span>
                                )}
                                {product.color && product.color !== '-' && (
                                  <span className="px-2 py-0.5 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded font-medium text-xs">
                                    {product.color}
                                  </span>
                                )}
                                {product.brand && product.brand !== '-' && (
                                  <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded font-medium text-xs">
                                    {product.brand}
                                  </span>
                                )}
                                {product.company && product.company !== '-' && (
                                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded font-medium text-xs">
                                    {product.company}
                                  </span>
                                )}
                                {product.compatibleModels && product.compatibleModels.length > 0 && (
                                  <span className="text-xs text-text-muted font-normal">
                                    Fits: <span className="font-medium text-text-secondary">{product.compatibleModels.slice(0, 3).join(', ')}{product.compatibleModels.length > 3 ? '...' : ''}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Price Section */}
                            <div className="flex flex-col items-end shrink-0">
                              <span 
                                className="text-base font-extrabold text-primary tabular-nums"
                                onMouseDown={(e) => { e.stopPropagation(); setRevealedPriceId(product.id || product._id || null); }}
                                onMouseUp={(e) => { e.stopPropagation(); setRevealedPriceId(null); }}
                                onMouseLeave={(e) => { e.stopPropagation(); setRevealedPriceId(null); }}
                                onTouchStart={(e) => { e.stopPropagation(); setRevealedPriceId(product.id || product._id || null); }}
                                onTouchEnd={(e) => { e.stopPropagation(); setRevealedPriceId(null); }}
                                onClick={(e) => { e.stopPropagation(); }}
                                title="Hold to see cost price"
                              >
                                Rs {(revealedPriceId === (product.id || product._id) ? (product.purchasePrice ?? product.costPrice ?? 0) : (product.price ?? product.salePrice ?? 0)).toLocaleString()}
                              </span>
                              <span className="text-xs text-text-muted mt-0.5">
                                Total Stock: <strong className="text-text-primary font-bold text-xs">{product.totalStock ?? product.quantity ?? 0} pcs</strong>
                              </span>
                            </div>
                          </div>

                          {/* POSITIVE-STOCK LOCATIONS ONLY CHIPS */}
                          {hasLocations && (
                            <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-text-muted uppercase tracking-wider mr-1">
                                Available at:
                              </span>
                              {product.stockLocations.map((loc) => {
                                const isWarehouse = loc.branchName.toLowerCase().includes('warehouse') || loc.branchId === '00000000-0000-0000-0000-000000000003';
                                return (
                                  <span 
                                    key={loc.branchId}
                                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-md border ${
                                      isWarehouse 
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                    }`}
                                  >
                                    {isWarehouse ? <Building2 className="h-3.5 w-3.5 shrink-0" /> : <Store className="h-3.5 w-3.5 shrink-0" />}
                                    <span>{loc.branchName}</span>
                                    <strong className="ml-0.5 px-1 rounded bg-black/5 dark:bg-white/10 tabular-nums">{loc.quantity}</strong>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </div>

      {/* Existing Product Details Drawer opened upon product selection */}
      {selectedProductForDetails && (
        <ProductDetailsDrawer
          product={selectedProductForDetails}
          onClose={() => setSelectedProductForDetails(null)}
          onEdit={() => {}}
        />
      )}
    </>
  );
};

export default SearchInput;
