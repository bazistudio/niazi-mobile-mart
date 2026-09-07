import React from 'react';
import { Route } from 'react-router-dom';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { PERMISSIONS } from '@/constants/permissions';
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
import { ShopAppearanceNoticePage } from '@/pages/dashboard/shop-admin/settings/ShopAppearanceNoticePage';
import { ShopBackupNoticePage } from '@/pages/dashboard/shop-admin/settings/ShopBackupNoticePage';
import { PrinterPage } from '@/pages/dashboard/shop-admin/settings/PrinterPage';
import { RolesSettingsPage } from '@/pages/dashboard/shop-admin/settings/RolesSettingsPage';
import { WorkforcePage } from '@/pages/dashboard/shop-admin/settings/WorkforcePage';

export const shopAdminCoreRoutes = (
  <>
    {/* Base Dashboard Overview — Accessible to all authenticated shop staff */}
    <Route index element={<ShopAdminDashboard />} />
    <Route path="profile" element={<ProfilePage />} />

    {/* Point of Sale & Kitchen Display */}
    <Route element={<PermissionGuard requiredPermission={PERMISSIONS.POS_USE} />}>
      <Route path="pos" element={<POSPage />} />
      <Route path="kds" element={<KdsPage />} />
    </Route>

    {/* Products Catalog */}
    <Route element={<PermissionGuard requiredPermission={PERMISSIONS.PRODUCTS_VIEW} />}>
      <Route path="products" element={<ProductsPage />} />
    </Route>

    {/* Inventory Workspace with Nested Tabs & Direct Alias Routes */}
    <Route element={<PermissionGuard requiredPermission={PERMISSIONS.INVENTORY_VIEW} />}>
      <Route path="inventory" element={<InventoryWorkspaceLayout />}>
        <Route index element={<InventoryProductsPage />} />
        <Route path="stock" element={<InventoryStockPage />} />
        <Route path="import" element={<InventoryImportPage />} />
      </Route>
      <Route path="stock" element={<StockPage />} />
      <Route path="import" element={<ImportPage />} />
    </Route>

    {/* Sales Analytics */}
    <Route element={<PermissionGuard requiredPermission={PERMISSIONS.SALES_VIEW} />}>
      <Route path="sales" element={<SalesPage />} />
    </Route>

    {/* Activity & Operational Reports History */}
    <Route element={<PermissionGuard requiredPermission={PERMISSIONS.REPORTS_VIEW} />}>
      <Route path="history" element={<HistoryPage />} />
      <Route path="marketing" element={<MarketingPage />} />
    </Route>

    {/* Parties, Customers & Suppliers */}
    <Route element={<PermissionGuard requiredPermission={PERMISSIONS.PARTIES_VIEW} />}>
      <Route path="customers" element={<CustomersPage />} />
      <Route path="customers/:id" element={<CustomerDetailPage />} />
      <Route path="suppliers" element={<SuppliersPage />} />
      <Route path="suppliers/:id" element={<SupplierDetailPage />} />
      <Route path="parties" element={<PartiesPage />} />
      <Route path="parties/:id" element={<PartyDetailPage />} />
    </Route>

    {/* Repairs & Services */}
    <Route element={<PermissionGuard requiredPermission={PERMISSIONS.REPAIRS_VIEW} />}>
      <Route path="repairs" element={<RepairsPage />} />
      <Route path="repairs/:id" element={<RepairDetailPage />} />
    </Route>

    {/* Financial Management: Cash, Business Ledger & Expenses */}
    <Route element={<PermissionGuard requiredPermission={PERMISSIONS.FINANCE_VIEW} />}>
      <Route path="cash" element={<CashManagementPage />} />
      <Route path="cash-management" element={<CashManagementPage />} />
      <Route path="business-ledger" element={<BusinessLedgerPage />} />
    </Route>

    <Route element={<PermissionGuard requiredPermission={PERMISSIONS.EXPENSES_VIEW} />}>
      <Route path="expenses" element={<ExpensesPage />} />
    </Route>

    {/* Audit & Compliance Panel — Org Admin & Cross-Shop View */}
    <Route element={<PermissionGuard requiredPermission={PERMISSIONS.SHOPS_VIEW_ALL} />}>
      <Route path="audit" element={<AuditPage />} />
    </Route>

    {/* Settings Hierarchy */}
    <Route element={<PermissionGuard requiredPermission={PERMISSIONS.SETTINGS_VIEW} />}>
      <Route path="settings" element={<SettingsLayout />}>
        <Route index element={<GeneralSettingsPage />} />
        <Route path="appearance" element={<ShopAppearanceNoticePage />} />
        <Route path="backup" element={<ShopBackupNoticePage />} />
        <Route path="printer" element={<PrinterPage />} />
        <Route path="roles" element={<RolesSettingsPage />} />

        {/* High-security Workforce Management: Requires USERS_VIEW and USERS_MANAGE */}
        <Route element={<PermissionGuard requiredPermissions={[PERMISSIONS.USERS_VIEW, PERMISSIONS.USERS_MANAGE]} fallbackPath="/dashboard/shop-admin/settings" />}>
          <Route path="users" element={<WorkforcePage />} />
        </Route>
      </Route>
    </Route>
  </>
);



