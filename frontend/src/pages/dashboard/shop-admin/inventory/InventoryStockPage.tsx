import React from 'react';
import { InventoryProductsPage } from './InventoryProductsPage';

export function InventoryStockPage() {
  return (
    <div className="h-full overflow-hidden">
      <InventoryProductsPage mode="restock" />
    </div>
  );
}

export default InventoryStockPage;
