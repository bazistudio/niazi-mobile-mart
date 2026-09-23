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

const WEB_PRODUCTS_STORAGE_KEY = 'niazi_web_products';
const WEB_STOCK_STORAGE_KEY = 'niazi_web_stock_map';

function getStoredWebProducts(): Product[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WEB_PRODUCTS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveStoredWebProducts(products: Product[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WEB_PRODUCTS_STORAGE_KEY, JSON.stringify(products));
  } catch (e) {
    console.warn('Failed to save web products to localStorage:', e);
  }
}

function getStoredWebStockMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(WEB_STOCK_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveStoredWebStockMap(map: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WEB_STOCK_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('Failed to save web stock map to localStorage:', e);
  }
}

const WEB_CUSTOMERS_STORAGE_KEY = 'niazi_web_customers';

function getStoredWebCustomers(): Customer[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WEB_CUSTOMERS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveStoredWebCustomers(customers: Customer[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WEB_CUSTOMERS_STORAGE_KEY, JSON.stringify(customers));
  } catch (e) {
    console.warn('Failed to save web customers to localStorage:', e);
  }
}

const WEB_SUPPLIERS_STORAGE_KEY = 'niazi_web_suppliers';

function getStoredWebSuppliers(): Supplier[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WEB_SUPPLIERS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveStoredWebSuppliers(suppliers: Supplier[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WEB_SUPPLIERS_STORAGE_KEY, JSON.stringify(suppliers));
  } catch (e) {
    console.warn('Failed to save web suppliers to localStorage:', e);
  }
}

const WEB_SALES_STORAGE_KEY = 'niazi_web_sales';

interface StoredWebSale {
  sale: Sale;
  lines: SaleLine[];
  payments: SalePayment[];
}

