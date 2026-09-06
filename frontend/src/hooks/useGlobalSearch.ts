import { useState, useEffect } from 'react';

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

  // Search logic (offline placeholder — zero dead HTTP transport)
  useEffect(() => {
    if (!isFocused || !debouncedQuery || debouncedQuery.trim().length < 2) {
      setResults({ products: [], customers: [], suppliers: [], invoices: [] });
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(false);
    setError(null);
    setResults({ products: [], customers: [], suppliers: [], invoices: [] });
  }, [debouncedQuery, debouncedType, isFocused]);

  return { results, isLoading, error, debouncedQuery, debouncedType };
}
