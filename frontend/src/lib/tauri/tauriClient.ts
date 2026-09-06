/**
 * Tauri IPC Client for Niazi Mobile Mart
 * Provides graceful fallback in browser mode and native IPC in Tauri mode.
 */

export interface HealthResponse {
  status: string;
  app_name: string;
  version: string;
  engine: string;
  timestamp_ms: number;
}

export type StaffRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';

export interface StaffOperationalLimits {
  max_discount_percent: number;
  can_price_override: boolean;
  can_refund: boolean;
  can_void_sale: boolean;
  can_view_profit: boolean;
}

export interface StaffAccessProfile {
  allowed_pages: string[];
  allowed_actions: string[];
  limits: StaffOperationalLimits;
}

export type UserStatus = 'active' | 'disabled' | 'pending' | 'rejected';

export interface SanitizedUser {
  id: string;
  name: string;
  username: string;
  role: StaffRole;
  status: UserStatus;
  is_active: boolean;
  must_change_password: boolean;
  has_pin: boolean;
  access_profile: StaffAccessProfile;
  created_at: string;
}

export interface BootstrapAdminPayload {
  name: string;
  username: string;
  password: string;
}

export interface BootstrapAdminResponse {
  user: SanitizedUser;
  recovery_key: string;
}

export interface RegisterStaffPayload {
  name: string;
  username: string;
  password: string;
}

export interface SessionContext {
  is_authenticated: boolean;
  is_locked: boolean;
  user_id: string | null;
  username: string | null;
  role: StaffRole | null;
  login_time_ms: number | null;
  access_profile: StaffAccessProfile | null;
}

export interface AuthResponse {
  user: SanitizedUser;
  session: SessionContext;
}

export const isTauriEnvironment = (): boolean => {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
};

