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
import { SalesPage } from '@/pages/dashboard/shop-admin/SalesPage';
import { HistoryPage } from '@/pages/dashboard/shop-admin/HistoryPage';
import { CustomersPage } from '@/pages/dashboard/shop-admin/CustomersPage';
import { CustomerDetailPage } from '@/pages/dashboard/shop-admin/CustomerDetailPage';
import { SuppliersPage } from '@/pages/dashboard/shop-admin/SuppliersPage';
import { SupplierDetailPage } from '@/pages/dashboard/shop-admin/SupplierDetailPage';
import { PartiesPage } from '@/pages/dashboard/shop-admin/PartiesPage';
import { PartyDetailPage } from '@/pages/dashboard/shop-admin/PartyDetailPage';
import { RepairsPage } from '@/pages/dashboard/shop-admin/RepairsPage';
import { RepairDetailPage } from '@/pages/dashboard/shop-admin/RepairDetailPage';
import { ExpensesPage } from '@/pages/dashboard/shop-admin/ExpensesPage';
import { CashManagementPage } from '@/pages/dashboard/shop-admin/CashManagementPage';
import { BusinessLedgerPage } from '@/pages/dashboard/shop-admin/BusinessLedgerPage';
import { KdsPage } from '@/pages/dashboard/shop-admin/KdsPage';
import { MarketingPage } from '@/pages/dashboard/shop-admin/MarketingPage';
import { ProfilePage } from '@/pages/dashboard/shop-admin/ProfilePage';
import { AuditPage } from '@/pages/dashboard/shop-admin/AuditPage';
import { SettingsLayout } from '@/pages/dashboard/shop-admin/settings/SettingsLayout';
import { GeneralSettingsPage } from '@/pages/dashboard/shop-admin/settings/GeneralSettingsPage';
import { AppearancePage } from '@/pages/dashboard/shop-admin/settings/AppearancePage';
import { BackupRestorePage } from '@/pages/dashboard/shop-admin/settings/BackupRestorePage';
import { PrinterPage } from '@/pages/dashboard/shop-admin/settings/PrinterPage';
import { RolesSettingsPage } from '@/pages/dashboard/shop-admin/settings/RolesSettingsPage';
import { WorkforcePage } from '@/pages/dashboard/shop-admin/settings/WorkforcePage';

export const shopAdminCoreRoutes = (
  <>
    {/* Batch 3: Core */}
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

    {/* Batch 4: Sales, History, Customers, Suppliers, Parties */}
    <Route path="sales" element={<SalesPage />} />
    <Route path="history" element={<HistoryPage />} />
    
    <Route path="customers" element={<CustomersPage />} />
    <Route path="customers/:id" element={<CustomerDetailPage />} />

    <Route path="suppliers" element={<SuppliersPage />} />
    <Route path="suppliers/:id" element={<SupplierDetailPage />} />

    <Route path="parties" element={<PartiesPage />} />
    <Route path="parties/:id" element={<PartyDetailPage />} />

    {/* Batch 5: Operations */}
    <Route path="repairs" element={<RepairsPage />} />
    <Route path="repairs/:id" element={<RepairDetailPage />} />
    <Route path="expenses" element={<ExpensesPage />} />
    <Route path="cash" element={<CashManagementPage />} />
    <Route path="cash-management" element={<CashManagementPage />} />
    <Route path="business-ledger" element={<BusinessLedgerPage />} />
    <Route path="kds" element={<KdsPage />} />
    <Route path="marketing" element={<MarketingPage />} />

    {/* Batch 6: Settings, Profile & Audit */}
    <Route path="profile" element={<ProfilePage />} />
    <Route path="audit" element={<AuditPage />} />

    <Route path="settings" element={<SettingsLayout />}>
      <Route index element={<GeneralSettingsPage />} />
      <Route path="appearance" element={<AppearancePage />} />
      <Route path="backup" element={<BackupRestorePage />} />
      <Route path="printer" element={<PrinterPage />} />
      <Route path="roles" element={<RolesSettingsPage />} />
      <Route path="users" element={<WorkforcePage />} />
    </Route>
  </>
);



