import React from 'react';
import { StockWidget } from '@/features/inventory/stock/StockWidget';

export function InventoryStockPage() {
  return (
    <div className="p-4 md:p-6 overflow-y-auto h-full">
      <StockWidget />
    </div>
  );
}

export default InventoryStockPage;
