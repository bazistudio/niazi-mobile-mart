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
};