function getStoredWebSales(): StoredWebSale[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WEB_SALES_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveStoredWebSales(sales: StoredWebSale[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WEB_SALES_STORAGE_KEY, JSON.stringify(sales));
  } catch (e) {
    console.warn('Failed to save web sales to localStorage:', e);
  }
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

  async authLoginSnapshot(username: string, credential: string): Promise<AuthResponse> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      const session = await invoke<SessionContext>('auth_login_snapshot', {
        username,
        credential,
      });
      const user = await invoke<SanitizedUser | null>('auth_get_current_user');
      if (!user) {
        throw new Error('Failed to retrieve user after snapshot authentication');
      }
      return {
        user,
        session,
      };
    }
    throw new Error('Native snapshot authentication requires desktop environment');
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
    if (getApiBaseUrl()) {
      return await httpFetch<SanitizedUser[]>('/api/v1/users');
    }
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SanitizedUser[]>('admin_list_users');
    }
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('nmm_browser_staff_users') : null;
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          return list.map((u: any) => ({
            id: u.id || u._id,
            name: u.name,
            username: u.username,
            role: (u.roleId || u.role || 'ADMIN').toUpperCase() as StaffRole,
            status: u.status || 'active',
            is_active: u.status === 'active' || u.is_active !== false,
            must_change_password: !!u.mustChangePassword,
            has_pin: !!u.hasPin,
            access_profile: u.access_profile || { role_name: u.roleName || 'Staff', permissions: [] },
            created_at: u.createdAt || new Date().toISOString(),
          }));
        }
      }
    } catch {}

    return [
      { id: '00000000-0000-0000-0000-000000000001', name: 'IMRAN KHAN NIAZI', username: 'imran khan', role: 'ADMIN', status: 'active', is_active: true, must_change_password: false, has_pin: true, access_profile: { role_name: 'Organization Admin', permissions: [] }, created_at: '2026-01-01T00:00:00Z' },
      { id: '00000000-0000-0000-0000-000000000002', name: 'ZAIN ULLAH', username: 'zk', role: 'MANAGER', status: 'active', is_active: true, must_change_password: false, has_pin: true, access_profile: { role_name: 'Manager', permissions: [] }, created_at: '2026-01-01T00:00:00Z' },
      { id: '00000000-0000-0000-0000-000000000003', name: 'RAJA ABDUL REHMAN', username: 'raja', role: 'CASHIER', status: 'active', is_active: true, must_change_password: false, has_pin: true, access_profile: { role_name: 'Cashier', permissions: [] }, created_at: '2026-01-01T00:00:00Z' },
      { id: '00000000-0000-0000-0000-000000000004', name: 'MOHAMMAD BAKHSH CHISHTI', username: 'bashi', role: 'SALESMAN', status: 'active', is_active: true, must_change_password: false, has_pin: true, access_profile: { role_name: 'Salesman', permissions: [] }, created_at: '2026-01-01T00:00:00Z' },
      { id: '00000000-0000-0000-0000-000000000005', name: 'NAVEED GUL', username: 'gul', role: 'ACCOUNTANT', status: 'active', is_active: true, must_change_password: false, has_pin: true, access_profile: { role_name: 'Accountant', permissions: [] }, created_at: '2026-01-01T00:00:00Z' },
      { id: '00000000-0000-0000-0000-000000000006', name: 'FAIZAN KHAN', username: 'faizan', role: 'REPAIR_MECHANIC', status: 'active', is_active: true, must_change_password: false, has_pin: true, access_profile: { role_name: 'Repair Mechanic', permissions: [] }, created_at: '2026-01-01T00:00:00Z' },
    ];
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
    login_key?: string;
    pin?: string;
    role: StaffRole;
    access_profile?: StaffAccessProfile;
  }): Promise<SanitizedUser> {
    if (getApiBaseUrl()) {
      return await httpFetch<SanitizedUser>('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SanitizedUser>('admin_create_user', { payload });
    }
    throw new Error('API Base URL or Tauri environment required');
  },

  async adminUpdateUser(payload: {
    user_id: string;
    name?: string;
    role?: StaffRole;
    status?: 'ACTIVE' | 'DISABLED' | 'PENDING' | 'REJECTED';
    is_active?: boolean;
    access_profile?: StaffAccessProfile;
  }): Promise<SanitizedUser> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SanitizedUser>('admin_update_user', { payload });
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
    return {
      id: `cat_${Date.now()}`,
      name: dto.name,
      code: dto.code || 'CAT',
      description: dto.description || null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  async categoryGet(id: string): Promise<Category> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Category>('category_get', { id });
    }
    return {
      id,
      name: 'Category',
      code: 'CAT',
      description: null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
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
    return {
      id,
      name: dto.name || 'Category',
      code: 'CAT',
      description: dto.description || null,
      is_active: dto.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  async brandCreate(dto: CreateBrandDto): Promise<Brand> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Brand>('brand_create', { dto });
    }
    return {
      id: `brd_${Date.now()}`,
      name: dto.name,
      code: dto.code || 'BRD',
      description: dto.description || null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  async brandGet(id: string): Promise<Brand> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Brand>('brand_get', { id });
    }
    return {
      id,
      name: 'Brand',
      code: 'BRD',
      description: null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
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
    return {
      id,
      name: dto.name || 'Brand',
      code: 'BRD',
      description: dto.description || null,
      is_active: dto.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
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

  async companyCreate(dto: { name: string; code?: string; description?: string | null }): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('company_create', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async companyGet(id: string): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('company_get', { id });
    }
    throw new Error('Tauri environment required');
  },

  async companyList(): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('company_list');
    }
    return [];
  },

  async companyUpdate(id: string, dto: { name?: string; description?: string | null; is_active?: boolean }): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('company_update', { id, dto });
    }
    throw new Error('Tauri environment required');
  },

  async qualityCreate(dto: { name: string; code?: string; description?: string | null }): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('quality_create', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async qualityGet(id: string): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('quality_get', { id });
    }
    throw new Error('Tauri environment required');
  },

  async qualityList(): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('quality_list');
    }
    return [];
  },

  async qualityUpdate(id: string, dto: { name?: string; description?: string | null; is_active?: boolean }): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('quality_update', { id, dto });
    }
    throw new Error('Tauri environment required');
  },

  async colorCreate(dto: { name: string; code?: string; description?: string | null }): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('color_create', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async colorGet(id: string): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('color_get', { id });
    }
    throw new Error('Tauri environment required');
  },

  async colorList(): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('color_list');
    }
    return [];
  },

  async colorUpdate(id: string, dto: { name?: string; description?: string | null; is_active?: boolean }): Promise<{ id: string; name: string; code: string; description?: string | null; is_active: boolean; created_at: string; updated_at: string }> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('color_update', { id, dto });
    }
    throw new Error('Tauri environment required');
  },

  // ── Product Domain (Phase 7 Domain 1 — Typed Storage Bridge) ───────────────
  async productCreate(dto: CreateProductDto): Promise<Product> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Product>('storage_product_create', { dto });
    }
    const products = getStoredWebProducts();
    const now = new Date().toISOString();
    const newProduct: Product = {
      id: `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: dto.name,
      sku: dto.sku,
      barcode: dto.barcode || null,
      category_id: dto.category_id,
      brand_id: dto.brand_id || null,
      company_id: dto.company_id || null,
      color_id: dto.color_id || null,
      quality_id: dto.quality_id || null,
      unit_id: dto.unit_id || null,
      purchase_price: Math.round(Number(dto.purchase_price) || 0),
      average_cost: Math.round(Number(dto.average_cost ?? dto.purchase_price) || 0),
      sale_price: Math.round(Number(dto.sale_price) || 0),
      low_stock_threshold: Number(dto.low_stock_threshold) || 5,
      is_active: true,
      description: dto.description || null,
      created_at: now,
      updated_at: now,
    };
    products.unshift(newProduct);
    saveStoredWebProducts(products);

    const qty = dto.initial_quantity || 0;
    if (qty > 0) {
      const stockMap = getStoredWebStockMap();
      stockMap[newProduct.id] = (stockMap[newProduct.id] || 0) + qty;
      saveStoredWebStockMap(stockMap);
    }

    return newProduct;
  },

  async productUpdate(id: string, dto: UpdateProductDto): Promise<Product> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Product>('storage_product_update', { id, dto });
    }
    const products = getStoredWebProducts();
    const idx = products.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new Error(`Product not found: ${id}`);
    }
    const existing = products[idx];
    const updated: Product = {
      ...existing,
      name: dto.name ?? existing.name,
      sku: dto.sku ?? existing.sku,
      barcode: dto.barcode !== undefined ? dto.barcode : existing.barcode,
      category_id: dto.category_id ?? existing.category_id,
      brand_id: dto.brand_id !== undefined ? dto.brand_id : existing.brand_id,
      company_id: dto.company_id !== undefined ? dto.company_id : existing.company_id,
      color_id: dto.color_id !== undefined ? dto.color_id : existing.color_id,
      quality_id: dto.quality_id !== undefined ? dto.quality_id : existing.quality_id,
      unit_id: dto.unit_id !== undefined ? dto.unit_id : existing.unit_id,
      purchase_price:
        dto.purchase_price !== undefined && dto.purchase_price !== null
          ? Math.round(Number(dto.purchase_price))
          : existing.purchase_price,
      average_cost:
        dto.average_cost !== undefined && dto.average_cost !== null
          ? Math.round(Number(dto.average_cost))
          : existing.average_cost,
      sale_price:
        dto.sale_price !== undefined && dto.sale_price !== null
          ? Math.round(Number(dto.sale_price))
          : existing.sale_price,
      low_stock_threshold:
        dto.low_stock_threshold !== undefined && dto.low_stock_threshold !== null
          ? Number(dto.low_stock_threshold)
          : existing.low_stock_threshold,
      is_active: dto.is_active !== undefined && dto.is_active !== null ? dto.is_active : existing.is_active,
      description: dto.description !== undefined ? dto.description : existing.description,
      updated_at: new Date().toISOString(),
    };
    products[idx] = updated;
    saveStoredWebProducts(products);
    return updated;
  },

  async productGet(id: string): Promise<Product> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Product>('storage_product_get', { id });
    }
    const products = getStoredWebProducts();
    const found = products.find((p) => p.id === id);
    if (!found) throw new Error(`Product not found: ${id}`);
    return found;
  },

  async productGetBySku(sku: string): Promise<Product> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Product>('storage_product_get_by_sku', { sku });
    }
    const products = getStoredWebProducts();
    const found = products.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
    if (!found) throw new Error(`Product not found with SKU: ${sku}`);
    return found;
  },

  async productGetByBarcode(barcode: string): Promise<Product> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Product>('storage_product_get_by_barcode', { barcode });
    }
    const products = getStoredWebProducts();
    const found = products.find((p) => p.barcode && p.barcode.toLowerCase() === barcode.toLowerCase());
    if (!found) throw new Error(`Product not found with Barcode: ${barcode}`);
    return found;
  },

  async productList(filter?: ProductFilter): Promise<Product[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Product[]>('storage_product_list', { filter });
    }
    let list = getStoredWebProducts();
    if (filter) {
      if (filter.is_active !== undefined && filter.is_active !== null) {
        list = list.filter((p) => p.is_active === filter.is_active);
      }
      if (filter.category_id) {
        list = list.filter((p) => p.category_id === filter.category_id);
      }
      if (filter.brand_id) {
        list = list.filter((p) => p.brand_id === filter.brand_id);
      }
      if (filter.company_id) {
        list = list.filter((p) => p.company_id === filter.company_id);
      }
      if (filter.color_id) {
        list = list.filter((p) => p.color_id === filter.color_id);
      }
      if (filter.quality_id) {
        list = list.filter((p) => p.quality_id === filter.quality_id);
      }
      if (filter.search) {
        const query = filter.search.toLowerCase();
        list = list.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.sku.toLowerCase().includes(query) ||
            (p.barcode && p.barcode.toLowerCase().includes(query))
        );
      }
      if (filter.offset) {
        list = list.slice(filter.offset);
      }
      if (filter.limit) {
        list = list.slice(0, filter.limit);
      }
    }
    return list;
  },

  async productDeactivate(id: string): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('storage_product_deactivate', { id });
      return;
    }
    const products = getStoredWebProducts();
    const idx = products.findIndex((p) => p.id === id);
    if (idx !== -1) {
      products[idx].is_active = false;
      products[idx].updated_at = new Date().toISOString();
      saveStoredWebProducts(products);
    }
  },

  // ── Inventory Foundation Domain (Phase 4A Typed Storage Bridge) ─────────────
  async inventoryIncrease(dto: IncreaseStockDto): Promise<number> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<number>('storage_inventory_increase', { dto });
    }
    const stockMap = getStoredWebStockMap();
    const current = stockMap[dto.product_id] || 0;
    const next = current + (dto.quantity || 0);
    stockMap[dto.product_id] = next;
    saveStoredWebStockMap(stockMap);
    return next;
  },

  async inventoryDecrease(dto: DecreaseStockDto): Promise<number> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<number>('storage_inventory_decrease', { dto });
    }
    const stockMap = getStoredWebStockMap();
    const current = stockMap[dto.product_id] || 0;
    const next = Math.max(0, current - (dto.quantity || 0));
    stockMap[dto.product_id] = next;
    saveStoredWebStockMap(stockMap);
    return next;
  },

  async inventoryAdjust(dto: AdjustStockDto): Promise<number> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<number>('storage_inventory_adjust', { dto });
    }
    const stockMap = getStoredWebStockMap();
    const next = dto.target_quantity ?? (dto as any).new_quantity ?? 0;
    stockMap[dto.product_id] = next;
    saveStoredWebStockMap(stockMap);
    return next;
  },

  async inventoryTransfer(dto: TransferStockDto): Promise<void> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('storage_inventory_transfer', { dto });
    }
  },

  async inventoryGetStock(productId: string, branchId: string): Promise<number> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<number>('storage_inventory_get_stock', {
        productId,
        branchId,
      });
    }
    const stockMap = getStoredWebStockMap();
    return stockMap[productId] || 0;
  },

  async inventoryGetStockMap(branchId: string): Promise<Record<string, number>> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Record<string, number>>('storage_inventory_get_stock_map', {
        branchId,
      });
    }
    return getStoredWebStockMap();
  },

  async inventoryGetMovements(
    productId?: string,
    branchId?: string,
    limit?: number
  ): Promise<StockMovement[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<StockMovement[]>('storage_inventory_get_movements', {
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
      return await invoke<LowStockItemDto[]>('storage_inventory_get_low_stock', {
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
    const prods = getStoredWebProducts();
    const lowStockCount = prods.filter((p: any) => (p.quantity ?? 0) <= ((p.min_stock_level ?? p.low_stock_threshold) || 5)).length;
    let activeStaffCount = 6;
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('nmm_browser_staff_users') : null;
      if (raw) {
        const staff = JSON.parse(raw);
        if (Array.isArray(staff)) {
          activeStaffCount = Math.max(1, staff.filter((u: any) => u.status === 'active').length);
        }
      }
    } catch {}

    return {
      product_count: prods.length,
      category_count: 0,
      active_staff_count: activeStaffCount,
      low_stock_count: lowStockCount,
      active_branch_count: 1,
    };
  },

  // ── Customer & Ledger Domain (Phase 15) ──────────────────────────────────
  async customerCreate(dto: CreateCustomerDto): Promise<Customer> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Customer>('customer_create', { dto });
    }
    const customers = getStoredWebCustomers();
    const now = new Date().toISOString();
    const newCust: Customer = {
      id: `cust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      customer_code: `CUST-${Math.floor(1000 + Math.random() * 9000)}`,
      name: dto.name,
      phone: dto.phone,
      alternate_phone: dto.alternate_phone || null,
      email: dto.email || null,
      address: dto.address || null,
      notes: dto.notes || null,
      credit_limit: dto.credit_limit ?? 100000,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    customers.unshift(newCust);
    saveStoredWebCustomers(customers);
    return newCust;
  },

  async customerUpdate(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Customer>('customer_update', { id, dto });
    }
    const customers = getStoredWebCustomers();
    const idx = customers.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Customer not found: ${id}`);
    const existing = customers[idx];
    const updated: Customer = {
      ...existing,
      name: dto.name ?? existing.name,
      phone: dto.phone ?? existing.phone,
      alternate_phone: dto.alternate_phone !== undefined ? dto.alternate_phone : existing.alternate_phone,
      email: dto.email !== undefined ? dto.email : existing.email,
      address: dto.address !== undefined ? dto.address : existing.address,
      notes: dto.notes !== undefined ? dto.notes : existing.notes,
      credit_limit: dto.credit_limit !== undefined && dto.credit_limit !== null ? dto.credit_limit : existing.credit_limit,
      is_active: dto.is_active !== undefined && dto.is_active !== null ? dto.is_active : existing.is_active,
      updated_at: new Date().toISOString(),
    };
    customers[idx] = updated;
    saveStoredWebCustomers(customers);
    return updated;
  },

  async customerGetById(id: string): Promise<Customer> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Customer>('customer_get_by_id', { id });
    }
    const customers = getStoredWebCustomers();
    const found = customers.find((c) => c.id === id);
    if (!found) throw new Error(`Customer not found: ${id}`);
    return found;
  },

  async customerGetDetail(id: string): Promise<CustomerDetailDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CustomerDetailDto>('customer_get_detail', { id });
    }
    const customer = await this.customerGetById(id);
    return {
      customer,
      outstanding_balance: 0,
      total_sales_count: 0,
      total_sales_amount: 0,
      last_transaction_date: null,
    };
  },

  async customerList(filter?: CustomerFilter): Promise<CustomerSummaryDto[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CustomerSummaryDto[]>('customer_list', { filter });
    }
    const customers = getStoredWebCustomers();
    let filtered = customers.filter((c) => c.is_active);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.customer_code.toLowerCase().includes(q)
      );
    }
    return filtered.map((c) => ({
      id: c.id,
      customer_code: c.customer_code,
      name: c.name,
      phone: c.phone,
      credit_limit: c.credit_limit,
      outstanding_balance: 0,
      is_active: c.is_active,
      created_at: c.created_at,
    }));
  },

  async customerSearch(query: string): Promise<CustomerSummaryDto[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CustomerSummaryDto[]>('customer_search', { query });
    }
    const customers = getStoredWebCustomers();
    const q = (query || '').toLowerCase();
    return customers
      .filter(
        (c) =>
          c.is_active &&
          (c.name.toLowerCase().includes(q) ||
            c.phone.includes(q) ||
            c.customer_code.toLowerCase().includes(q))
      )
      .map((c) => ({
        id: c.id,
        customer_code: c.customer_code,
        name: c.name,
        phone: c.phone,
        credit_limit: c.credit_limit,
        outstanding_balance: 0,
        is_active: c.is_active,
        created_at: c.created_at,
      }));
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

  // ── Supplier & Procurement Domain (Phase 16) ──────────────────────────────────
  async supplierCreate(dto: CreateSupplierDto): Promise<Supplier> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Supplier>('supplier_create', { dto });
    }
    const suppliers = getStoredWebSuppliers();
    const now = new Date().toISOString();
    const newSupp: Supplier = {
      id: `supp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      supplier_code: `SUPP-${Math.floor(1000 + Math.random() * 9000)}`,
      name: dto.name,
      phone: dto.phone,
      alternate_phone: dto.alternate_phone || null,
      email: dto.email || null,
      address: dto.address || null,
      notes: dto.notes || null,
      credit_limit: dto.credit_limit ?? 0,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    suppliers.unshift(newSupp);
    saveStoredWebSuppliers(suppliers);
    return newSupp;
  },

  async supplierUpdate(id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Supplier>('supplier_update', { id, dto });
    }
    const suppliers = getStoredWebSuppliers();
    const idx = suppliers.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Supplier not found: ${id}`);
    const existing = suppliers[idx];
    const updated: Supplier = {
      ...existing,
      name: dto.name ?? existing.name,
      phone: dto.phone ?? existing.phone,
      alternate_phone: dto.alternate_phone !== undefined ? dto.alternate_phone : existing.alternate_phone,
      email: dto.email !== undefined ? dto.email : existing.email,
      address: dto.address !== undefined ? dto.address : existing.address,
      notes: dto.notes !== undefined ? dto.notes : existing.notes,
      credit_limit: dto.credit_limit !== undefined && dto.credit_limit !== null ? dto.credit_limit : existing.credit_limit,
      is_active: dto.is_active !== undefined && dto.is_active !== null ? dto.is_active : existing.is_active,
      updated_at: new Date().toISOString(),
    };
    suppliers[idx] = updated;
    saveStoredWebSuppliers(suppliers);
    return updated;
  },

  async supplierGetById(id: string): Promise<Supplier | null> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Supplier | null>('supplier_get_by_id', { id });
    }
    const suppliers = getStoredWebSuppliers();
    return suppliers.find((s) => s.id === id) || null;
  },

  async supplierGetDetail(id: string): Promise<SupplierDetailDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SupplierDetailDto>('supplier_get_detail', { id });
    }
    const supplier = await this.supplierGetById(id);
    if (!supplier) throw new Error(`Supplier not found: ${id}`);
    return {
      supplier,
      outstanding_balance: 0,
      recent_purchases: [],
      recent_payments: [],
    };
  },

  async supplierList(filter?: SupplierFilter): Promise<SupplierSummaryDto[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SupplierSummaryDto[]>('supplier_list', { filter });
    }
    const suppliers = getStoredWebSuppliers();
    let filtered = suppliers.filter((s) => s.is_active);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.phone.includes(q) ||
          s.supplier_code.toLowerCase().includes(q)
      );
    }
    return filtered.map((s) => ({
      id: s.id,
      supplier_code: s.supplier_code,
      name: s.name,
      phone: s.phone,
      credit_limit: s.credit_limit,
      outstanding_balance: 0,
      is_active: s.is_active,
    }));
  },

  async supplierSearch(query: string): Promise<SupplierSummaryDto[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SupplierSummaryDto[]>('supplier_search', { query });
    }
    const suppliers = getStoredWebSuppliers();
    const q = (query || '').toLowerCase();
    return suppliers
      .filter(
        (s) =>
          s.is_active &&
          (s.name.toLowerCase().includes(q) ||
            s.phone.includes(q) ||
            s.supplier_code.toLowerCase().includes(q))
      )
      .map((s) => ({
        id: s.id,
        supplier_code: s.supplier_code,
        name: s.name,
        phone: s.phone,
        credit_limit: s.credit_limit,
        outstanding_balance: 0,
        is_active: s.is_active,
      }));
  },

  async supplierGetBalance(supplierId: string): Promise<number> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<number>('supplier_get_balance', { supplierId });
    }
    return 0;
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
      return;
    }
    const suppliers = getStoredWebSuppliers();
    const idx = suppliers.findIndex((s) => s.id === id);
    if (idx !== -1) {
      suppliers[idx].is_active = false;
      suppliers[idx].updated_at = new Date().toISOString();
      saveStoredWebSuppliers(suppliers);
    }
  },

  // ── Sales & Checkout Domain (Phase 4B Typed Storage Bridge) ───────────────
  async saleComplete(dto: CompleteSaleDto): Promise<SaleResultDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SaleResultDto>('storage_sale_complete', { dto });
    }
    const now = new Date().toISOString();
    const invoiceNum = `INV-${Math.floor(100000 + Math.random() * 900000)}`;
    const saleId = `sale_${Date.now()}`;

    let subtotal = 0;
    const lines: SaleLine[] = [];
    const products = getStoredWebProducts();
    const stockMap = getStoredWebStockMap();

    (dto.items || []).forEach((item, idx) => {
      const prod = products.find((p) => p.id === item.product_id);
      const unitPrice = (item as any).unit_price ?? (item as any).price ?? (prod ? prod.sale_price : 1000);
      const costPrice = prod ? (prod.purchase_price || prod.average_cost || 800) : 800;
      const lineDisc = item.discount || 0;
      const lineTotal = Math.max(0, unitPrice * item.quantity - lineDisc);
      subtotal += lineTotal;

      lines.push({
        id: `line_${saleId}_${idx + 1}`,
        sale_id: saleId,
        product_id: item.product_id,
        product_name_snapshot: prod ? prod.name : `Product ${item.product_id}`,
        sku_snapshot: prod ? prod.sku : `SKU-${idx + 1}`,
        unit_price: unitPrice,
        cost_price_snapshot: costPrice,
        quantity: item.quantity,
        discount: lineDisc,
        line_total: lineTotal,
        created_at: now,
      });

      if (stockMap[item.product_id] !== undefined) {
        stockMap[item.product_id] = Math.max(0, (stockMap[item.product_id] || 0) - item.quantity);
      }
    });

    saveStoredWebStockMap(stockMap);

    const extraDisc = dto.discount || 0;
    const totalAmount = Math.max(0, subtotal - extraDisc);
    const paidAmount = dto.paid_amount !== null && dto.paid_amount !== undefined ? dto.paid_amount : totalAmount;
    const changeAmount = Math.max(0, paidAmount - totalAmount);

    let paymentStatus: PaymentStatus = 'PAID';
    if (paidAmount === 0 && totalAmount > 0) {
      paymentStatus = 'UNPAID';
    } else if (paidAmount < totalAmount) {
      paymentStatus = 'PARTIALLY_PAID';
    }

    const saleRecord: Sale = {
      id: saleId,
      invoice_number: invoiceNum,
      branch_id: dto.branch_id || '00000000-0000-0000-0000-000000000002',
      customer_id: dto.customer_id || null,
      customer_name_snapshot: dto.customer_id ? 'Customer' : 'Walk-in Customer',
      subtotal,
      discount: extraDisc,
      tax_amount: 0,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      change_amount: changeAmount,
      payment_status: paymentStatus,
      sale_status: 'COMPLETED',
      performed_by: 'Cashier',
      notes: dto.notes || null,
      created_at: now,
      updated_at: now,
    };

    const payments: SalePayment[] = [
      {
        id: `pay_${saleId}_1`,
        sale_id: saleId,
        amount: paidAmount,
        payment_method: dto.payment_method || 'cash',
        reference_number: null,
        notes: null,
        created_at: now,
      },
    ];

    const cogs = lines.reduce((acc, l) => acc + l.cost_price_snapshot * l.quantity, 0);
    const grossProfit = totalAmount - cogs;
    const grossMargin = totalAmount > 0 ? (grossProfit / totalAmount) * 100 : 0;

    const storedSales = getStoredWebSales();
    storedSales.unshift({ sale: saleRecord, lines, payments });
    saveStoredWebSales(storedSales);

    return {
      sale: saleRecord,
      lines,
      payments,
      credit_amount: paymentStatus === 'UNPAID' || paymentStatus === 'PARTIALLY_PAID' ? totalAmount - paidAmount : 0,
      customer_balance_after: null,
      cogs,
      gross_profit: grossProfit,
      gross_margin: grossMargin,
    };
  },

  async saleGetById(id: string): Promise<Sale | null> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Sale | null>('storage_sale_get_by_id', { id });
    }
    const stored = getStoredWebSales();
    const found = stored.find((s) => s.sale.id === id);
    return found ? found.sale : null;
  },

  async saleGetByInvoice(invoiceNumber: string): Promise<Sale | null> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Sale | null>('storage_sale_get_by_invoice', { invoiceNumber });
    }
    const stored = getStoredWebSales();
    const found = stored.find((s) => s.sale.invoice_number.toLowerCase() === invoiceNumber.toLowerCase());
    return found ? found.sale : null;
  },

  async saleList(filter?: SaleFilterDto): Promise<Sale[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Sale[]>('storage_sale_list', { filter });
    }
    let list = getStoredWebSales().map((s) => s.sale);
    if (filter) {
      if (filter.customer_id) {
        list = list.filter((s) => s.customer_id === filter.customer_id);
      }
      if (filter.payment_status) {
        list = list.filter((s) => s.payment_status === filter.payment_status);
      }
      if (filter.sale_status) {
        list = list.filter((s) => s.sale_status === filter.sale_status);
      }
      if (filter.start_date) {
        list = list.filter((s) => {
          if (!s.created_at) return true;
          const d = new Date(s.created_at);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          return dateStr >= filter.start_date!;
        });
      }
      if (filter.end_date) {
        list = list.filter((s) => {
          if (!s.created_at) return true;
          const d = new Date(s.created_at);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          return dateStr <= filter.end_date!;
        });
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        list = list.filter(
          (s) =>
            s.invoice_number.toLowerCase().includes(q) ||
            (s.customer_name_snapshot && s.customer_name_snapshot.toLowerCase().includes(q))
        );
      }
      if (filter.offset) {
        list = list.slice(filter.offset);
      }
      if (filter.limit) {
        list = list.slice(0, filter.limit);
      }
    }
    return list;
  },

  async saleGetLines(saleId: string): Promise<SaleLine[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SaleLine[]>('storage_sale_get_lines', { saleId });
    }
    const stored = getStoredWebSales();
    const found = stored.find((s) => s.sale.id === saleId);
    return found ? found.lines : [];
  },

  async saleGetPayments(saleId: string): Promise<SalePayment[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SalePayment[]>('storage_sale_get_payments', { saleId });
    }
    const stored = getStoredWebSales();
    const found = stored.find((s) => s.sale.id === saleId);
    return found ? found.payments : [];
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

  async expenseCancel(id: string, _reason?: string): Promise<Expense> {
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

  // ── Returns & Stock Reversal Domain (Phase 18) ─────────────────────────────
  async salesReturnGetReturnable(saleId: string): Promise<SaleReturnableInfoDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SaleReturnableInfoDto>('sales_return_get_returnable', { saleId });
    }
    throw new Error('Tauri environment required');
  },

  async salesReturnCreate(dto: CreateSalesReturnDto): Promise<SalesReturnResultDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SalesReturnResultDto>('sales_return_create', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async salesReturnGet(id: string): Promise<SalesReturnDetailDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SalesReturnDetailDto>('sales_return_get', { id });
    }
    throw new Error('Tauri environment required');
  },

  async salesReturnList(filter?: SalesReturnFilterDto): Promise<SalesReturn[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SalesReturn[]>('sales_return_list', { filter });
    }
    return [];
  },

  async salesReturnGetBySale(saleId: string): Promise<SalesReturn[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SalesReturn[]>('sales_return_get_by_sale', { saleId });
    }
    return [];
  },

  async purchaseReturnGetReturnable(purchaseId: string): Promise<PurchaseReturnableInfoDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<PurchaseReturnableInfoDto>('purchase_return_get_returnable', { purchaseId });
    }
    throw new Error('Tauri environment required');
  },

  async purchaseReturnCreate(dto: CreatePurchaseReturnDto): Promise<PurchaseReturnResultDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<PurchaseReturnResultDto>('purchase_return_create', { dto });
    }
    throw new Error('Tauri environment required');
  },

  async purchaseReturnGet(id: string): Promise<PurchaseReturnDetailDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<PurchaseReturnDetailDto>('purchase_return_get', { id });
    }
    throw new Error('Tauri environment required');
  },

  async purchaseReturnList(filter?: PurchaseReturnFilterDto): Promise<PurchaseReturn[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<PurchaseReturn[]>('purchase_return_list', { filter });
    }
    return [];
  },

  async purchaseReturnGetByPurchase(purchaseId: string): Promise<PurchaseReturn[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<PurchaseReturn[]>('purchase_return_get_by_purchase', { purchaseId });
    }
    return [];
  },

  // ── Profitability & COGS (Phase 20) ─────────────────────────────────────────
  async profitGetPeriod(
    startDate?: string | null,
    endDate?: string | null,
    branchId?: string | null
  ): Promise<PeriodProfitabilityDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<PeriodProfitabilityDto>('profit_get_period', {
        startDate: startDate || null,
        endDate: endDate || null,
        branchId: branchId || null,
      });
    }
    return {
      start_date: startDate || null,
      end_date: endDate || null,
      gross_revenue: 0,
      discounts: 0,
      net_revenue: 0,
      cogs: 0,
      gross_profit: 0,
      gross_margin: 0,
      sales_count: 0,
      returns_count: 0,
    };
  },

  async profitGetDaily(
    startDate?: string | null,
    endDate?: string | null,
    branchId?: string | null
  ): Promise<DailyProfitabilityDto[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<DailyProfitabilityDto[]>('profit_get_daily', {
        startDate: startDate || null,
        endDate: endDate || null,
        branchId: branchId || null,
      });
    }
    return [];
  },

  async profitGetProduct(
    productId?: string | null,
    startDate?: string | null,
    endDate?: string | null,
    branchId?: string | null
  ): Promise<ProductProfitabilityDto[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ProductProfitabilityDto[]>('profit_get_product', {
        productId: productId || null,
        startDate: startDate || null,
        endDate: endDate || null,
        branchId: branchId || null,
      });
    }
    return [];
  },

  async profitGetSale(saleId: string): Promise<SaleProfitabilityDto | null> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SaleProfitabilityDto | null>('profit_get_sale', { saleId });
    }
    return null;
  },

  async profitGetDashboardSummary(branchId?: string | null): Promise<DashboardProfitSummaryDto> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<DashboardProfitSummaryDto>('profit_get_dashboard_summary', {
        branchId: branchId || null,
      });
    }
    const sales = getStoredWebSales();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const calcMetrics = (filterFn: (s: StoredWebSale) => boolean): ProfitMetricsDto => {
      const matches = sales.filter((s) => s.sale && s.sale.sale_status === 'COMPLETED' && filterFn(s));
      let gross_revenue = 0;
      let discounts = 0;
      let net_revenue = 0;
      let cogs = 0;

      for (const item of matches) {
        const s = item.sale;
        gross_revenue += s.subtotal || 0;
        discounts += s.discount || 0;
        net_revenue += s.total_amount || 0;
        if (item.lines && item.lines.length > 0) {
          for (const line of item.lines) {
            cogs += (line.cost_price_snapshot || 0) * (line.quantity || 1);
          }
        }
      }

      const gross_profit = net_revenue - cogs;
      const gross_margin = net_revenue > 0 ? (gross_profit / net_revenue) * 100 : 0;

      return {
        gross_revenue,
        discounts,
        net_revenue,
        cogs,
        gross_profit,
        gross_margin,
        orders_count: matches.length,
      };
    };

    return {
      today: calcMetrics((s) => (s.sale.created_at || '').startsWith(todayStr)),
      this_month: calcMetrics((s) => (s.sale.created_at || '').startsWith(thisMonthStr)),
      total: calcMetrics(() => true),
    };
  },

  // ── Sync Engine Commands ───────────────────────────────────────────────────
  async syncGetStatus(): Promise<SyncEngineStatus> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SyncEngineStatus>('sync_get_status');
    }
    return { pending_count: 0, is_online: true, is_syncing: false };
  },

  async syncTriggerNow(): Promise<SyncEngineStatus> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SyncEngineStatus>('sync_trigger_now');
    }
    return { pending_count: 0, is_online: true, is_syncing: false };
  },

  async syncListConflicts(limit?: number): Promise<SyncQueueItem[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SyncQueueItem[]>('sync_list_conflicts', { limit });
    }
    return [];
  },

  async syncListFailed(limit?: number): Promise<SyncQueueItem[]> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SyncQueueItem[]>('sync_list_failed', { limit });
    }
    return [];
  },

  async syncRetryFailedItem(clientEventId: string): Promise<SyncQueueItem> {
    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SyncQueueItem>('sync_retry_failed_item', { clientEventId });
    }
    throw new Error('Sync queue retry requires native Tauri environment');
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

// ── Type Definitions for Returns & Stock Reversal (Phase 18) ──────────────────
export type SalesRefundMethod = 'CASH' | 'CUSTOMER_CREDIT';
export type PurchaseSettlementMethod = 'CASH' | 'SUPPLIER_CREDIT';
export type ReturnStatus = 'COMPLETED' | 'CANCELLED';

export interface SalesReturn {
  id: string;
  return_number: string;
  sale_id: string;
  branch_id: string;
  customer_id: string | null;
  customer_name_snapshot: string | null;
  total_amount: number;
  refund_method: SalesRefundMethod;
  status: ReturnStatus;
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
  refund_method: string;
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

export interface PurchaseReturn {
  id: string;
  return_number: string;
  purchase_id: string;
  branch_id: string;
  supplier_id: string | null;
  supplier_name_snapshot: string | null;
  total_amount: number;
  settlement_method: PurchaseSettlementMethod;
  status: ReturnStatus;
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

// ── Type Definitions for Profitability & COGS (Phase 20) ─────────────────────
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

export interface DashboardProfitSummaryDto {
  today: ProfitMetricsDto;
  this_month: ProfitMetricsDto;
  total: ProfitMetricsDto;
}

export interface SyncEngineStatus {
  pending_count: number;
  is_online: boolean;
  is_syncing: boolean;
  is_auth_paused?: boolean;
  conflict_count?: number;
  failed_count?: number;
  last_synced_at?: string;
  last_error?: string;
}

export interface SyncQueueItem {
  id: string;
  client_event_id: string;
  terminal_id: string;
  organization_id: string;
  branch_id: string;
  event_type: string;
  payload: string;
  status: 'PENDING' | 'SYNCING' | 'FAILED' | 'SYNCED' | 'CONFLICT' | 'FAILED_PERMANENT';
  attempt_count: number;
  last_error?: string | null;
  last_attempt_at?: string | null;
  server_event_id?: string | null;
  created_at: string;
  updated_at: string;
}
