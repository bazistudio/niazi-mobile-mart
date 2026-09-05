'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return new QueryClient({
      defaultOptions: {
        queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false },
      },
    })
  } else {
    // Browser: make a new query client if we don't already have one
    if (!browserQueryClient) browserQueryClient = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false },
      },
    })
    return browserQueryClient
  }
}

export default function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
