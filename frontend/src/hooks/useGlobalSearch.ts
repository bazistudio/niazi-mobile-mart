import { useState, useEffect } from 'react';
import { httpFetch } from '@/lib/tauri/tauriClient';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';

export interface StockLocationItem {
  branchId: string;
  branchName: string;
  quantity: number;
}

export interface GlobalSearchResultItem {
  id: string;
  _id?: string;
  type: 'product';
  name: string;
  sku?: string;
  barcode?: string;
  price?: number;
  salePrice?: number;
  purchasePrice?: number;
  costPrice?: number;
  quantity?: number;
  stock?: number;
  branchStock?: number;
  warehouseStock?: number;
  totalStock?: number;
  brand?: string;
  company?: string;
  quality?: string;
  color?: string;
  type_id?: string;
  typeName?: string;
  compatibleModels?: string[];
  stockLocations: StockLocationItem[];
  match_type?: string;
  matched_value?: string;
  matched_compatible_model?: string;
}

export interface GlobalSearchResult {
  products: GlobalSearchResultItem[];
}

export function useGlobalSearch(query: string, typeId: string = '', isFocused: boolean = true, delay: number = 300) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [debouncedTypeId, setDebouncedTypeId] = useState(typeId);
  const [results, setResults] = useState<GlobalSearchResult>({ products: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeShopId = useOrganizationStore((s) => s.activeShopId || s.activeShop?._id);
  const userBranchId = useAuthStore((s) => s.user?.branch_id || s.user?.branchId);
  const effectiveBranchId = activeShopId || userBranchId || '';

  // Debounce logic
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
      setDebouncedTypeId(typeId);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [query, typeId, delay]);

  // Live HTTP search logic (Triggers from 1st character)
  useEffect(() => {
    let isCancelled = false;

    if (!isFocused || !debouncedQuery || debouncedQuery.trim().length < 1) {
      setResults({ products: [] });
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const branchParam = effectiveBranchId ? `&branch_id=${encodeURIComponent(effectiveBranchId)}` : '';
    const typeParam = debouncedTypeId ? `&type_id=${encodeURIComponent(debouncedTypeId)}` : '';
    const url = `/api/v1/search?q=${encodeURIComponent(debouncedQuery.trim())}${typeParam}${branchParam}`;

    httpFetch<GlobalSearchResult>(url)
      .then((data) => {
        if (!isCancelled) {
          setResults({
            products: data?.products || [],
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
  }, [debouncedQuery, debouncedTypeId, isFocused, effectiveBranchId]);

  return { results, isLoading, error, debouncedQuery, debouncedTypeId };
}
