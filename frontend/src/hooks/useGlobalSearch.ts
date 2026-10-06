import { useState, useEffect } from 'react';
import { httpFetch } from '@/lib/tauri/tauriClient';

export interface GlobalSearchResultItem {
  id: string;
  _id?: string;
  type: 'product' | 'customer' | 'supplier' | 'invoice';
  name: string;
  sku?: string;
  barcode?: string;
  price?: number;
  salePrice?: number;
  purchasePrice?: number;
  costPrice?: number;
  quantity?: number;
  stock?: number;
  mobile?: string;
  accountCode?: string;
  companyName?: string;
  phone?: string;
  invoiceNumber?: string;
  totalAmount?: number;
  match_type?: string;
  matched_value?: string;
}

export interface GlobalSearchResult {
  products: GlobalSearchResultItem[];
  customers: GlobalSearchResultItem[];
  suppliers: GlobalSearchResultItem[];
  invoices: GlobalSearchResultItem[];
}

export function useGlobalSearch(query: string, type: string = 'quick', isFocused: boolean = true, delay: number = 300) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [debouncedType, setDebouncedType] = useState(type);
  const [results, setResults] = useState<GlobalSearchResult>({ products: [], customers: [], suppliers: [], invoices: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce logic
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
      setDebouncedType(type);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [query, type, delay]);

  // Live HTTP search logic
  useEffect(() => {
    let isCancelled = false;

    if (!isFocused || !debouncedQuery || debouncedQuery.trim().length < 1) {
      setResults({ products: [], customers: [], suppliers: [], invoices: [] });
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const url = `/api/v1/search?q=${encodeURIComponent(debouncedQuery.trim())}&category=${encodeURIComponent(debouncedType)}`;
    httpFetch<GlobalSearchResult>(url)
      .then((data) => {
        if (!isCancelled) {
          setResults({
            products: data?.products || [],
            customers: data?.customers || [],
            suppliers: data?.suppliers || [],
            invoices: data?.invoices || [],
          });
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.warn('[useGlobalSearch] HTTP Search Failed:', err);
          setError(err?.message || 'Search failed');
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [debouncedQuery, debouncedType, isFocused]);

  return { results, isLoading, error, debouncedQuery, debouncedType };
}
