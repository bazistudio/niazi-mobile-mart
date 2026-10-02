/**
 * Tauri IPC Client for Niazi Mobile Mart
 * Online-only PostgreSQL architecture: all business CRUD goes through httpFetch() → Axum API.
 * Tauri invoke() is used only for native infrastructure: updater, session, auth, health, printing.
 */

export interface HealthResponse {
  status: string;
  app_name: string;
  version: string;
  engine: string;
  timestamp_ms: number;
}

export type StaffRole =
  | 'ADMIN'
  | 'SHOP_ADMIN'
  | 'BRANCH_ADMIN'
  | 'MANAGER'
  | 'ACCOUNTANT'
  | 'SALESMAN'
  | 'CASHIER'
  | 'REPAIR_MECHANIC'
  | 'STAFF'
  | 'PUBLIC_USER';

export interface StaffOperationalLimits {
  max_discount_percent: number;
  can_price_override: boolean;
  can_refund: boolean;
  can_void_sale: boolean;
  can_view_profit: boolean;
}

export interface StaffAccessProfile {
  role_name?: string;
  permissions?: string[];
  allowed_pages?: string[];
  allowed_actions?: string[];
  limits?: StaffOperationalLimits;
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
  branch_id?: string | null;
  created_at: string;
}

export interface BootstrapAdminPayload {
  name: string;
  username: string;
  password: string;
  pin?: string;
}

export interface UpdateCheckResponse {
  available: boolean;
  version: string;
  body?: string | null;
  current_version: string;
}

export interface UpdateProgressPayload {
  downloaded: number;
  total?: number | null;
  percentage?: number | null;
  status: 'downloading' | 'installing' | 'completed' | 'error';
  error?: string | null;
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

import { getAuthToken } from '../auth/core/auth.session';

export const DEFAULT_CENTRAL_API_URL = 'https://niazi-server-860232188829.asia-south1.run.app';

export const isTauriEnvironment = (): boolean => {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
};

export const setCustomApiBaseUrl = (url: string): void => {
  if (typeof window !== 'undefined') {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    localStorage.setItem('niazi_api_url', cleanUrl);
    (window as any).__API_BASE_URL__ = cleanUrl;
  }
};

export const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    if ((window as any).__API_BASE_URL__) {
      return (window as any).__API_BASE_URL__;
    }
    const storedUrl = localStorage.getItem('niazi_api_url');
    if (storedUrl && storedUrl.trim().length > 0) {
      return storedUrl.trim();
    }
  }
  const viteUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (viteUrl && viteUrl.trim().length > 0) {
    return viteUrl.trim();
  }
  return DEFAULT_CENTRAL_API_URL;
};

