'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type StockViewType = 'update' | 'restock' | 'low-stock' | 'damaged' | 'replacement';

interface InventoryFilterState {
  categoryId: string;
  brandId: string;
  companyId: string;
  colorId: string;
  qualityId: string;
  search: string;
  activeStockView: StockViewType;
}

export type InventoryFilterValue = string | StockViewType;

interface InventoryFilterContextType {
  filters: InventoryFilterState;
  updateFilter: (key: keyof InventoryFilterState, value: InventoryFilterValue) => void;
  resetFilters: () => void;
  refreshKey: number;
  refreshMasterData: () => void;
}

const defaultFilters: InventoryFilterState = {
  categoryId: '',
  brandId: '',
  companyId: '',
  colorId: '',
  qualityId: '',
  search: '',
  activeStockView: 'update',
};

const InventoryFilterContext = createContext<InventoryFilterContextType | undefined>(undefined);

export function InventoryFilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<InventoryFilterState>(defaultFilters);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const updateFilter = (key: keyof InventoryFilterState, value: InventoryFilterValue) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    // Note: We might want to preserve the activeStockView when resetting filters
    setFilters(prev => ({ ...defaultFilters, activeStockView: prev.activeStockView }));
  };

  const refreshMasterData = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <InventoryFilterContext.Provider value={{ filters, updateFilter, resetFilters, refreshKey, refreshMasterData }}>
      {children}
    </InventoryFilterContext.Provider>
  );
}

export function useInventoryFilters() {
  const context = useContext(InventoryFilterContext);
  if (context === undefined) {
    throw new Error('useInventoryFilters must be used within an InventoryFilterProvider');
  }
  return context;
}
