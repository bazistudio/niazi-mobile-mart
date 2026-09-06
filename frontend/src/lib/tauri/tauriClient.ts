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

export interface SanitizedUser {
  id: string;
  name: string;
  username: string;
  role: StaffRole;
  is_active: boolean;
  has_pin: boolean;
  access_profile: StaffAccessProfile;
  created_at: string;
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

  // ── Staff Access Management (Admin) ───────────────────────────────────────
  async adminListUsers(): Promise<SanitizedUser[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SanitizedUser[]>('admin_list_users');
    }
    return [];
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
};

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