async function httpFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${getApiBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}`;
    try {
      const errData = await res.json();
      if (errData && errData.message) {
        errorMsg = errData.message;
      }
    } catch {
      // Ignore JSON error
    }
    throw new Error(errorMsg);
  }

  const text = await res.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

export const tauriClient = {
  isTauri: isTauriEnvironment,

  // ── Baseline Diagnostics ───────────────────────────────────────────────────
  async healthCheck(): Promise<HealthResponse> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<HealthResponse>('health_check');
    }
    try {
      const health = await httpFetch<HealthResponse>('/api/health');
      return health;
    } catch {
      return {
        status: 'ok',
        app_name: 'Niazi Mobile Mart (Web Fallback)',
        version: '1.0.1',
        engine: 'Browser Runtime',
        timestamp_ms: Date.now(),
      };
    }
  },

  async ping(message?: string): Promise<string> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<string>('ping', { message });
    }
    return `pong (web fallback): ${message || 'hello'}`;
  },

  // ── Auto-Updater ─────────────────────────────────────────────────────────
  async checkAppUpdate(): Promise<UpdateCheckResponse> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<UpdateCheckResponse>('check_app_update');
    }
    return {
      available: false,
      version: '1.1.3',
      body: 'Web fallback — updater is active only in native desktop app.',
      current_version: '1.1.3',
    };
  },

  async downloadAndInstallUpdate(): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<void>('download_and_install_update');
    }
    throw new Error('Automatic updates are supported in desktop mode only.');
  },

  async relaunchApp(): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<void>('relaunch_app');
    }
    window.location.reload();
  },

  async openExternalUrl(url: string): Promise<void> {
    if (isTauriEnvironment()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke<void>('open_external_url', { url });
        return;
      } catch {
        window.open(url, '_blank');
        return;
      }
    }
    window.open(url, '_blank');
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
    const data = await httpFetch<{ token: string; user: SanitizedUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password: loginKey }),
    });

    if (data.token && typeof window !== 'undefined') {
      localStorage.setItem('niazi_token', data.token);
    }

    return {
      user: data.user,
      session: {
        is_authenticated: true,
        is_locked: false,
        user_id: data.user.id,
        username: data.user.username,
        role: data.user.role,
        login_time_ms: Date.now(),
        access_profile: data.user.access_profile,
      },
    };
  },

  async authSyncSession(token: string): Promise<SessionContext> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SessionContext>('auth_sync_session', { token });
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

  async authLogout(): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('auth_logout');
      return;
    }
    try {
      await httpFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
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
  /**
   * Three-State Central Bootstrap Authority Resolution:
   * - CENTRAL_INITIALIZED: Central PostgreSQL org is initialized. Proceed to Sign In screen.
   * - CENTRAL_NOT_INITIALIZED: Central PostgreSQL org is genuinely uninitialized. Proceed to Initial Admin Setup.
   * - CENTRAL_UNREACHABLE: Central API is unreachable (network error/offline). Display connection alert banner, NEVER redirect to Setup.
   */
  async getBootstrapStatusState(): Promise<'CENTRAL_INITIALIZED' | 'CENTRAL_NOT_INITIALIZED' | 'CENTRAL_UNREACHABLE'> {
    const apiBaseUrl = getApiBaseUrl();

    // CENTRAL API IS AUTHORITATIVE FOR PRODUCTION BOOTSTRAP & AUTH
    if (apiBaseUrl) {
      try {
        const res = await httpFetch<{ initialized: boolean; is_bootstrap_required: boolean }>('/api/v1/auth/bootstrap-status');
        if (res.is_bootstrap_required || !res.initialized) {
          return 'CENTRAL_NOT_INITIALIZED';
        }
        return 'CENTRAL_INITIALIZED';
      } catch (err) {
        console.warn('[AUTH_BOOTSTRAP] Central API unreachable during bootstrap check:', err);
        return 'CENTRAL_UNREACHABLE';
      }
    }

    return 'CENTRAL_UNREACHABLE';
  },

  async authCheckBootstrapStatus(): Promise<boolean> {
    const state = await this.getBootstrapStatusState();
    return state === 'CENTRAL_NOT_INITIALIZED';
  },

  async authBootstrapFirstAdmin(payload: BootstrapAdminPayload): Promise<BootstrapAdminResponse> {
    if (getApiBaseUrl()) {
      return await httpFetch<BootstrapAdminResponse>('/api/v1/auth/bootstrap-first-admin', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<BootstrapAdminResponse>('auth_bootstrap_first_admin', { payload });
    }
    throw new Error('API Base URL or Native Tauri environment required for administrator bootstrap');
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
    return await httpFetch<SanitizedUser[]>('/api/v1/users');
  },

  async adminApproveStaff(userId: string): Promise<SanitizedUser> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SanitizedUser>('admin_approve_staff', { userId });
    }
    return await httpFetch<SanitizedUser>(`/api/v1/users/${userId}/approve`, { method: 'POST' });
  },

  async adminRejectStaff(userId: string): Promise<SanitizedUser> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SanitizedUser>('admin_reject_staff', { userId });
    }
    return await httpFetch<SanitizedUser>(`/api/v1/users/${userId}/reject`, { method: 'POST' });
  },

  async adminResetStaffPassword(userId: string, temporaryPassword: string): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('admin_reset_staff_password', { userId, temporaryPassword });
      return;
    }
    await httpFetch<void>(`/api/v1/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ temporary_password: temporaryPassword }),
    });
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
    login_key?: string;
    pin?: string;
    role: StaffRole;
    branch_id?: string | null;
    access_profile?: StaffAccessProfile;
  }): Promise<SanitizedUser> {
    return await httpFetch<SanitizedUser>('/api/v1/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async adminUpdateUser(payload: {
    user_id: string;
    name?: string;
    role?: StaffRole;
    status?: 'ACTIVE' | 'DISABLED' | 'PENDING' | 'REJECTED';
    is_active?: boolean;
    branch_id?: string | null;
    access_profile?: StaffAccessProfile;
  }): Promise<SanitizedUser> {
    const { user_id, ...rest } = payload;
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SanitizedUser>('admin_update_user', { payload });
    }
    return await httpFetch<SanitizedUser>(`/api/v1/users/${user_id}`, {
      method: 'PUT',
      body: JSON.stringify(rest),
    });
  },

  async adminResetCredentials(payload: {
    user_id: string;
    new_login_key?: string;
    new_pin?: string;
  }): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('admin_reset_credentials', { payload });
      return;
    }
    const { user_id, ...rest } = payload;
    await httpFetch<void>(`/api/v1/users/${user_id}/reset-credentials`, {
      method: 'POST',
      body: JSON.stringify(rest),
    });
  },

  async adminVerifyPassword(password: string): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('admin_verify_password', { password });
      return;
    }
    await httpFetch<void>('/api/v1/auth/verify-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  async adminDeleteUser(userId: string): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('admin_delete_user', { userId });
      return;
    }
    await httpFetch<void>(`/api/v1/users/${userId}`, { method: 'DELETE' });
  },

  // ── Catalog Domain ────────────────────────────────────────────────────────
  async categoryCreate(dto: CreateCategoryDto): Promise<Category> {    return await httpFetch<Category>('/api/v1/catalog/categories', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async categoryGet(id: string): Promise<Category> {    return await httpFetch<Category>(`/api/v1/catalog/categories/${id}`);
  },

  async categoryList(): Promise<Category[]> {    return await httpFetch<Category[]>('/api/v1/catalog/categories');
  },

  async categoryUpdate(id: string, dto: UpdateCategoryDto): Promise<Category> {    return await httpFetch<Category>(`/api/v1/catalog/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  async brandCreate(dto: CreateBrandDto): Promise<Brand> {    return await httpFetch<Brand>('/api/v1/catalog/brands', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async brandGet(id: string): Promise<Brand> {    return await httpFetch<Brand>(`/api/v1/catalog/brands/${id}`);
  },

  async brandList(): Promise<Brand[]> {    return await httpFetch<Brand[]>('/api/v1/catalog/brands');
  },

  async brandUpdate(id: string, dto: UpdateBrandDto): Promise<Brand> {    return await httpFetch<Brand>(`/api/v1/catalog/brands/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  async unitCreate(dto: CreateUnitDto): Promise<Unit> {    return await httpFetch<Unit>('/api/v1/catalog/units', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async unitGet(id: string): Promise<Unit> {    return await httpFetch<Unit>(`/api/v1/catalog/units/${id}`);
  },

  async unitList(): Promise<Unit[]> {    return await httpFetch<Unit[]>('/api/v1/catalog/units');
  },

  async unitUpdate(id: string, dto: UpdateUnitDto): Promise<Unit> {    return await httpFetch<Unit>(`/api/v1/catalog/units/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  async companyCreate(dto: { name: string; code?: string; description?: string | null }): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {    return await httpFetch('/api/v1/catalog/companies', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async companyGet(id: string): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {    return await httpFetch(`/api/v1/catalog/companies/${id}`);
  },

  async companyList(): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }[]> {    return await httpFetch('/api/v1/catalog/companies');
  },

  async companyUpdate(id: string, dto: { name?: string; description?: string | null; is_active?: boolean }): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {    return await httpFetch(`/api/v1/catalog/companies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  async qualityCreate(dto: { name: string; code?: string; description?: string | null }): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {    return await httpFetch('/api/v1/catalog/qualities', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async qualityGet(id: string): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {    return await httpFetch(`/api/v1/catalog/qualities/${id}`);
  },

  async qualityList(): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }[]> {    return await httpFetch('/api/v1/catalog/qualities');
  },

  async qualityUpdate(id: string, dto: { name?: string; description?: string | null; is_active?: boolean }): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {    return await httpFetch(`/api/v1/catalog/qualities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  async colorCreate(dto: { name: string; code?: string; description?: string | null }): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {    return await httpFetch('/api/v1/catalog/colors', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async colorGet(id: string): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {    return await httpFetch(`/api/v1/catalog/colors/${id}`);
  },

  async colorList(): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }[]> {    return await httpFetch('/api/v1/catalog/colors');
  },

  async colorUpdate(id: string, dto: { name?: string; description?: string | null; is_active?: boolean }): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {    return await httpFetch(`/api/v1/catalog/colors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  // ── Product Domain ─────────────────────────────────────────────────────────
  async productCreate(dto: CreateProductDto): Promise<Product> {    return await httpFetch<Product>('/api/v1/products', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async productUpdate(id: string, dto: UpdateProductDto): Promise<Product> {    return await httpFetch<Product>(`/api/v1/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  async productGet(id: string): Promise<Product> {    return await httpFetch<Product>(`/api/v1/products/${id}`);
  },

  async productGetBySku(sku: string): Promise<Product> {    return await httpFetch<Product>(`/api/v1/products/sku/${encodeURIComponent(sku)}`);
  },

  async productGetByBarcode(barcode: string): Promise<Product> {    return await httpFetch<Product>(`/api/v1/products/barcode/${encodeURIComponent(barcode)}`);
  },

  async productList(filter?: ProductFilter): Promise<Product[]> {    const params = new URLSearchParams();
    if (filter?.search) params.set('search', filter.search);
    if (filter?.category_id) params.set('category_id', filter.category_id);
    if (filter?.brand_id) params.set('brand_id', filter.brand_id);
    if (filter?.company_id) params.set('company_id', filter.company_id);
    if (filter?.color_id) params.set('color_id', filter.color_id);
    if (filter?.quality_id) params.set('quality_id', filter.quality_id);
    if (filter?.is_active !== undefined && filter.is_active !== null) params.set('is_active', String(filter.is_active));
    if (filter?.limit) params.set('limit', String(filter.limit));
    if (filter?.offset) params.set('offset', String(filter.offset));
    const qs = params.toString();
    return await httpFetch<Product[]>(`/api/v1/products${qs ? `?${qs}` : ''}`);
  },

  async productDeactivate(id: string): Promise<void> {    await httpFetch<void>(`/api/v1/products/${id}`, { method: 'DELETE' });
  },

  // ── Inventory Domain ───────────────────────────────────────────────────────
  async inventoryIncrease(dto: IncreaseStockDto): Promise<number> {    return await httpFetch<number>('/api/v1/inventory/increase', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async inventoryDecrease(dto: DecreaseStockDto): Promise<number> {    return await httpFetch<number>('/api/v1/inventory/decrease', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async inventoryAdjust(dto: AdjustStockDto): Promise<number> {    return await httpFetch<number>('/api/v1/inventory/adjust', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async inventoryTransfer(dto: TransferStockDto): Promise<void> {    await httpFetch<void>('/api/v1/inventory/transfer', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async inventoryGetStock(productId: string, branchId: string): Promise<number> {    return await httpFetch<number>(`/api/v1/inventory/stock?product_id=${productId}&branch_id=${branchId}`);
  },

  async inventoryGetStockMap(branchId: string): Promise<Record<string, number>> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Record<string, number>>('inventory_get_stock_map', { branchId });
    }
    return await httpFetch<Record<string, number>>(`/api/v1/inventory/stock-map?branch_id=${branchId}`);
  },

  async inventoryGetMovements(
    productId?: string,
    branchId?: string,
    limit?: number
  ): Promise<StockMovement[]> {    const params = new URLSearchParams();
    if (productId) params.set('product_id', productId);
    if (branchId) params.set('branch_id', branchId);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return await httpFetch<StockMovement[]>(`/api/v1/inventory/movements${qs ? `?${qs}` : ''}`);
  },

  async inventoryGetLowStock(branchId: string): Promise<LowStockItemDto[]> {    return await httpFetch<LowStockItemDto[]>(`/api/v1/inventory/low-stock?branch_id=${branchId}`);
  },

  // ── Organization & Branch Operations ──────────────────────────────────────
  async branchList(): Promise<Branch[]> {    return await httpFetch<Branch[]>('/api/v1/organization/branches');
  },

  async branchGetMain(): Promise<Branch | null> {    return await httpFetch<Branch | null>('/api/v1/organization/branches/main');
  },

  async organizationGetDashboardStats(): Promise<OrganizationDashboardStats> {    return await httpFetch<OrganizationDashboardStats>('/api/v1/organization/dashboard/stats');
  },

  // ── Customer & Ledger Domain ──────────────────────────────────────────────
  async customerCreate(dto: CreateCustomerDto): Promise<Customer> {    return await httpFetch<Customer>('/api/v1/customers', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async customerUpdate(id: string, dto: UpdateCustomerDto): Promise<Customer> {    return await httpFetch<Customer>(`/api/v1/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  async customerGetById(id: string): Promise<Customer> {    return await httpFetch<Customer>(`/api/v1/customers/${id}`);
  },

  async customerGetDetail(id: string): Promise<CustomerDetailDto> {    return await httpFetch<CustomerDetailDto>(`/api/v1/customers/${id}/detail`);
  },

  async customerList(filter?: CustomerFilter): Promise<CustomerSummaryDto[]> {    const params = new URLSearchParams();
    if (filter?.search) params.set('search', filter.search);
    if (filter?.is_active !== undefined && filter.is_active !== null) params.set('is_active', String(filter.is_active));
    if (filter?.limit) params.set('limit', String(filter.limit));
    if (filter?.offset) params.set('offset', String(filter.offset));
    const qs = params.toString();
    return await httpFetch<CustomerSummaryDto[]>(`/api/v1/customers${qs ? `?${qs}` : ''}`);
  },

  async customerSearch(query: string): Promise<CustomerSummaryDto[]> {    return await httpFetch<CustomerSummaryDto[]>(`/api/v1/customers/search?q=${encodeURIComponent(query)}`);
  },

  async customerGetLedger(
    customerId: string,
    limit?: number,
    offset?: number
  ): Promise<CustomerLedgerEntry[]> {    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    const qs = params.toString();
    return await httpFetch<CustomerLedgerEntry[]>(`/api/v1/customers/${customerId}/ledger${qs ? `?${qs}` : ''}`);
  },

  async customerGetStatement(customerId: string): Promise<CustomerStatementDto> {    return await httpFetch<CustomerStatementDto>(`/api/v1/customers/${customerId}/statement`);
  },

  async customerGetBalance(customerId: string): Promise<number> {    return await httpFetch<number>(`/api/v1/customers/${customerId}/balance`);
  },

  async customerRecordPayment(dto: RecordCustomerPaymentDto): Promise<CustomerPaymentResultDto> {    return await httpFetch<CustomerPaymentResultDto>('/api/v1/customers/payments', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async customerDeactivate(id: string): Promise<void> {    await httpFetch<void>(`/api/v1/customers/${id}`, { method: 'DELETE' });
  },

  // ── Supplier & Procurement Domain ─────────────────────────────────────────
  async supplierCreate(dto: CreateSupplierDto): Promise<Supplier> {    return await httpFetch<Supplier>('/api/v1/suppliers', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async supplierUpdate(id: string, dto: UpdateSupplierDto): Promise<Supplier> {    return await httpFetch<Supplier>(`/api/v1/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  async supplierGetById(id: string): Promise<Supplier | null> {    return await httpFetch<Supplier | null>(`/api/v1/suppliers/${id}`);
  },

  async supplierGetDetail(id: string): Promise<SupplierDetailDto> {    return await httpFetch<SupplierDetailDto>(`/api/v1/suppliers/${id}/detail`);
  },

  async supplierList(filter?: SupplierFilter): Promise<SupplierSummaryDto[]> {    const params = new URLSearchParams();
    if (filter?.search) params.set('search', filter.search);
    if (filter?.is_active !== undefined && filter.is_active !== null) params.set('is_active', String(filter.is_active));
    if (filter?.limit) params.set('limit', String(filter.limit));
    if (filter?.offset) params.set('offset', String(filter.offset));
    const qs = params.toString();
    return await httpFetch<SupplierSummaryDto[]>(`/api/v1/suppliers${qs ? `?${qs}` : ''}`);
  },

  async supplierSearch(query: string): Promise<SupplierSummaryDto[]> {    return await httpFetch<SupplierSummaryDto[]>(`/api/v1/suppliers/search?q=${encodeURIComponent(query)}`);
  },

  async supplierGetBalance(supplierId: string): Promise<number> {    return await httpFetch<number>(`/api/v1/suppliers/${supplierId}/balance`);
  },

  async supplierGetLedger(
    supplierId: string,
    limit?: number,
    offset?: number
  ): Promise<SupplierLedgerEntry[]> {    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    const qs = params.toString();
    return await httpFetch<SupplierLedgerEntry[]>(`/api/v1/suppliers/${supplierId}/ledger${qs ? `?${qs}` : ''}`);
  },

  async supplierGetStatement(supplierId: string): Promise<SupplierStatementDto> {    return await httpFetch<SupplierStatementDto>(`/api/v1/suppliers/${supplierId}/statement`);
  },

  async supplierRecordPayment(dto: RecordSupplierPaymentDto): Promise<SupplierPaymentResultDto> {    return await httpFetch<SupplierPaymentResultDto>('/api/v1/suppliers/payments', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async supplierDeactivate(id: string): Promise<void> {    await httpFetch<void>(`/api/v1/suppliers/${id}`, { method: 'DELETE' });
  },

  // ── Sales & Checkout Domain ────────────────────────────────────────────────
  async saleComplete(dto: CompleteSaleDto): Promise<SaleResultDto> {    return await httpFetch<SaleResultDto>('/api/v1/sales', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async saleGetById(id: string): Promise<Sale | null> {    return await httpFetch<Sale | null>(`/api/v1/sales/${id}`);
  },

  async saleGetByInvoice(invoiceNumber: string): Promise<Sale | null> {    return await httpFetch<Sale | null>(`/api/v1/sales/invoice/${encodeURIComponent(invoiceNumber)}`);
  },

  async saleList(filter?: SaleFilterDto): Promise<Sale[]> {    const params = new URLSearchParams();
    if (filter?.customer_id) params.set('customer_id', filter.customer_id);
    if (filter?.branch_id) params.set('branch_id', filter.branch_id);
    if (filter?.payment_status) params.set('payment_status', filter.payment_status);
    if (filter?.sale_status) params.set('sale_status', filter.sale_status);
    if (filter?.start_date) params.set('start_date', filter.start_date);
    if (filter?.end_date) params.set('end_date', filter.end_date);
    if (filter?.search) params.set('search', filter.search);
    if (filter?.limit) params.set('limit', String(filter.limit));
    if (filter?.offset) params.set('offset', String(filter.offset));
    const qs = params.toString();
    return await httpFetch<Sale[]>(`/api/v1/sales${qs ? `?${qs}` : ''}`);
  },

  async saleGetLines(saleId: string): Promise<SaleLine[]> {    return await httpFetch<SaleLine[]>(`/api/v1/sales/${saleId}/lines`);
  },

  async saleGetPayments(saleId: string): Promise<SalePayment[]> {    return await httpFetch<SalePayment[]>(`/api/v1/sales/${saleId}/payments`);
  },

  // ── Purchasing Domain ──────────────────────────────────────────────────────
  async purchaseComplete(dto: CompletePurchaseDto): Promise<PurchaseResultDto> {    return await httpFetch<PurchaseResultDto>('/api/v1/purchases', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async purchaseGetById(id: string): Promise<Purchase | null> {    return await httpFetch<Purchase | null>(`/api/v1/purchases/${id}`);
  },

  async purchaseGetByNumber(purchaseNumber: string): Promise<Purchase | null> {    return await httpFetch<Purchase | null>(`/api/v1/purchases/number/${encodeURIComponent(purchaseNumber)}`);
  },

  async purchaseList(filter?: PurchaseFilterDto): Promise<Purchase[]> {    const params = new URLSearchParams();
    if (filter?.supplier_id) params.set('supplier_id', filter.supplier_id);
    if (filter?.branch_id) params.set('branch_id', filter.branch_id);
    if (filter?.start_date) params.set('start_date', filter.start_date);
    if (filter?.end_date) params.set('end_date', filter.end_date);
    if (filter?.limit) params.set('limit', String(filter.limit));
    if (filter?.offset) params.set('offset', String(filter.offset));
    const qs = params.toString();
    return await httpFetch<Purchase[]>(`/api/v1/purchases${qs ? `?${qs}` : ''}`);
  },

  async purchaseGetLines(purchaseId: string): Promise<PurchaseLine[]> {    return await httpFetch<PurchaseLine[]>(`/api/v1/purchases/${purchaseId}/lines`);
  },

  // ── Expense Domain ──────────────────────────────────────────────────────────
  async expenseCategoryCreate(dto: CreateExpenseCategoryDto): Promise<ExpenseCategory> {    return await httpFetch<ExpenseCategory>('/api/v1/expenses/categories', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async expenseCategoryUpdate(id: string, dto: UpdateExpenseCategoryDto): Promise<ExpenseCategory> {    return await httpFetch<ExpenseCategory>(`/api/v1/expenses/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  async expenseCategoryList(activeOnly?: boolean): Promise<ExpenseCategory[]> {    const qs = activeOnly !== undefined ? `?active_only=${activeOnly}` : '';
    return await httpFetch<ExpenseCategory[]>(`/api/v1/expenses/categories${qs}`);
  },

  async expenseCreate(dto: CreateExpenseDto): Promise<Expense> {    return await httpFetch<Expense>('/api/v1/expenses', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async expenseGetById(id: string): Promise<Expense | null> {    return await httpFetch<Expense | null>(`/api/v1/expenses/${id}`);
  },

  async expenseList(filter?: ExpenseFilterDto): Promise<Expense[]> {    const params = new URLSearchParams();
    if (filter?.branch_id) params.set('branch_id', filter.branch_id);
    if (filter?.category_id) params.set('category_id', filter.category_id);
    if (filter?.start_date) params.set('start_date', filter.start_date);
    if (filter?.end_date) params.set('end_date', filter.end_date);
    if (filter?.limit) params.set('limit', String(filter.limit));
    if (filter?.offset) params.set('offset', String(filter.offset));
    const qs = params.toString();
    return await httpFetch<Expense[]>(`/api/v1/expenses${qs ? `?${qs}` : ''}`);
  },

  async expenseCancel(id: string, _reason?: string): Promise<Expense> {    return await httpFetch<Expense>(`/api/v1/expenses/${id}`, { method: 'DELETE' });
  },

  // ── Cash Management & Daily Closing Domain ──────────────────────────────────
  async cashSessionOpen(dto: OpenCashSessionDto): Promise<CashSession> {    return await httpFetch<CashSession>('/api/v1/cash/sessions/open', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async cashSessionGetCurrent(branchId?: string): Promise<CashSession | null> {    const qs = branchId ? `?branch_id=${branchId}` : '';
    return await httpFetch<CashSession | null>(`/api/v1/cash/sessions/current${qs}`);
  },

  async cashSessionGetById(id: string): Promise<CashSession> {    return await httpFetch<CashSession>(`/api/v1/cash/sessions/${id}`);
  },

  async cashSessionClose(dto: CloseCashSessionDto): Promise<CashSession> {    return await httpFetch<CashSession>(`/api/v1/cash/sessions/${dto.session_id}/close`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async cashSessionList(branchId?: string, limit?: number, offset?: number): Promise<CashSession[]> {    const params = new URLSearchParams();
    if (branchId) params.set('branch_id', branchId);
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    const qs = params.toString();
    return await httpFetch<CashSession[]>(`/api/v1/cash/sessions${qs ? `?${qs}` : ''}`);
  },

  async cashAdjustmentCreate(dto: CreateCashAdjustmentDto): Promise<CashMovement> {    return await httpFetch<CashMovement>('/api/v1/cash/adjustments', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async cashMovementList(filter?: CashMovementFilterDto): Promise<CashMovement[]> {    const params = new URLSearchParams();
    if (filter?.branch_id) params.set('branch_id', filter.branch_id);
    if (filter?.session_id) params.set('session_id', filter.session_id);
    if (filter?.start_date) params.set('start_date', filter.start_date);
    if (filter?.end_date) params.set('end_date', filter.end_date);
    if (filter?.limit) params.set('limit', String(filter.limit));
    if (filter?.offset) params.set('offset', String(filter.offset));
    const qs = params.toString();
    return await httpFetch<CashMovement[]>(`/api/v1/cash/movements${qs ? `?${qs}` : ''}`);
  },

  async cashDailySummary(branchId?: string, businessDate?: string): Promise<DailyCashSummaryDto> {    const params = new URLSearchParams();
    if (branchId) params.set('branch_id', branchId);
    if (businessDate) params.set('business_date', businessDate);
    const qs = params.toString();
    return await httpFetch<DailyCashSummaryDto>(`/api/v1/cash/daily-summary${qs ? `?${qs}` : ''}`);
  },

  // ── Returns & Stock Reversal Domain ────────────────────────────────────────
  async salesReturnGetReturnable(saleId: string): Promise<SaleReturnableInfoDto> {    return await httpFetch<SaleReturnableInfoDto>(`/api/v1/sales-returns/returnable/${saleId}`);
  },

  async salesReturnCreate(dto: CreateSalesReturnDto): Promise<SalesReturnResultDto> {    return await httpFetch<SalesReturnResultDto>('/api/v1/sales-returns', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async salesReturnGet(id: string): Promise<SalesReturnDetailDto> {    return await httpFetch<SalesReturnDetailDto>(`/api/v1/sales-returns/${id}`);
  },

  async salesReturnList(filter?: SalesReturnFilterDto): Promise<SalesReturn[]> {    const params = new URLSearchParams();
    if (filter?.branch_id) params.set('branch_id', filter.branch_id);
    if (filter?.customer_id) params.set('customer_id', filter.customer_id);
    if (filter?.sale_id) params.set('sale_id', filter.sale_id);
    if (filter?.start_date) params.set('start_date', filter.start_date);
    if (filter?.end_date) params.set('end_date', filter.end_date);
    if (filter?.limit) params.set('limit', String(filter.limit));
    if (filter?.offset) params.set('offset', String(filter.offset));
    const qs = params.toString();
    return await httpFetch<SalesReturn[]>(`/api/v1/sales-returns${qs ? `?${qs}` : ''}`);
  },

  async salesReturnGetBySale(saleId: string): Promise<SalesReturn[]> {    return await httpFetch<SalesReturn[]>(`/api/v1/sales-returns/by-sale/${saleId}`);
  },

  async purchaseReturnGetReturnable(purchaseId: string): Promise<PurchaseReturnableInfoDto> {    return await httpFetch<PurchaseReturnableInfoDto>(`/api/v1/purchase-returns/returnable/${purchaseId}`);
  },

  async purchaseReturnCreate(dto: CreatePurchaseReturnDto): Promise<PurchaseReturnResultDto> {    return await httpFetch<PurchaseReturnResultDto>('/api/v1/purchase-returns', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async purchaseReturnGet(id: string): Promise<PurchaseReturnDetailDto> {    return await httpFetch<PurchaseReturnDetailDto>(`/api/v1/purchase-returns/${id}`);
  },

  async purchaseReturnList(filter?: PurchaseReturnFilterDto): Promise<PurchaseReturn[]> {    const params = new URLSearchParams();
    if (filter?.branch_id) params.set('branch_id', filter.branch_id);
    if (filter?.supplier_id) params.set('supplier_id', filter.supplier_id);
    if (filter?.purchase_id) params.set('purchase_id', filter.purchase_id);
    if (filter?.start_date) params.set('start_date', filter.start_date);
    if (filter?.end_date) params.set('end_date', filter.end_date);
    if (filter?.status) params.set('status', filter.status);
    if (filter?.limit) params.set('limit', String(filter.limit));
    if (filter?.offset) params.set('offset', String(filter.offset));
    const qs = params.toString();
    return await httpFetch<PurchaseReturn[]>(`/api/v1/purchase-returns${qs ? `?${qs}` : ''}`);
  },

  async purchaseReturnGetByPurchase(purchaseId: string): Promise<PurchaseReturn[]> {    return await httpFetch<PurchaseReturn[]>(`/api/v1/purchase-returns/by-purchase/${purchaseId}`);
  },

  // ── Profitability & COGS ────────────────────────────────────────────────────
  async profitGetPeriod(
    startDate?: string | null,
    endDate?: string | null,
    branchId?: string | null
  ): Promise<PeriodProfitabilityDto> {    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (branchId) params.set('branch_id', branchId);
    const qs = params.toString();
    return await httpFetch<PeriodProfitabilityDto>(`/api/v1/profit/period${qs ? `?${qs}` : ''}`);
  },

  async profitGetDaily(
    startDate?: string | null,
    endDate?: string | null,
    branchId?: string | null
  ): Promise<DailyProfitabilityDto[]> {    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (branchId) params.set('branch_id', branchId);
    const qs = params.toString();
    return await httpFetch<DailyProfitabilityDto[]>(`/api/v1/profit/daily${qs ? `?${qs}` : ''}`);
  },

  async profitGetProduct(
    productId?: string | null,
    startDate?: string | null,
    endDate?: string | null,
    branchId?: string | null
  ): Promise<ProductProfitabilityDto[]> {    const params = new URLSearchParams();
    if (productId) params.set('product_id', productId);
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (branchId) params.set('branch_id', branchId);
    const qs = params.toString();
    return await httpFetch<ProductProfitabilityDto[]>(`/api/v1/profit/product${qs ? `?${qs}` : ''}`);
  },

  async profitGetSale(saleId: string): Promise<SaleProfitabilityDto | null> {    return await httpFetch<SaleProfitabilityDto | null>(`/api/v1/profit/sale/${saleId}`);
  },

  async organizationGetDashboardBalances(): Promise<DashboardBalancesDto> {    return await httpFetch<DashboardBalancesDto>('/api/v1/organization/dashboard/balances');
  },

  async profitGetDashboardSummary(branchId?: string | null): Promise<DashboardProfitSummaryDto> {    const qs = branchId ? `?branch_id=${branchId}` : '';
    return await httpFetch<DashboardProfitSummaryDto>(`/api/v1/profit/dashboard-summary${qs}`);
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
  company_id?: string | null;
  color_id?: string | null;
  quality_id?: string | null;
  unit_id: string | null;
  purchase_price: number; // Stored in whole Pakistani Rupees - Last Purchase Cost (1 stored integer = 1 PKR)
  average_cost: number;   // Stored in whole Pakistani Rupees - Weighted Average Cost (1 stored integer = 1 PKR)
  sale_price: number;     // Stored in whole Pakistani Rupees (1 stored integer = 1 PKR)
  low_stock_threshold: number;
  quantity?: number;
  min_stock_level?: number;
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
  company_id?: string | null;
  color_id?: string | null;
  quality_id?: string | null;
  unit_id?: string | null;
  purchase_price: number;
  average_cost?: number | null;
  sale_price: number;
  low_stock_threshold?: number | null;
  description?: string | null;
  initial_branch_id?: string | null;
  initial_quantity?: number | null;
  branch_id?: string | null;
}

export interface UpdateProductDto {
  name?: string | null;
  sku?: string | null;
  barcode?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  company_id?: string | null;
  color_id?: string | null;
  quality_id?: string | null;
  unit_id?: string | null;
  purchase_price?: number | null;
  average_cost?: number | null;
  sale_price?: number | null;
  low_stock_threshold?: number | null;
  is_active?: boolean | null;
  description?: string | null;
}

export interface ProductFilter {
  category_id?: string | null;
  brand_id?: string | null;
  company_id?: string | null;
  color_id?: string | null;
  quality_id?: string | null;
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
}

export interface LowStockItemDto {
  product_id: string;
  product_name: string;
  sku: string;
  branch_id: string;
  current_stock: number;
  low_stock_threshold: number;
}

// ── Type Definitions for Customer & Ledger Domain ────────────────────────────
export interface Customer {
  id: string;
  customer_code: string;
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

export interface CustomerSummaryDto {
  id: string;
  customer_code: string;
  name: string;
  phone: string;
  credit_limit: number;
  outstanding_balance: number;
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

export interface CustomerLedgerEntry {
  id: string;
  customer_id: string;
  entry_type: string;
  amount: number;
  balance_after: number;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface CustomerStatementDto {
  customer: Customer;
  entries: CustomerLedgerEntry[];
  opening_balance: number;
  closing_balance: number;
  total_debits: number;
  total_credits: number;
}

export interface RecordCustomerPaymentDto {
  customer_id: string;
  amount: number;
  payment_method: string;
  reference_number?: string | null;
  notes?: string | null;
}

export interface CustomerPaymentResultDto {
  ledger_entry: CustomerLedgerEntry;
  balance_after: number;
}

// ── Type Definitions for Suppliers & Purchasing ───────────────────────────────
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
  outstanding_balance: number;
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

export interface SupplierLedgerEntry {
  id: string;
  supplier_id: string;
  entry_type: string;
  amount: number;
  balance_after: number;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface SupplierStatementDto {
  supplier: Supplier;
  entries: SupplierLedgerEntry[];
  opening_balance: number;
  closing_balance: number;
  total_debits: number;
  total_credits: number;
}

export interface RecordSupplierPaymentDto {
  supplier_id: string;
  amount: number;
  payment_method: string;
  reference_number?: string | null;
  notes?: string | null;
}

export interface SupplierPaymentResultDto {
  ledger_entry: SupplierLedgerEntry;
  balance_after: number;
}

// ── Type Definitions for Purchase ────────────────────────────────────────────
export interface Purchase {
  id: string;
  purchase_number: string;
  branch_id: string;
  supplier_id: string | null;
  supplier_name_snapshot: string | null;
  subtotal: number;
  discount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  payment_status: string;
  purchase_status: string;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseLine {
  id: string;
  purchase_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  unit_cost: number;
  quantity: number;
  discount: number;
  line_total: number;
  created_at: string;
}

export interface PurchaseItemDto {
  product_id: string;
  quantity: number;
  unit_cost: number;
  discount?: number | null;
}

export interface CompletePurchaseDto {
  branch_id?: string | null;
  supplier_id?: string | null;
  items: PurchaseItemDto[];
  discount?: number | null;
  paid_amount?: number | null;
  payment_method?: string | null;
  notes?: string | null;
}

export interface PurchaseResultDto {
  purchase: Purchase;
  lines: PurchaseLine[];
}

export interface PurchaseFilterDto {
  supplier_id?: string | null;
  branch_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  limit?: number | null;
  offset?: number | null;
}

// ── Type Definitions for Expense Domain ──────────────────────────────────────
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

export interface Expense {
  id: string;
  branch_id: string;
  category_id: string | null;
  category_name_snapshot: string | null;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  expense_status: string;
  performed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseDto {
  branch_id?: string | null;
  category_id?: string | null;
  amount: number;
  payment_method: string;
  reference_number?: string | null;
  notes?: string | null;
}

export interface ExpenseFilterDto {
  branch_id?: string | null;
  category_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  limit?: number | null;
  offset?: number | null;
}

// ── Type Definitions for Cash Management ─────────────────────────────────────
export interface CashSession {
  id: string;
  branch_id: string;
  opened_by: string | null;
  closed_by: string | null;
  opening_balance: number;
  closing_balance: number | null;
  expected_closing_balance: number | null;
  variance: number | null;
  session_status: string;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpenCashSessionDto {
  branch_id?: string | null;
  opening_balance: number;
  notes?: string | null;
}

export interface CloseCashSessionDto {
  session_id: string;
  closing_balance: number;
  notes?: string | null;
}

export interface CashMovement {
  id: string;
  session_id: string | null;
  branch_id: string;
  movement_type: string;
  amount: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
}

export interface CreateCashAdjustmentDto {
  branch_id?: string | null;
  session_id?: string | null;
  amount: number;
  movement_type: string;
  notes?: string | null;
}

export interface CashMovementFilterDto {
  branch_id?: string | null;
  session_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export interface DailyCashSummaryDto {
  branch_id: string;
  business_date: string;
  opening_balance: number;
  cash_sales: number;
  cash_in: number;
  cash_out: number;
  expected_balance: number;
  session_id: string | null;
}

// ── Type Definitions for Sales Domain ────────────────────────────────────────
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

export interface SalePaymentInputDto {
  method: string;
  amount: number;
  reference_number?: string | null;
  notes?: string | null;
}

export interface CompleteSaleDto {
  branch_id?: string | null;
  customer_id?: string | null;
  items: SaleItemDto[];
  discount?: number | null;
  paid_amount?: number | null;
  payment_method?: string | null;
  payments?: SalePaymentInputDto[] | null;
  notes?: string | null;
  terminal_id?: string | null;
}

export interface SaleResultDto {
  sale: Sale;
  lines: SaleLine[];
  payments: SalePayment[];
  credit_amount: number;
  customer_balance_after: number | null;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
}

export interface SaleFilterDto {
  customer_id?: string | null;
  branch_id?: string | null;
  payment_status?: string | null;
  sale_status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  search?: string | null;
  limit?: number | null;
  offset?: number | null;
}

// ── Type Definitions for Sales Returns ───────────────────────────────────────
export interface SalesReturn {
  id: string;
  return_number: string;
  sale_id: string;
  branch_id: string;
  customer_id: string | null;
  return_amount: number;
  settlement_method: string;
  return_status: string;
  reason: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesReturnLine {
  id: string;
  return_id: string;
  sale_line_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  unit_price: number;
  quantity: number;
  return_amount: number;
  created_at: string;
}

export interface SalesReturnDetailDto {
  sales_return: SalesReturn;
  lines: SalesReturnLine[];
  original_invoice_number: string;
}

export interface SaleReturnableLineDto {
  sale_line_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  original_unit_price: number;
  original_quantity: number;
  already_returned_quantity: number;
  returnable_quantity: number;
  current_available_stock: number;
}

export interface SaleReturnableInfoDto {
  sale_id: string;
  invoice_number: string;
  branch_id: string;
  customer_id: string | null;
  customer_name: string | null;
  sale_status: string;
  lines: SaleReturnableLineDto[];
}

export interface CreateSalesReturnLineDto {
  sale_line_id: string;
  quantity: number;
}

export interface CreateSalesReturnDto {
  sale_id: string;
  lines: CreateSalesReturnLineDto[];
  settlement_method: string;
  reason?: string | null;
  notes?: string | null;
}

export interface SalesReturnResultDto {
  sales_return: SalesReturn;
  lines: SalesReturnLine[];
  customer_balance_after: number | null;
  cash_refunded: number | null;
}

export interface SalesReturnFilterDto {
  branch_id?: string | null;
  customer_id?: string | null;
  sale_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  limit?: number | null;
  offset?: number | null;
}

// ── Type Definitions for Purchase Returns ─────────────────────────────────────
export interface PurchaseReturn {
  id: string;
  return_number: string;
  purchase_id: string;
  branch_id: string;
  supplier_id: string | null;
  return_amount: number;
  settlement_method: string;
  return_status: string;
  reason: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseReturnLine {
  id: string;
  return_id: string;
  purchase_line_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  unit_cost: number;
  quantity: number;
  return_amount: number;
  created_at: string;
}

export interface PurchaseReturnDetailDto {
  purchase_return: PurchaseReturn;
  lines: PurchaseReturnLine[];
  original_purchase_number: string;
}

export interface PurchaseReturnableLineDto {
  purchase_line_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  original_unit_cost: number;
  original_quantity: number;
  already_returned_quantity: number;
  returnable_quantity: number;
  current_available_stock: number;
}

export interface PurchaseReturnableInfoDto {
  purchase_id: string;
  purchase_number: string;
  branch_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  purchase_status: string;
  lines: PurchaseReturnableLineDto[];
}

export interface CreatePurchaseReturnLineDto {
  purchase_line_id: string;
  quantity: number;
}

export interface CreatePurchaseReturnDto {
  purchase_id: string;
  lines: CreatePurchaseReturnLineDto[];
  settlement_method: string;
  reason?: string | null;
  notes?: string | null;
}

export interface PurchaseReturnResultDto {
  purchase_return: PurchaseReturn;
  lines: PurchaseReturnLine[];
  supplier_payable_after: number | null;
  cash_settled: number | null;
}

export interface PurchaseReturnFilterDto {
  branch_id?: string | null;
  supplier_id?: string | null;
  purchase_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  limit?: number | null;
  offset?: number | null;
}

// ── Type Definitions for Profitability & COGS ─────────────────────────────────
export interface ProfitMetricsDto {
  gross_revenue: number;
  discounts: number;
  net_revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
  orders_count: number;
}

export interface PeriodProfitabilityDto {
  start_date: string | null;
  end_date: string | null;
  gross_revenue: number;
  discounts: number;
  net_revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
  sales_count: number;
  returns_count: number;
}

export interface DailyProfitabilityDto {
  date: string;
  gross_revenue: number;
  discounts: number;
  net_revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
}

export interface ProductProfitabilityDto {
  product_id: string;
  product_name: string;
  sku: string;
  quantity_sold: number;
  quantity_returned: number;
  net_quantity: number;
  gross_revenue: number;
  discounts: number;
  net_revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
}

export interface SaleProfitabilityDto {
  sale_id: string;
  invoice_number: string;
  gross_revenue: number;
  discounts: number;
  net_revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
}

export interface DashboardBalancesDto {
  customer_receivables: number;
  supplier_payables: number;
}

export interface DashboardProfitSummaryDto {
  today: ProfitMetricsDto;
  this_month: ProfitMetricsDto;
  total: ProfitMetricsDto;
}


// ── Party Domain (Phase 1.1) — type definitions kept for compatibility ────────

export const PARTY_DESKTOP_ONLY_MESSAGE = 'Parties are available in the Niazi desktop app only.';

export type PartyType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH';

export interface Party {
  id: string;
  display_name: string;
  company_name?: string | null;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Party with linked roles and read-only balances (whole PKR). */
export interface PartySummaryDto {
  party: Party;
  /** null when no role is linked yet */
  party_type: PartyType | null;
  customer_id?: string | null;
  customer_code?: string | null;
  customer_credit_limit?: number | null;
  supplier_id?: string | null;
  supplier_code?: string | null;
  customer_receivable: number;
  supplier_payable: number;
}

export interface CreatePartyDto {
  party_type: PartyType;
  display_name: string;
  company_name?: string | null;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  /** customer role only; whole PKR; 0 = unlimited */
  credit_limit?: number | null;
}

/** Partial update; for optional text fields an empty string clears the value. */
export interface UpdatePartyDto {
  display_name?: string;
  company_name?: string;
  phone?: string;
  alternate_phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  is_active?: boolean;
}

export interface PartyFilter {
  search?: string;
  /** CUSTOMER / SUPPLIER = has that role (includes BOTH); BOTH = both roles */
  party_type?: PartyType;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}
