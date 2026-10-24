'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { usePosStore } from '../store/usePosStore';
import { useInventoryStore } from '@/features/inventory/core/inventory.store';

export const ProductSearch = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [revealedPriceId, setRevealedPriceId] = useState<string | null>(null);

  const activeSession = usePosStore(state => state.saleTabs.find(t => t.id === state.activeTabId));
  const addToCart = usePosStore(state => state.addToCart);
  const products = useInventoryStore((s) => s.products);

  const isReplaceMode = activeSession?.mode === 'replace';
  const [targetBucket, setTargetBucket] = useState<'new' | 'return'>('new');

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-switch back to 'new' if replace mode is turned off
  useEffect(() => {
    if (!isReplaceMode) setTargetBucket('new');
  }, [isReplaceMode]);

  // Debounce logic
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Search logic
  useEffect(() => {
    if (!debouncedTerm.trim()) {
      setResults([]);
      setIsDropdownOpen(false);
      return;
    }

    const lowerTerm = debouncedTerm.toLowerCase();
    const filtered = products.filter(p => {
      const matchName = p.name.toLowerCase().includes(lowerTerm);
      const matchSku = p.sku.toLowerCase().includes(lowerTerm);
      const matchBarcode = (p.barcode || '').toLowerCase().includes(lowerTerm);
      const matchBrand = (p.brand || '').toLowerCase().includes(lowerTerm) && p.brand !== '-';
      const matchCompany = (p.company || '').toLowerCase().includes(lowerTerm) && p.company !== '-';
      const matchQuality = (p.quality || '').toLowerCase().includes(lowerTerm) && p.quality !== '-';
      const matchColor = (p.color || '').toLowerCase().includes(lowerTerm) && p.color !== '-';
      const matchCategory = (p.category || '').toLowerCase().includes(lowerTerm);
      const matchModels = Array.isArray(p.compatibleModels) && p.compatibleModels.some((m: string) => m.toLowerCase().includes(lowerTerm));

      return matchName || matchSku || matchBarcode || matchBrand || matchCompany || matchQuality || matchColor || matchCategory || matchModels;
    }).slice(0, 20); // Cap at 20 results

    setResults(filtered);
    setSelectedIndex(0);
    setIsDropdownOpen(true);
  }, [debouncedTerm, products]);

  // Scroll to selected item
  useEffect(() => {
    if (isDropdownOpen && resultsListRef.current) {
      const selectedEl = resultsListRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        const container = resultsListRef.current;
        if (selectedEl.offsetTop < container.scrollTop) {
          container.scrollTop = selectedEl.offsetTop;
        } else if (selectedEl.offsetTop + selectedEl.offsetHeight > container.scrollTop + container.offsetHeight) {
          container.scrollTop = selectedEl.offsetTop + selectedEl.offsetHeight - container.offsetHeight;
        }
      }
    }
  }, [selectedIndex, isDropdownOpen]);

  // Keyboard shortcut for focusing search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearchTerm('');
        setIsDropdownOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isDropdownOpen && results.length > 0) setIsDropdownOpen(true);
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();

      // If dropdown is open and we have results matching the debounce, select it
      if (isDropdownOpen && results.length > 0) {
        const product = results[selectedIndex];
        if (product && (product.stock > 0 || targetBucket === 'return')) {
          handleAdd(product);
          return;
        }
      }

      // Fallback: If they hit enter before debounce or for exact matches
      const searchTarget = searchTerm.trim().toLowerCase();
      if (!searchTarget) return;

      const exactMatch = products.find(p =>
        (p.barcode || '').toLowerCase() === searchTarget ||
        (p.sku || '').toLowerCase() === searchTarget ||
        p.name.toLowerCase() === searchTarget ||
        (p.quality || '').toLowerCase() === searchTarget ||
        (p.color || '').toLowerCase() === searchTarget ||
        (p.brand || '').toLowerCase() === searchTarget ||
        (p.company || '').toLowerCase() === searchTarget ||
        (Array.isArray(p.compatibleModels) && p.compatibleModels.some((m: string) => m.toLowerCase() === searchTarget))
      );

      if (exactMatch && (exactMatch.stock > 0 || targetBucket === 'return')) {
        handleAdd(exactMatch);
      } else if (results.length > 0) {
        // Just grab the first result if it exists as a fallback
        const product = results[0];
        if (product && (product.stock > 0 || targetBucket === 'return')) {
          handleAdd(product);
        }
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  const handleAdd = (product: any) => {
    const dbProduct = {
      id: product.id || product._id,
      sku: product.sku,
      barcode: product.barcode || '',
      name: product.name,
      costPrice: product.purchasePrice ?? product.costPrice ?? 0,
      salePrice: product.price ?? product.salePrice ?? 0,
      stock: product.stock,
      reservedStock: 0,
      lastUpdated: Date.now()
    };
    addToCart(dbProduct, targetBucket === 'return');
    setSearchTerm('');
    setIsDropdownOpen(false);
    // Auto focus back to input for rapid scanning
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  return (
    <div className="relative z-50 flex flex-col gap-2 w-full" ref={containerRef}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isDropdownOpen) setIsDropdownOpen(true);
          }}
          onFocus={() => {
            if (results.length > 0) setIsDropdownOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Scan or search products..."
          className={`block w-full pl-10 pr-3 py-1.5 text-sm border rounded-md bg-gray-50 focus:bg-white dark:bg-gray-800/50 dark:focus:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all ${targetBucket === 'return' ? 'border-orange-200 focus:border-orange-500 focus:ring-orange-500/20' : 'border-gray-200 dark:border-gray-700 focus:border-[#006970] focus:ring-[#006970]/20'
            }`}
        />
      </div>

      {/* Dropdown Results */}
      {isDropdownOpen && debouncedTerm.trim() && (
        <div className="absolute top-[40px] left-0 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-2xl overflow-hidden z-[100] flex flex-col max-h-[60vh]">

          <div className="flex justify-between items-center p-1.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <div className="flex gap-2 text-[10px] text-gray-500 dark:text-gray-400 ml-1">
              <span><kbd className="bg-gray-200 dark:bg-gray-700 px-1 rounded mr-0.5">↓↑</kbd> Navigate</span>
              <span><kbd className="bg-gray-200 dark:bg-gray-700 px-1 rounded mr-0.5">↵</kbd> Select</span>
              <span><kbd className="bg-gray-200 dark:bg-gray-700 px-1 rounded mr-0.5">ESC</kbd> Close</span>
            </div>

            {isReplaceMode && (
              <div className="flex bg-gray-200 dark:bg-gray-700 p-0.5 rounded-md">
                <button
                  onClick={() => setTargetBucket('return')}
                  className={`flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded transition-all ${targetBucket === 'return' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white'}`}
                >
                  <ArrowDownToLine className="h-2.5 w-2.5" />
                  RETURN
                </button>
                <button
                  onClick={() => setTargetBucket('new')}
                  className={`flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded transition-all ${targetBucket === 'new' ? 'bg-[#006970] text-white shadow-sm' : 'text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white'}`}
                >
                  <ArrowUpFromLine className="h-2.5 w-2.5" />
                  NEW
                </button>
              </div>
            )}
          </div>
          {results.length > 0 ? (
            <div className="overflow-y-auto no-scrollbar" ref={resultsListRef}>
              {results.map((product, index) => {
                const isSelected = index === selectedIndex;
                const canAdd = product.stock > 0 || targetBucket === 'return';

                const hasQuality = product.quality && product.quality !== '-' && product.quality.trim().length > 0;
                const hasColor = product.color && product.color !== '-' && product.color.trim().length > 0;
                const hasCompany = product.company && product.company !== '-' && product.company.trim().length > 0;
                const hasBrand = product.brand && product.brand !== '-' && product.brand.trim().length > 0;
                const fitsModels = Array.isArray(product.compatibleModels) && product.compatibleModels.length > 0
                  ? product.compatibleModels.slice(0, 3).join(', ') + (product.compatibleModels.length > 3 ? '...' : '')
                  : null;

                return (
                  <div
                    key={product.id || product._id}
                    onClick={() => {
                      if (canAdd) handleAdd(product);
                    }}
                    className={`flex flex-col gap-1 px-3 py-2 border-b transition-colors cursor-pointer ${isSelected
                        ? 'bg-[#006970]/10 dark:bg-[#00B4BB]/20 border-[#006970] dark:border-[#00B4BB] border-l-2 border-r-0 border-y-0 shadow-inner'
                        : 'border-gray-100 dark:border-gray-800'
                      } ${canAdd ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50' : 'opacity-60 cursor-not-allowed'}`}
                  >
                    {/* Primary Line: Product Name & Sale Price */}
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[11px] sm:text-xs font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                        {product.name}
                      </span>
                      <span 
                        className="text-[11px] sm:text-xs font-black text-right text-gray-900 dark:text-gray-100 tabular-nums shrink-0 cursor-pointer select-none"
                        onMouseDown={(e) => { e.stopPropagation(); setRevealedPriceId(product.id || product._id); }}
                        onMouseUp={(e) => { e.stopPropagation(); setRevealedPriceId(null); }}
                        onMouseLeave={(e) => { e.stopPropagation(); setRevealedPriceId(null); }}
                        onTouchStart={(e) => { e.stopPropagation(); setRevealedPriceId(product.id || product._id); }}
                        onTouchEnd={(e) => { e.stopPropagation(); setRevealedPriceId(null); }}
                        onClick={(e) => { e.stopPropagation(); }}
                        title="Hold to see cost price"
                      >
                        Rs {revealedPriceId === (product.id || product._id) 
                          ? (product.purchasePrice ?? product.costPrice ?? 0).toLocaleString() 
                          : (product.price ?? product.salePrice ?? 0).toLocaleString()}
                      </span>
                    </div>

                    {/* Specification Line: Quality, Color, Brand, Company, Fits */}
                    {(hasQuality || hasColor || hasCompany || hasBrand || fitsModels) && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-300">
                        {hasQuality && (
                          <span className="px-1.5 py-0.2 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded font-medium">
                            {product.quality}
                          </span>
                        )}
                        {hasColor && (
                          <span className="px-1.5 py-0.2 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded font-medium">
                            {product.color}
                          </span>
                        )}
                        {hasBrand && (
                          <span className="px-1.5 py-0.2 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded font-medium">
                            {product.brand}
                          </span>
                        )}
                        {hasCompany && (
                          <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded font-medium">
                            {product.company}
                          </span>
                        )}
                        {fitsModels && (
                          <span className="text-[9px] text-gray-500 dark:text-gray-400 font-normal">
                            Fits: <span className="font-medium text-gray-700 dark:text-gray-300">{fitsModels}</span>
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* Identification / Status Line: SKU, Barcode, Stock, ADD button */}
                    <div className="flex justify-between items-center gap-2 mt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                          {product.sku}
                        </span>
                        {product.barcode && (
                          <span className="text-[9px] text-gray-400 font-mono">
                            {product.barcode}
                          </span>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${canAdd ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {product.stock} Left
                        </span>
                      </div>
                      
                      <button
                        disabled={!canAdd}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdd(product);
                        }}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold transition-colors disabled:opacity-50 disabled:bg-transparent disabled:text-gray-400 ${targetBucket === 'return'
                            ? 'bg-orange-100 text-orange-700 hover:bg-orange-500 hover:text-white dark:bg-orange-900/30 dark:text-orange-400'
                            : 'bg-gray-200 text-gray-700 hover:bg-[#006970] hover:text-white dark:bg-gray-700 dark:text-gray-200'
                          }`}
                      >
                        ADD
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-3 text-xs text-center text-gray-500 dark:text-gray-400">
              No products found for "{debouncedTerm}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};
