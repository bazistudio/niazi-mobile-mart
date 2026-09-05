import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Package, Users, Truck, FileText, Loader2, ChevronDown } from 'lucide-react';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { usePosStore } from '@/features/pos/store/usePosStore';

interface SearchInputProps {
  placeholder?: string;
  onSearch?: (term: string) => void;
}

const CATEGORIES = [
  { id: 'invoice', label: 'Invoices' },
  { id: 'customer', label: 'Customers' },
  { id: 'supplier', label: 'Suppliers' },
];

export const SearchInput = ({ placeholder = "Search products, customers, invoices...", onSearch }: SearchInputProps) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('quick');
  const [isFocused, setIsFocused] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [revealedPriceId, setRevealedPriceId] = useState<string | null>(null);

  const { results, isLoading, error, debouncedQuery } = useGlobalSearch(query, category, isFocused, 300);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const location = useLocation();
  const pathname = location.pathname;
  const navigate = useNavigate();
  const { addToCart } = usePosStore();
  const isPosPage = pathname === '/dashboard/shop-admin/pos';

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
        setIsCategoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleProductSelect = (product: any, e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    // Map global search result to DBInventory format expected by POS
    const posProduct = {
      id: product._id,
      sku: product.sku || '',
      barcode: product.barcode || '',
      name: product.name,
      salePrice: product.price ?? product.salePrice ?? 0,
      costPrice: product.purchasePrice ?? product.costPrice ?? 0,
      stock: product.quantity || 0
    };
    addToCart(posProduct as any);
    
    if (!isPosPage) {
      navigate('/dashboard/shop-admin/pos');
    }
    
    setIsFocused(false);
    setQuery('');
  };

  const handleLinkClick = () => {
    setIsFocused(false);
    setQuery('');
  };

  const handleGlobalSelect = (type: string, item: any) => {
    if (type === 'product') {
      handleProductSelect(item);
    } else if (type === 'customer') {
      navigate(`/dashboard/shop-admin/customers/${item._id}`);
      handleLinkClick();
    } else if (type === 'supplier') {
      navigate(`/dashboard/shop-admin/suppliers/${item._id}`);
      handleLinkClick();
    } else if (type === 'invoice') {
      const orderNum = item.orderNumber || item.invoiceNumber || query;
      const cleanNum = orderNum.replace(/^ORD-/i, '');
      navigate(`/dashboard/shop-admin?invoice=${cleanNum}`);
      handleLinkClick();
    }
  };

  const hasResults =
    results.products.length > 0 ||
    results.customers.length > 0 ||
    results.suppliers.length > 0 ||
    results.invoices.length > 0;

  // Flatten items for arrow key navigation
  const allItems = useMemo(() => {
    const items: { type: string, item: any }[] = [];
    results.products.forEach(p => items.push({ type: 'product', item: p }));
    results.customers.forEach(c => items.push({ type: 'customer', item: c }));
    results.suppliers.forEach(s => items.push({ type: 'supplier', item: s }));
    results.invoices.forEach(i => items.push({ type: 'invoice', item: i }));
    return items;
  }, [results]);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [results, query]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isFocused || !hasResults) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < allItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : allItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < allItems.length) {
        const selected = allItems[selectedIndex];
        handleGlobalSelect(selected.type, selected.item);
      } else if (allItems.length > 0) {
        // If nothing is selected but they press enter, select the first match
        handleGlobalSelect(allItems[0].type, allItems[0].item);
      }
    }
  };

  // Calculate offsets for index mapping
  const productsOffset = 0;
  const customersOffset = results.products.length;
  const suppliersOffset = customersOffset + results.customers.length;
  const invoicesOffset = suppliersOffset + results.suppliers.length;

  // Scroll active item into view
  useEffect(() => {
    if (selectedIndex >= 0) {
      const el = document.getElementById(`search-item-${selectedIndex}`);
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Barcode Auto-select logic
  useEffect(() => {
    if (query.trim().length > 5 && results.products.length > 0) {
      const bestProduct = results.products[0];
      if (bestProduct.barcode === query.trim()) {
        handleProductSelect(bestProduct);
      }
    }
  }, [query, results.products]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    
    // Prefix parsing
    let cleanVal = val;
    let matchedCategory = null;
    if (val.startsWith('p:')) { matchedCategory = 'product'; cleanVal = val.slice(2).trimStart(); }
    else if (val.startsWith('i:')) { matchedCategory = 'invoice'; cleanVal = val.slice(2).trimStart(); }
    else if (val.startsWith('c:')) { matchedCategory = 'customer'; cleanVal = val.slice(2).trimStart(); }
    else if (val.startsWith('s:')) { matchedCategory = 'supplier'; cleanVal = val.slice(2).trimStart(); }

    if (matchedCategory) {
      setCategory(matchedCategory);
      setQuery(cleanVal);
      onSearch?.(cleanVal);
    } else {
      setQuery(val);
      onSearch?.(val);
    }
  };

  const getMatchBadge = (item: any, query: string, fields: { key: string; label: string }[]) => {
    if (!query) return null;
    const q = query.toLowerCase();
    
    let bestMatch: { label: string; priority: number } | null = null;
    
    for (const field of fields) {
      const val = item[field.key];
      if (!val) continue;
      
      const itemStr = String(val).toLowerCase();
      let priority = -1;
      
      if (itemStr === q) priority = 3; // exact
      else if (itemStr.startsWith(q)) priority = 2; // startsWith
      else if (itemStr.includes(q)) priority = 1; // includes
      
      if (priority > (bestMatch?.priority || 0)) {
        bestMatch = { label: field.label, priority };
      }
      
      if (priority === 3) break;
    }
    
    if (bestMatch) {
      return (
        <span className="ml-2 text-[10px] uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
          Matched {bestMatch.label}
        </span>
      );
    }
    
    return null;
  };

  const activeCategoryLabel = CATEGORIES.find(c => c.id === category)?.label || 'Quick Search';

  return (
    <div className="relative flex w-full min-w-0 md:ml-0 max-w-2xl" ref={dropdownRef}>
      <div className="w-full flex items-center bg-surface-hover rounded-full border border-border focus-within:border-primary focus-within:bg-surface focus-within:ring-2 focus-within:ring-focus-ring transition-all shadow-sm">
        <label htmlFor="search-field" className="sr-only">
          Search
        </label>
        <div className="relative flex-grow text-text-muted focus-within:text-text-primary flex items-center">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            ) : (
              <Search className="h-5 w-5" aria-hidden="true" />
            )}
          </div>
          {category === 'invoice' && (
            <span className="absolute inset-y-0 left-10 flex items-center pr-1 text-sm font-medium text-text-muted select-none">
              ORD-
            </span>
          )}
          <input
            id="search-field"
            className={`block h-10 w-full bg-transparent border-0 py-2 ${category === 'invoice' ? 'pl-20' : 'pl-10'} pr-3 text-text-primary placeholder-text-muted focus:outline-none sm:text-sm`}
            placeholder={category === 'invoice' ? '000027' : placeholder}
            type="search"
            name="search"
            autoComplete="off"
            value={query}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onKeyDown={handleInputKeyDown}
          />
        </div>
        
        {/* Category Dropdown Toggle */}
        <div className="relative flex-shrink-0 border-l border-border h-6 mx-2"></div>
        <button
          type="button"
          onClick={() => { setIsCategoryOpen(!isCategoryOpen); setIsFocused(true); }}
          className="flex items-center gap-1 pr-4 pl-2 h-10 text-sm font-medium text-text-secondary hover:text-text-primary focus:outline-none"
        >
          {activeCategoryLabel} <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {/* Categories Dropdown Menu */}
      {isCategoryOpen && (
        <div className="absolute top-12 right-0 w-48 bg-surface rounded-md shadow-dropdown border border-border overflow-hidden z-[var(--z-dropdown)]">
          <div className="py-1">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-hover ${category === cat.id ? 'text-primary font-semibold bg-surface-hover' : 'text-text-secondary'}`}
                onClick={() => {
                  setCategory(cat.id);
                  setIsCategoryOpen(false);
                  document.getElementById('search-field')?.focus();
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dropdown UI for results */}
      {isFocused && query.trim().length >= 2 && !isCategoryOpen && (
        <div className="absolute top-12 left-0 w-full bg-surface rounded-md shadow-dropdown border border-border overflow-hidden z-[var(--z-popover)]">
          <div className="max-h-[70vh] overflow-y-auto p-2">
            
            {error && (
              <div className="p-4 text-sm text-danger text-center">{error}</div>
            )}

            {!isLoading && !hasResults && !error && (
              <div className="p-8 text-center text-text-muted">
                <p className="text-sm mb-4">No results found for "{query}"</p>
                <div className="flex flex-col gap-2 text-xs">
                  <p className="text-text-muted">Suggestions:</p>
                  <p>• Try searching by SKU</p>
                  <p>• Try customer phone</p>
                  <p>• Try invoice number</p>
                </div>
              </div>
            )}

            {/* Products */}
            {results.products.length > 0 && (
              <div className="mb-2">
                <div className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
                  <Package className="h-4 w-4" /> Products
                </div>
                <div className="space-y-1">
                  {results.products.map((product, i) => {
                    const globalIdx = productsOffset + i;
                    const isSelected = selectedIndex === globalIdx;
                    return (
                      <button
                        type="button"
                        id={`search-item-${globalIdx}`}
                        key={product._id}
                        onClick={(e) => handleProductSelect(product, e)}
                        className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-md transition-colors group ${isSelected ? 'bg-surface-hover ring-1 ring-focus-ring' : 'hover:bg-surface-hover'}`}
                      >
                        <div>
                          <p className="text-sm font-medium text-text-primary group-hover:text-primary flex items-center">
                            {product.name}
                            {getMatchBadge(product, query, [
                              { key: 'name', label: 'Name' },
                              { key: 'sku', label: 'SKU' },
                              { key: 'barcode', label: 'Barcode' }
                            ])}
                          </p>
                          <p className="text-xs text-text-muted">{product.sku || product.barcode}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span 
                            className="text-sm font-bold text-primary cursor-pointer select-none"
                            onMouseDown={(e) => { e.stopPropagation(); setRevealedPriceId(product._id); }}
                            onMouseUp={(e) => { e.stopPropagation(); setRevealedPriceId(null); }}
                            onMouseLeave={(e) => { e.stopPropagation(); setRevealedPriceId(null); }}
                            onTouchStart={(e) => { e.stopPropagation(); setRevealedPriceId(product._id); }}
                            onTouchEnd={(e) => { e.stopPropagation(); setRevealedPriceId(null); }}
                            onClick={(e) => { e.stopPropagation(); }}
                            title="Hold to see cost price"
                          >
                            Rs {revealedPriceId === product._id ? (product.purchasePrice ?? product.costPrice ?? 0) : (product.price ?? product.salePrice ?? 0)}
                          </span>
                          <span className="text-xs font-semibold bg-surface-hover text-text-secondary px-2 py-0.5 rounded-md border border-border">
                            Qty: {product.quantity}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Customers */}
            {results.customers.length > 0 && (
              <div className="mb-2">
                <div className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
                  <Users className="h-4 w-4" /> Customers
                </div>
                <div className="space-y-1">
                  {results.customers.map((customer, i) => {
                    const globalIdx = customersOffset + i;
                    const isSelected = selectedIndex === globalIdx;
                    return (
                      <Link
                        id={`search-item-${globalIdx}`}
                        key={customer._id}
                        to={`/dashboard/shop-admin/customers/${customer._id}`}
                        onClick={handleLinkClick}
                        className={`flex items-center justify-between px-3 py-2 rounded-md transition-colors group ${isSelected ? 'bg-surface-hover ring-1 ring-focus-ring' : 'hover:bg-surface-hover'}`}
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-[#006970] dark:group-hover:text-[#008990] flex items-center">
                            {customer.name}
                            {getMatchBadge(customer, query, [
                              { key: 'name', label: 'Name' },
                              { key: 'phone', label: 'Phone' },
                              { key: 'email', label: 'Email' }
                            ])}
                          </p>
                          <p className="text-xs text-text-muted">{customer.phone}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Suppliers */}
            {results.suppliers.length > 0 && (
              <div className="mb-2">
                <div className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
                  <Truck className="h-4 w-4" /> Suppliers
                </div>
                <div className="space-y-1">
                  {results.suppliers.map((supplier, i) => {
                    const globalIdx = suppliersOffset + i;
                    const isSelected = selectedIndex === globalIdx;
                    return (
                      <Link
                        id={`search-item-${globalIdx}`}
                        key={supplier._id}
                        to={`/dashboard/shop-admin/suppliers/${supplier._id}`}
                        onClick={handleLinkClick}
                        className={`flex items-center justify-between px-3 py-2 rounded-md transition-colors group ${isSelected ? 'bg-surface-hover ring-1 ring-focus-ring' : 'hover:bg-surface-hover'}`}
                      >
                        <div>
                          <p className="text-sm font-medium text-text-primary group-hover:text-primary flex items-center">
                            {supplier.name}
                            {getMatchBadge(supplier, query, [
                              { key: 'name', label: 'Name' },
                              { key: 'companyName', label: 'Company' },
                              { key: 'phone', label: 'Phone' },
                              { key: 'email', label: 'Email' }
                            ])}
                          </p>
                          <p className="text-xs text-text-muted">{supplier.companyName || supplier.phone}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Invoices */}
            {results.invoices.length > 0 && (
              <div className="mb-2">
                <div className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Invoices
                </div>
                <div className="space-y-1">
                  {results.invoices.map((invoice, i) => {
                    const globalIdx = invoicesOffset + i;
                    const isSelected = selectedIndex === globalIdx;
                    return (
                      <Link
                        id={`search-item-${globalIdx}`}
                        key={invoice._id}
                        to={`/dashboard/shop-admin/history?invoice=${invoice._id}`}
                        onClick={handleLinkClick}
                        className={`flex items-center justify-between px-3 py-2 rounded-md transition-colors group ${isSelected ? 'bg-surface-hover ring-1 ring-focus-ring' : 'hover:bg-surface-hover'}`}
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-[#006970] dark:group-hover:text-[#008990] flex items-center">
                            Invoice #{invoice.orderNumber || invoice.invoiceNumber}
                            {getMatchBadge(invoice, query, [
                              { key: 'invoiceNumber', label: 'Invoice #' },
                              { key: 'orderNumber', label: 'Order #' }
                            ])}
                          </p>
                          <p className="text-xs text-gray-500">
                            {typeof invoice.customerId === 'object' && invoice.customerId !== null ? invoice.customerId.name : 'Walk-in'}
                          </p>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
                          invoice.status === 'paid' ? 'bg-success/10 text-success border-success/20' :
                          invoice.status === 'pending' ? 'bg-warning/10 text-warning border-warning/20' :
                          'bg-surface-hover text-text-muted border-border'
                        }`}>
                          {invoice.status}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};

export default SearchInput;