export const tauriClient = {
  isTauri: isTauriEnvironment,

  // ── Baseline Diagnostics ───────────────────────────────────────────────────
  async healthCheck(): Promise<HealthResponse> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<HealthResponse>('health_check');
    }
    return {
      status: 'ok',
      app_name: 'Niazi Mobile Mart (Web Fallback)',
      version: '5.0.3',
      engine: 'Browser Runtime (Development)',
      timestamp_ms: Date.now(),
    };
  },

  async ping(message?: string): Promise<string> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<string>('ping', { message });
    }
    return `pong (web fallback): ${message || 'hello'}`;
  },

  // ── Native Staff Authentication ───────────────────────────────────────────
  async authLogin(username: string, loginKey: string): Promise<AuthResponse> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<AuthResponse>('auth_login', {
        username,
        loginKey,
      });
    }
    throw new Error('Native Tauri environment required for desktop auth');
  },

  async authLogout(): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('auth_logout');
    }
  },

  async authLock(): Promise<SessionContext> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SessionContext>('auth_lock');
    }
    return {
      is_authenticated: true,
      is_locked: true,
      user_id: null,
      username: null,
      role: null,
      login_time_ms: Date.now(),
      access_profile: null,
    };
  },

  async authUnlock(pin: string): Promise<SessionContext> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SessionContext>('auth_unlock', { pin });
    }
    return {
      is_authenticated: true,
      is_locked: false,
      user_id: null,
      username: null,
      role: null,
      login_time_ms: Date.now(),
      access_profile: null,
    };
  },

  async getCurrentSession(): Promise<SessionContext> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SessionContext>('auth_get_current_session');
    }
    return {
      is_authenticated: false,
      is_locked: false,
      user_id: null,
      username: null,
      role: null,
      login_time_ms: null,
      access_profile: null,
    };
  },

  async getCurrentUser(): Promise<SanitizedUser | null> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SanitizedUser | null>('auth_get_current_user');
    }
    return null;
  },

  async checkPermission(page?: string, action?: string): Promise<boolean> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('auth_check_permission', { page, action });
    }
    return true;
  },

  async checkDiscountLimit(requestedDiscount: number): Promise<boolean> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('auth_check_discount_limit', { requestedDiscount });
    }
    return true;
  },

  // ── First-Run Bootstrap & Password Security ───────────────────────────────
  async authCheckBootstrapStatus(): Promise<boolean> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('auth_check_bootstrap_status');
    }
    return false;
  },

  async authBootstrapFirstAdmin(payload: BootstrapAdminPayload): Promise<BootstrapAdminResponse> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<BootstrapAdminResponse>('auth_bootstrap_first_admin', { payload });
    }
    throw new Error('Native Tauri environment required for administrator bootstrap');
  },

  async authChangePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('auth_change_password', { currentPassword, newPassword });
      return;
    }
  },

  async authForcedChangePassword(newPassword: string): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('auth_forced_change_password', { newPassword });
      return;
    }
  },

  async authRegisterStaff(payload: RegisterStaffPayload): Promise<SanitizedUser> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SanitizedUser>('auth_register_staff', { payload });
    }
    throw new Error('Native Tauri environment required for staff registration');
  },

  // ── Staff Access Management (Admin) ───────────────────────────────────────
  async adminListUsers(): Promise<SanitizedUser[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SanitizedUser[]>('admin_list_users');
    }
    return [];
  },

  async adminApproveStaff(userId: string): Promise<SanitizedUser> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SanitizedUser>('admin_approve_staff', { userId });
    }
    throw new Error('Native Tauri environment required');
  },

  async adminRejectStaff(userId: string): Promise<SanitizedUser> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SanitizedUser>('admin_reject_staff', { userId });
    }
    throw new Error('Native Tauri environment required');
  },

  async adminResetStaffPassword(userId: string, temporaryPassword: string): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('admin_reset_staff_password', { userId, temporaryPassword });
      return;
    }
  },

  async adminRecoverAccess(recoveryToken: string, newLoginKey: string): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('admin_recover_access', { recoveryToken, newLoginKey });
      return;
    }
    throw new Error('Native Tauri environment required for emergency recovery');
  },

  async adminCreateUser(payload: {
    name: string;
    username: string;
    login_key: string;
    pin?: string;
    role: StaffRole;
    access_profile?: StaffAccessProfile;
  }): Promise<SanitizedUser> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SanitizedUser>('admin_create_user', { payload });
    }
    throw new Error('Tauri environment required');
  },

  async adminResetCredentials(payload: {
    user_id: string;
    new_login_key?: string;
    new_pin?: string;
  }): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('admin_reset_credentials', { payload });
    }
  },

  // ── Catalog Domain (Phase 7 Domain 1) ─────────────────────────────────────
  async categoryCreate(dto: CreateCategoryDto): Promise<Category> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Category>('category_create', { dto });
    }
    throw new Error('Tauri environment required for desktop category creation');
  },

  async categoryGet(id: string): Promise<Category> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Category>('category_get', { id });
    }
    throw new Error('Tauri environment required');
  },

  async categoryList(): Promise<Category[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Category[]>('category_list');
    }
    return [];
  },

  async categoryUpdate(id: string, dto: UpdateCategoryDto): Promise<Category> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Category>('category_update', { id, dto });
    }
    throw new Error('Tauri environment required');
  },

  async brandCreate(dto: CreateBrandDto): Promise<Brand> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Brand>('brand_create', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async brandGet(id: string): Promise<Brand> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Brand>('brand_get', { id });
    }
    throw new Error('Tauri environment required');
  },

  async brandList(): Promise<Brand[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Brand[]>('brand_list');
    }
    return [];
  },

  async brandUpdate(id: string, dto: UpdateBrandDto): Promise<Brand> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Brand>('brand_update', { id, dto });
    }
    throw new Error('Tauri environment required');
  },

  async unitCreate(dto: CreateUnitDto): Promise<Unit> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Unit>('unit_create', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async unitGet(id: string): Promise<Unit> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Unit>('unit_get', { id });
    }
    throw new Error('Tauri environment required');
  },

  async unitList(): Promise<Unit[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Unit[]>('unit_list');
    }
    return [];
  },

  async unitUpdate(id: string, dto: UpdateUnitDto): Promise<Unit> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Unit>('unit_update', { id, dto });
    }
    throw new Error('Tauri environment required');
  },

  // ── Product Domain (Phase 7 Domain 1) ──────────────────────────────────────
  async productCreate(dto: CreateProductDto): Promise<Product> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Product>('product_create', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async productUpdate(id: string, dto: UpdateProductDto): Promise<Product> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Product>('product_update', { id, dto });
    }
    throw new Error('Tauri environment required');
  },

  async productGet(id: string): Promise<Product> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Product>('product_get', { id });
    }
    throw new Error('Tauri environment required');
  },

  async productGetBySku(sku: string): Promise<Product> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Product>('product_get_by_sku', { sku });
    }
    throw new Error('Tauri environment required');
  },

  async productGetByBarcode(barcode: string): Promise<Product> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Product>('product_get_by_barcode', { barcode });
    }
    throw new Error('Tauri environment required');
  },

  async productList(filter?: ProductFilter): Promise<Product[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Product[]>('product_list', { filter });
    }
    return [];
  },

  async productDeactivate(id: string): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('product_deactivate', { id });
    }
  },

  // ── Inventory Foundation Domain (Phase 7 Domain 2) ─────────────────────────
  async inventoryIncrease(dto: IncreaseStockDto): Promise<number> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<number>('inventory_increase', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async inventoryDecrease(dto: DecreaseStockDto): Promise<number> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<number>('inventory_decrease', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async inventoryAdjust(dto: AdjustStockDto): Promise<number> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<number>('inventory_adjust', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async inventoryTransfer(dto: TransferStockDto): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('inventory_transfer', { dto });
    }
  },

  async inventoryGetStock(productId: string, branchId: string): Promise<number> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<number>('inventory_get_stock', {
        productId,
        branchId,
      });
    }
    return 0;
  },

  async inventoryGetMovements(
    productId?: string,
    branchId?: string,
    limit?: number
  ): Promise<StockMovement[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<StockMovement[]>('inventory_get_movements', {
        productId,
        branchId,
        limit,
      });
    }
    return [];
  },

  async inventoryGetLowStock(branchId: string): Promise<LowStockItemDto[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<LowStockItemDto[]>('inventory_get_low_stock', {
        branchId,
      });
    }
    return [];
  },

  // ── Organization & Branch Operations ──────────────────────────────────────
  async branchList(): Promise<Branch[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Branch[]>('branch_list');
    }
    return [
      {
        id: '00000000-0000-0000-0000-000000000002',
        organization_id: '00000000-0000-0000-0000-000000000001',
        name: 'Main Branch',
        code: 'MAIN',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];
  },

  async branchGetMain(): Promise<Branch | null> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Branch | null>('branch_get_main');
    }
    return {
      id: '00000000-0000-0000-0000-000000000002',
      organization_id: '00000000-0000-0000-0000-000000000001',
      name: 'Main Branch',
      code: 'MAIN',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
  },

  async organizationGetDashboardStats(): Promise<OrganizationDashboardStats> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<OrganizationDashboardStats>('organization_get_dashboard_stats');
    }
    return {
      product_count: 0,
      category_count: 0,
      active_staff_count: 1,
      low_stock_count: 0,
      active_branch_count: 1,
    };
  },

  // ── Customer & Ledger Domain (Phase 15) ──────────────────────────────────
  async customerCreate(dto: CreateCustomerDto): Promise<Customer> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Customer>('customer_create', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async customerUpdate(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Customer>('customer_update', { id, dto });
    }
    throw new Error('Tauri environment required');
  },

  async customerGetById(id: string): Promise<Customer> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Customer>('customer_get_by_id', { id });
    }
    throw new Error('Tauri environment required');
  },

  async customerGetDetail(id: string): Promise<CustomerDetailDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CustomerDetailDto>('customer_get_detail', { id });
    }
    throw new Error('Tauri environment required');
  },

  async customerList(filter?: CustomerFilter): Promise<CustomerSummaryDto[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CustomerSummaryDto[]>('customer_list', { filter });
    }
    return [];
  },

  async customerSearch(query: string): Promise<CustomerSummaryDto[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CustomerSummaryDto[]>('customer_search', { query });
    }
    return [];
  },

  async customerGetLedger(
    customerId: string,
    limit?: number,
    offset?: number
  ): Promise<CustomerLedgerEntry[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CustomerLedgerEntry[]>('customer_get_ledger', {
        customerId,
        limit,
        offset,
      });
    }
    return [];
  },

  async customerGetStatement(customerId: string): Promise<CustomerStatementDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CustomerStatementDto>('customer_get_statement', {
        customerId,
      });
    }
    throw new Error('Tauri environment required');
  },

  async customerGetBalance(customerId: string): Promise<number> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<number>('customer_get_balance', { customerId });
    }
    return 0;
  },

  async customerRecordPayment(
    dto: RecordCustomerPaymentDto
  ): Promise<CustomerPaymentResultDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CustomerPaymentResultDto>('customer_record_payment', {
        dto,
      });
    }
    throw new Error('Tauri environment required');
  },

  async customerDeactivate(id: string): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('customer_deactivate', { id });
    }
  },

  // ── Sales & Checkout Domain (Phase 15) ────────────────────────────────────
  async saleComplete(dto: CompleteSaleDto): Promise<SaleResultDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SaleResultDto>('sale_complete', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async saleGetById(id: string): Promise<Sale | null> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Sale | null>('sale_get_by_id', { id });
    }
    return null;
  },

  async saleGetByInvoice(invoiceNumber: string): Promise<Sale | null> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Sale | null>('sale_get_by_invoice', { invoiceNumber });
    }
    return null;
  },

  async saleList(filter?: SaleFilterDto): Promise<Sale[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Sale[]>('sale_list', { filter });
    }
    return [];
  },

  async saleGetLines(saleId: string): Promise<SaleLine[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SaleLine[]>('sale_get_lines', { saleId });
    }
    return [];
  },

  async saleGetPayments(saleId: string): Promise<SalePayment[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SalePayment[]>('sale_get_payments', { saleId });
    }
    return [];
  },

  // ── Suppliers & Payables Domain (Phase 16) ──────────────────────────────────
  async supplierCreate(dto: CreateSupplierDto): Promise<Supplier> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Supplier>('supplier_create', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async supplierUpdate(id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Supplier>('supplier_update', { id, dto });
    }
    throw new Error('Tauri environment required');
  },

  async supplierGetById(id: string): Promise<Supplier | null> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Supplier | null>('supplier_get_by_id', { id });
    }
    return null;
  },

  async supplierGetDetail(id: string): Promise<SupplierDetailDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SupplierDetailDto>('supplier_get_detail', { id });
    }
    throw new Error('Tauri environment required');
  },

  async supplierList(filter?: SupplierFilter): Promise<SupplierSummaryDto[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SupplierSummaryDto[]>('supplier_list', { filter });
    }
    return [];
  },

  async supplierSearch(query: string): Promise<SupplierSummaryDto[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SupplierSummaryDto[]>('supplier_search', { query });
    }
    return [];
  },

  async supplierGetLedger(
    supplierId: string,
    limit?: number,
    offset?: number
  ): Promise<SupplierLedgerEntry[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SupplierLedgerEntry[]>('supplier_get_ledger', {
        supplierId,
        limit,
        offset,
      });
    }
    return [];
  },

  async supplierGetStatement(supplierId: string): Promise<SupplierStatementDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SupplierStatementDto>('supplier_get_statement', {
        supplierId,
      });
    }
    throw new Error('Tauri environment required');
  },

  async supplierGetBalance(supplierId: string): Promise<number> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<number>('supplier_get_balance', { supplierId });
    }
    return 0;
  },

  async supplierRecordPayment(
    dto: RecordSupplierPaymentDto
  ): Promise<SupplierPaymentResultDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SupplierPaymentResultDto>('supplier_record_payment', {
        dto,
      });
    }
    throw new Error('Tauri environment required');
  },

  async supplierDeactivate(id: string): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('supplier_deactivate', { id });
    }
  },

  // ── Purchasing Domain (Phase 16) ──────────────────────────────────────────
  async purchaseComplete(dto: CompletePurchaseDto): Promise<PurchaseResultDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<PurchaseResultDto>('purchase_complete', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async purchaseGetById(id: string): Promise<Purchase | null> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Purchase | null>('purchase_get_by_id', { id });
    }
    return null;
  },

  async purchaseGetByNumber(purchaseNumber: string): Promise<Purchase | null> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Purchase | null>('purchase_get_by_number', {
        purchaseNumber,
      });
    }
    return null;
  },

  async purchaseList(filter?: PurchaseFilterDto): Promise<Purchase[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Purchase[]>('purchase_list', { filter });
    }
    return [];
  },

  async purchaseGetLines(purchaseId: string): Promise<PurchaseLine[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<PurchaseLine[]>('purchase_get_lines', { purchaseId });
    }
    return [];
  },

  // ── Expense Domain (Phase 17) ───────────────────────────────────────────────
  async expenseCategoryCreate(dto: CreateExpenseCategoryDto): Promise<ExpenseCategory> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ExpenseCategory>('expense_category_create', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async expenseCategoryUpdate(id: string, dto: UpdateExpenseCategoryDto): Promise<ExpenseCategory> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ExpenseCategory>('expense_category_update', { id, dto });
    }
    throw new Error('Tauri environment required');
  },

  async expenseCategoryList(activeOnly?: boolean): Promise<ExpenseCategory[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ExpenseCategory[]>('expense_category_list', { activeOnly });
    }
    return [];
  },

  async expenseCreate(dto: CreateExpenseDto): Promise<Expense> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Expense>('expense_create', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async expenseGetById(id: string): Promise<Expense | null> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Expense | null>('expense_get_by_id', { id });
    }
    return null;
  },

  async expenseList(filter?: ExpenseFilterDto): Promise<Expense[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Expense[]>('expense_list', { filter });
    }
    return [];
  },

  async expenseCancel(id: string): Promise<Expense> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Expense>('expense_cancel', { id });
    }
    throw new Error('Tauri environment required');
  },

  // ── Cash Management & Daily Closing Domain (Phase 17) ───────────────────────
  async cashSessionOpen(dto: OpenCashSessionDto): Promise<CashSession> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CashSession>('cash_session_open', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async cashSessionGetCurrent(branchId?: string): Promise<CashSession | null> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CashSession | null>('cash_session_get_current', { branchId });
    }
    return null;
  },

  async cashSessionGetById(id: string): Promise<CashSession> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CashSession>('cash_session_get_by_id', { id });
    }
    throw new Error('Tauri environment required');
  },

  async cashSessionClose(dto: CloseCashSessionDto): Promise<CashSession> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CashSession>('cash_session_close', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async cashSessionList(branchId?: string, limit?: number, offset?: number): Promise<CashSession[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CashSession[]>('cash_session_list', { branchId, limit, offset });
    }
    return [];
  },

  async cashAdjustmentCreate(dto: CreateCashAdjustmentDto): Promise<CashMovement> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CashMovement>('cash_adjustment_create', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async cashMovementList(filter?: CashMovementFilterDto): Promise<CashMovement[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CashMovement[]>('cash_movement_list', { filter });
    }
    return [];
  },

  async cashDailySummary(branchId?: string, businessDate?: string): Promise<DailyCashSummaryDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<DailyCashSummaryDto>('cash_daily_summary', { branchId, businessDate });
    }
    throw new Error('Tauri environment required');
  },
};

