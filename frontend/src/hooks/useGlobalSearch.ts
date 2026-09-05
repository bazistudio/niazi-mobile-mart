import { useState, useEffect } from 'react';
import axiosInstance from '@/lib/api/axios';

export interface GlobalSearchResult {
  products: any[];
  customers: any[];
  suppliers: any[];
  invoices: any[];
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

  // Fetch logic
  useEffect(() => {
    const controller = new AbortController();

    const fetchResults = async () => {
      // If not focused or query too short, reset and exit
      if (!isFocused || !debouncedQuery || debouncedQuery.trim().length < 2) {
        setResults({ products: [], customers: [], suppliers: [], invoices: [] });
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await axiosInstance.get<{ success: boolean; data: GlobalSearchResult }>(
          `/api/v1/search?query=${encodeURIComponent(debouncedQuery)}&type=${debouncedType}`, 
          { signal: controller.signal }
        );
        
        if (controller.signal.aborted) return;

        if (response.data.success) {
          setResults(response.data.data);
        } else {
          setError('Failed to fetch search results.');
        }
      } catch (err: any) {
        if (err.name === 'CanceledError' || controller.signal.aborted) {
          return;
        }

        setError(err.response?.data?.message || err.message || 'An error occurred during search.');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    fetchResults();

    return () => {
      controller.abort();
    };
  }, [debouncedQuery, debouncedType, isFocused]);

  return { results, isLoading, error, debouncedQuery, debouncedType };
}
