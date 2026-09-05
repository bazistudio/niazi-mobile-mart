import React from 'react';
import { Route } from 'react-router-dom';
import { ShopAdminDashboard } from '@/features/dashboard/components/shop-admin/ShopAdminDashboard';
import { POSPage } from '@/pages/dashboard/shop-admin/POSPage';
import { ProductsPage } from '@/pages/dashboard/shop-admin/ProductsPage';
import { InventoryWorkspaceLayout } from '@/components/inventory/InventoryWorkspaceLayout';
import { InventoryProductsPage } from '@/pages/dashboard/shop-admin/inventory/InventoryProductsPage';
import { InventoryStockPage } from '@/pages/dashboard/shop-admin/inventory/InventoryStockPage';
import { InventoryImportPage } from '@/pages/dashboard/shop-admin/inventory/InventoryImportPage';
import { StockPage } from '@/pages/dashboard/shop-admin/StockPage';
import { ImportPage } from '@/pages/dashboard/shop-admin/ImportPage';

export const shopAdminCoreRoutes = (
  <>
    <Route index element={<ShopAdminDashboard />} />
    <Route path="pos" element={<POSPage />} />
    <Route path="products" element={<ProductsPage />} />
    
    {/* Inventory Workspace with Nested Tabs */}
    <Route path="inventory" element={<InventoryWorkspaceLayout />}>
      <Route index element={<InventoryProductsPage />} />
      <Route path="stock" element={<InventoryStockPage />} />
      <Route path="import" element={<InventoryImportPage />} />
    </Route>

    {/* Direct alias routes */}
    <Route path="stock" element={<StockPage />} />
    <Route path="import" element={<ImportPage />} />
  </>
);