// ── Type Definitions for Organization & Branch ──────────────────────────────
export interface Branch {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationDashboardStats {
  product_count: number;
  category_count: number;
  active_staff_count: number;
  low_stock_count: number;
  active_branch_count: number;
}

// ── Type Definitions for Catalog & Inventory Foundation ─────────────────────
export interface Category {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCategoryDto {
  name: string;
  code: string;
  description?: string | null;
}

export interface UpdateCategoryDto {
  name?: string | null;
  description?: string | null;
  is_active?: boolean | null;
}

export interface Brand {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateBrandDto {
  name: string;
  code: string;
  description?: string | null;
}

export interface UpdateBrandDto {
  name?: string | null;
  description?: string | null;
  is_active?: boolean | null;
}

export interface Unit {
  id: string;
  name: string;
  symbol: string | null;
  conversion_factor: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUnitDto {
  name: string;
  symbol?: string | null;
  conversion_factor: number;
}

export interface UpdateUnitDto {
  name?: string | null;
  symbol?: string | null;
  conversion_factor?: number | null;
  is_active?: boolean | null;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category_id: string;
  brand_id: string | null;
  unit_id: string | null;
  purchase_price: number; // Stored in whole Pakistani Rupees (1 stored integer = 1 PKR)
  sale_price: number;     // Stored in whole Pakistani Rupees (1 stored integer = 1 PKR)
  low_stock_threshold: number;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProductDto {
  name: string;
  sku: string;
  barcode?: string | null;
  category_id: string;
  brand_id?: string | null;
  unit_id?: string | null;
  purchase_price: number;
  sale_price: number;
  low_stock_threshold?: number | null;
  description?: string | null;
  initial_branch_id?: string | null;
  initial_quantity?: number | null;
}

export interface UpdateProductDto {
  name?: string | null;
  sku?: string | null;
  barcode?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  unit_id?: string | null;
  purchase_price?: number | null;
  sale_price?: number | null;
  low_stock_threshold?: number | null;
  is_active?: boolean | null;
  description?: string | null;
}

export interface ProductFilter {
  category_id?: string | null;
  brand_id?: string | null;
  search?: string | null;
  is_active?: boolean | null;
  limit?: number | null;
  offset?: number | null;
}

export type StockMovementType = 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER_IN' | 'TRANSFER_OUT';

export interface StockMovement {
  id: string;
  product_id: string;
  branch_id: string;
  movement_type: StockMovementType;
  quantity: number;
  previous_stock: number;
  resulting_stock: number;
  reason: string | null;
  performed_by: string | null;
  reference_id: string | null;
  created_at: string;
}

export interface IncreaseStockDto {
  product_id: string;
  branch_id: string;
  quantity: number;
  reason?: string | null;
  reference_id?: string | null;
}

export interface DecreaseStockDto {
  product_id: string;
  branch_id: string;
  quantity: number;
  reason?: string | null;
  reference_id?: string | null;
}

export interface AdjustStockDto {
  product_id: string;
  branch_id: string;
  target_quantity: number;
  reason?: string | null;
  reference_id?: string | null;
}

export interface TransferStockDto {
  product_id: string;
  from_branch_id: string;
  to_branch_id: string;
  quantity: number;
  reason?: string | null;
  reference_id?: string | null;
}

export interface LowStockItemDto {
  product_id: string;
  product_name: string;
  sku: string;
  branch_id: string;
  branch_name: string;
  current_quantity: number;
  low_stock_threshold: number;
}

// ── Type Definitions for Customer & Customer Ledger (Phase 15) ──────────────
export interface Customer {
  id: string;
  customer_code: string;
  name: string;
  phone: string;
  alternate_phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  credit_limit: number; // Stored in whole PKR, 0 = unlimited credit
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerSummaryDto {
  id: string;
  customer_code: string;
  name: string;
  phone: string;
  credit_limit: number;
  outstanding_balance: number; // In whole PKR
  is_active: boolean;
  created_at: string;
}

export interface CustomerDetailDto {
  customer: Customer;
  outstanding_balance: number;
  total_sales_count: number;
  total_sales_amount: number;
  last_transaction_date: string | null;
}

export interface CreateCustomerDto {
  name: string;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  credit_limit?: number | null;
}

export interface UpdateCustomerDto {
  name?: string | null;
  phone?: string | null;
  alternate_phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  credit_limit?: number | null;
  is_active?: boolean | null;
}

export interface CustomerFilter {
  search?: string | null;
  is_active?: boolean | null;
  limit?: number | null;
  offset?: number | null;
}

export type CustomerLedgerEntryType = 'SALE' | 'PAYMENT' | 'ADJUSTMENT';

export interface CustomerLedgerEntry {
  id: string;
  customer_id: string;
  reference_id: string | null;
  reference_number: string | null;
  entry_type: CustomerLedgerEntryType;
  debit: number;
  credit: number;
  balance_after: number;
  description: string;
  performed_by: string | null;
  created_at: string;
}

export interface CustomerStatementRowDto {
  id: string;
  date: string;
  reference_number: string | null;
  description: string;
  entry_type: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface CustomerStatementDto {
  customer_id: string;
  customer_name: string;
  customer_code: string;
  phone: string;
  credit_limit: number;
  current_balance: number;
  entries: CustomerStatementRowDto[];
}

export interface RecordCustomerPaymentDto {
  customer_id: string;
  amount: number;
  payment_method: string;
  reference_number?: string | null;
  notes?: string | null;
}

export interface AllocatedSaleDto {
  sale_id: string;
  invoice_number: string;
  amount_allocated: number;
  previous_paid: number;
  new_paid: number;
  total_amount: number;
  payment_status: string;
}

export interface CustomerPaymentResultDto {
  payment_id: string;
  receipt_number: string;
  customer_id: string;
  amount_paid: number;
  previous_balance: number;
  new_balance: number;
  allocated_sales: AllocatedSaleDto[];
}

// ── Type Definitions for Sales & Checkout (Phase 15) ────────────────────────
export type PaymentStatus = 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
export type SaleStatus = 'COMPLETED' | 'VOIDED' | 'REFUNDED';

export interface Sale {
  id: string;
  invoice_number: string;
  branch_id: string;
  customer_id: string | null;
  customer_name_snapshot: string | null;
  subtotal: number;
  discount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  change_amount: number;
  payment_status: PaymentStatus;
  sale_status: SaleStatus;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaleLine {
  id: string;
  sale_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  unit_price: number;
  cost_price_snapshot: number;
  quantity: number;
  discount: number;
  line_total: number;
  created_at: string;
}

export interface SalePayment {
  id: string;
  sale_id: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

export interface SaleItemDto {
  product_id: string;
  quantity: number;
  discount?: number | null;
}

export interface CompleteSaleDto {
  branch_id?: string | null;
  customer_id?: string | null;
  items: SaleItemDto[];
  discount?: number | null;
  paid_amount?: number | null;
  payment_method?: string | null;
  notes?: string | null;
}

export interface SaleResultDto {
  sale: Sale;
  lines: SaleLine[];
  payments: SalePayment[];
  credit_amount: number;
  customer_balance_after: number | null;
}

export interface SaleFilterDto {
  customer_id?: string | null;
  branch_id?: string | null;
  payment_status?: string | null;
  sale_status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  limit?: number | null;
  offset?: number | null;
}

// ── Type Definitions for Suppliers & Purchasing (Phase 16) ───────────────────
export interface Supplier {
  id: string;
  supplier_code: string;
  name: string;
  phone: string;
  alternate_phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  credit_limit: number; // 0 = unlimited credit
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierSummaryDto {
  id: string;
  supplier_code: string;
  name: string;
  phone: string;
  credit_limit: number;
  outstanding_balance: number; // In whole PKR
  is_active: boolean;
}

export interface SupplierDetailDto {
  supplier: Supplier;
  outstanding_balance: number;
  recent_purchases: Purchase[];
  recent_payments: SupplierLedgerEntry[];
}

export interface CreateSupplierDto {
  name: string;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  credit_limit?: number | null;
}

export interface UpdateSupplierDto {
  name?: string | null;
  phone?: string | null;
  alternate_phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  credit_limit?: number | null;
  is_active?: boolean | null;
}

export interface SupplierFilter {
  search?: string | null;
  is_active?: boolean | null;
  limit?: number | null;
  offset?: number | null;
}

export type SupplierLedgerEntryType = 'PURCHASE' | 'PAYMENT' | 'ADJUSTMENT';

export interface SupplierLedgerEntry {
  id: string;
  supplier_id: string;
  reference_id: string | null;
  reference_number: string | null;
  entry_type: SupplierLedgerEntryType;
  debit: number;
  credit: number;
  balance_after: number;
  description: string;
  performed_by: string | null;
  created_at: string;
}

export interface SupplierStatementRowDto {
  date: string;
  reference_number: string | null;
  entry_type: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface SupplierStatementDto {
  supplier: Supplier;
  start_date: string | null;
  end_date: string | null;
  opening_balance: number;
  closing_balance: number;
  total_debit: number;
  total_credit: number;
  rows: SupplierStatementRowDto[];
}

export interface RecordSupplierPaymentDto {
  supplier_id: string;
  amount: number;
  payment_method: string;
  reference_number?: string | null;
  notes?: string | null;
}

export interface AllocatedPurchaseDto {
  purchase_id: string;
  purchase_number: string;
  amount_allocated: number;
  previous_paid: number;
  new_paid: number;
  total_amount: number;
  payment_status: string;
}

export interface SupplierPaymentResultDto {
  payment_id: string;
  receipt_number: string;
  supplier_id: string;
  amount_paid: number;
  previous_balance: number;
  new_balance: number;
  allocated_purchases: AllocatedPurchaseDto[];
}

export type PurchasePaymentStatus = 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
export type PurchaseStatus = 'COMPLETED' | 'CANCELLED';

export interface Purchase {
  id: string;
  purchase_number: string;
  supplier_id: string;
  branch_id: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  credit_amount: number;
  payment_status: PurchasePaymentStatus;
  status: PurchaseStatus;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseLine {
  id: string;
  purchase_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  quantity: number;
  unit_cost: number;
  discount: number;
  line_total: number;
  created_at: string;
}

export interface PurchaseItemDto {
  product_id: string;
  quantity: number;
  unit_cost?: number | null;
  discount?: number | null;
}

export interface CompletePurchaseDto {
  branch_id?: string | null;
  supplier_id: string;
  items: PurchaseItemDto[];
  discount?: number | null;
  paid_amount?: number | null;
  payment_method?: string | null;
  notes?: string | null;
}

export interface PurchaseResultDto {
  purchase: Purchase;
  lines: PurchaseLine[];
  credit_amount: number;
  supplier_balance_after: number;
}

export interface PurchaseFilterDto {
  supplier_id?: string | null;
  branch_id?: string | null;
  payment_status?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  limit?: number | null;
  offset?: number | null;
}

// ── Type Definitions for Expenses & Cash Management (Phase 17) ────────────────
export interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseCategoryDto {
  name: string;
  description?: string | null;
}

export interface UpdateExpenseCategoryDto {
  name?: string | null;
  description?: string | null;
  is_active?: boolean | null;
}

export type ExpenseStatus = 'COMPLETED' | 'CANCELLED';

export interface Expense {
  id: string;
  expense_number: string;
  category_id: string;
  branch_id: string;
  amount: number;
  payment_method: string;
  description: string | null;
  notes: string | null;
  expense_date: string;
  status: ExpenseStatus;
  performed_by: string | null;
  created_at: string;
  updated_at: string;
  category_name?: string | null;
}

export interface CreateExpenseDto {
  category_id: string;
  branch_id?: string | null;
  amount: number;
  payment_method?: string | null;
  description?: string | null;
  notes?: string | null;
  expense_date?: string | null;
}

export interface ExpenseFilterDto {
  branch_id?: string | null;
  category_id?: string | null;
  status?: string | null;
  payment_method?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export type CashSessionStatus = 'OPEN' | 'CLOSED';

export interface CashSession {
  id: string;
  branch_id: string;
  business_date: string;
  opening_cash: number;
  expected_closing_cash: number | null;
  actual_closing_cash: number | null;
  cash_variance: number | null;
  status: CashSessionStatus;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  closed_by: string | null;
  notes: string | null;
  branch_name?: string | null;
}

export interface OpenCashSessionDto {
  branch_id?: string | null;
  business_date?: string | null;
  opening_cash: number;
  notes?: string | null;
}

export interface CloseCashSessionDto {
  session_id: string;
  actual_closing_cash: number;
  notes?: string | null;
}

export type CashMovementType =
  | 'SALE_PAYMENT'
  | 'CUSTOMER_PAYMENT'
  | 'SUPPLIER_PAYMENT'
  | 'EXPENSE'
  | 'CASH_ADJUSTMENT';

export type CashMovementDirection = 'IN' | 'OUT';

export interface CashMovement {
  id: string;
  branch_id: string;
  session_id: string | null;
  movement_type: CashMovementType;
  direction: CashMovementDirection;
  amount: number;
  reference_id: string | null;
  reference_number: string | null;
  payment_method: string;
  description: string | null;
  performed_by: string | null;
  created_at: string;
}

export interface CreateCashAdjustmentDto {
  branch_id?: string | null;
  direction: CashMovementDirection;
  amount: number;
  reason: string;
}

export interface CashMovementFilterDto {
  branch_id?: string | null;
  session_id?: string | null;
  movement_type?: string | null;
  direction?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export interface DailyCashSummaryDto {
  session_id: string | null;
  session_status: string;
  business_date: string;
  opening_cash: number;
  cash_sales: number;
  customer_payments: number;
  supplier_payments: number;
  cash_expenses: number;
  cash_in_adjustments: number;
  cash_out_adjustments: number;
  total_cash_in: number;
  total_cash_out: number;
  expected_closing_cash: number;
  actual_closing_cash: number | null;
  cash_variance: number | null;
}
