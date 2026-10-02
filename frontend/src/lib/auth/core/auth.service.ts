// /lib/auth/core/auth.service.ts
//
// SINGLE CLIENT-SIDE AUTHENTICATION AUTHORITY (PHASE 2A)
// Orchestrates login, logout, token persistence, and startup hydration.
// Enforces fail-closed desktop session synchronization and browser/desktop parity.

import { AuthUser } from "@/types/auth/auth";
import { AuthSession } from "@/types/auth/session";
import { setSession, getSession, getAuthToken, clearSession, isSessionValid, getDeviceId } from "./auth.session";
import { useAuthStore } from "./auth.store";
import { isTauriEnvironment, tauriClient, getApiBaseUrl } from "@/lib/tauri/tauriClient";

export class AuthService {
  /**
   * Single authoritative entry point for user login.
   * Central API HTTP + Tauri Native Sync with FAIL-CLOSED guarantee.
   */
  static async login(identifier: string, password: string): Promise<{ user: AuthUser; token: string; session: AuthSession }> {
    const apiBaseUrl = getApiBaseUrl();

    // 1. Central API HTTP Mode
    if (apiBaseUrl) {
      let response: Response | null = null;
      let netError: Error | null = null;

      try {
        const url = `${apiBaseUrl}/api/v1/auth/login`;
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: identifier, password: password }),
        });
      } catch (err: any) {
        netError = err;
      }

      if (response) {
        if (!response.ok) {
          let errMessage = "Invalid credentials or central authentication failure";
          try {
            const errData = await response.json();
            if (errData && errData.message) {
              errMessage = errData.message;
            }
          } catch {}
          throw new Error(errMessage);
        }

        const data = await response.json();
        const rawUser = data.user;
        const token = data.token;

        let user: AuthUser = {
          id: rawUser.id,
          name: rawUser.name,
          username: rawUser.username,
          email: `${rawUser.username}@local`,
          role: (rawUser.role ? rawUser.role.toUpperCase() : "STAFF") as any,
          status: (rawUser.status ? rawUser.status.toLowerCase() : (rawUser.is_active ? "active" : "suspended")) as any,
          mustChangePassword: rawUser.must_change_password,
          permissions: rawUser.access_profile ? rawUser.access_profile.allowed_actions : [],
          createdAt: rawUser.created_at,
        };

        // Strict Desktop Session Synchronization (FAILS CLOSED ON ERROR)
        if (isTauriEnvironment()) {
          // 1. Establish Native Online Session via JWT
          try {
            await tauriClient.authSyncSession(token);
          } catch (syncErr: any) {
            // FAIL CLOSED: Do not swallow native auth error!
            throw new Error(`Central login succeeded but native desktop session synchronization failed: ${syncErr?.message || syncErr}`);
          }


          const nativeUser = await tauriClient.getCurrentUser();
          if (nativeUser) {
              user = {
                id: nativeUser.id,
                name: nativeUser.name,
                username: nativeUser.username,
                email: `${nativeUser.username}@local`,
                role: (nativeUser.role ? nativeUser.role.toUpperCase() : "STAFF") as any,
                status: (nativeUser.status ? nativeUser.status.toLowerCase() : (nativeUser.is_active ? "active" : "suspended")) as any,
                mustChangePassword: nativeUser.must_change_password,
                permissions: nativeUser.access_profile ? nativeUser.access_profile.allowed_actions : [],
                createdAt: nativeUser.created_at,
              };
            }
          }

        const session: AuthSession = {
          expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
          deviceId: getDeviceId(),
          user,
          token: token,
        };

        // Single Point of Session Persistence & UI State Update
        setSession(session);
        useAuthStore.getState().setAuth(user, session);

        return { user, token, session };
      }


      if (netError) {
        throw netError;
      }
    }

    // 2. Native Tauri IPC Local Dev Mode (when apiBaseUrl is unset)
    if (isTauriEnvironment()) {
      const res = await tauriClient.authLogin(identifier, password);

      const user: AuthUser = {
        id: res.user.id,
        name: res.user.name,
        username: res.user.username,
        email: `${res.user.username}@local`,
        role: (res.user.role ? res.user.role.toUpperCase() : "STAFF") as any,
        status: (res.user.status ? res.user.status.toLowerCase() : (res.user.is_active ? "active" : "suspended")) as any,
        mustChangePassword: res.user.must_change_password,
        permissions: res.user.access_profile ? res.user.access_profile.allowed_actions : [],
        createdAt: res.user.created_at,
      };

      const session: AuthSession = {
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        deviceId: "native-desktop",
        user,
        token: "native-tauri-session",
      };

      setSession(session);
      useAuthStore.getState().setAuth(user, session);

      return { user, token: "native-tauri-session", session };
    }

    throw new Error("No Central API URL configured and not running in native desktop shell");
  }


  /**
   * Single point of Logout orchestration.
   */
  static async logout(): Promise<void> {
    const token = getAuthToken();

    if (isTauriEnvironment()) {
      try {
        await tauriClient.authLogout();
      } catch (err) {
        console.warn("[AuthService] Tauri authLogout warning:", err);
      }
    } else if (token && getApiBaseUrl()) {
      try {
        const url = `${getApiBaseUrl()}/api/auth/logout`;
        await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.warn("[AuthService] Central API logout warning:", err);
      }
    }

    clearSession();
    useAuthStore.getState().logout();
  }

  /**
   * App boot hydration orchestrator (called once by AuthHydrator).
   */
  static async hydrate(): Promise<void> {
    if (isTauriEnvironment()) {
      try {
        const session = await tauriClient.getCurrentSession();
        const token = getAuthToken();

        if (session && session.is_authenticated && session.user_id) {
          if (token && token !== "native-tauri-session") {
            try {
              await tauriClient.authSyncSession(token);
            } catch (syncErr) {
              console.warn("[AuthService.hydrate] Non-fatal authSyncSession warning:", syncErr);
            }
          }

          const rawUser = await tauriClient.getCurrentUser();
          if (rawUser) {
            const user: AuthUser = {
              id: rawUser.id,
              name: rawUser.name,
              username: rawUser.username,
              email: `${rawUser.username}@local`,
              role: (rawUser.role ? rawUser.role.toUpperCase() : "STAFF") as any,
              status: (rawUser.status ? rawUser.status.toLowerCase() : (rawUser.is_active ? "active" : "suspended")) as any,
              mustChangePassword: rawUser.must_change_password,
              permissions: rawUser.access_profile ? rawUser.access_profile.allowed_actions : [],
              createdAt: rawUser.created_at,
            };

            const authSession: AuthSession = {
              expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
              deviceId: "native-desktop",
              user,
              token: token || undefined,
            };

            setSession(authSession);
            useAuthStore.getState().setAuth(user, authSession);
            return;
          }
        }

        useAuthStore.getState().setHydrated();
      } catch (err) {
        console.warn("[AuthService.hydrate] Failed to query native session:", err);
        useAuthStore.getState().setHydrated();
      }
      return;
    }

    // Browser Mode Hydration
    const session = getSession();
    if (session && isSessionValid(session)) {
      if (session.user) {
        useAuthStore.getState().setAuth(session.user, session);
      }

      try {
        const freshUser = await AuthService.getMeUser();
        if (freshUser) {
          useAuthStore.getState().setAuth(freshUser, session);
        }
      } catch (err: any) {
        if (err?.response?.status === 401) {
          await AuthService.logout();
        } else {
          console.warn("[AuthService.hydrate] Could not refresh user profile:", err?.message);
        }
      }
    } else {
      if (session) {
        await AuthService.logout();
      } else {
        useAuthStore.getState().setHydrated();
      }
    }
  }

  /**
   * Retrieves current authenticated profile via Tauri IPC or Central Axum API.
   */
  static async getMeUser(): Promise<AuthUser | null> {
    if (isTauriEnvironment()) {
      const rawUser = await tauriClient.getCurrentUser();
      if (!rawUser) return null;

      return {
        id: rawUser.id,
        name: rawUser.name,
        username: rawUser.username,
        email: `${rawUser.username}@local`,
        role: (rawUser.role ? rawUser.role.toUpperCase() : "STAFF") as any,
        status: (rawUser.status ? rawUser.status.toLowerCase() : (rawUser.is_active ? "active" : "suspended")) as any,
        mustChangePassword: rawUser.must_change_password,
        permissions: rawUser.access_profile ? rawUser.access_profile.allowed_actions : [],
        createdAt: rawUser.created_at,
      };
    }

    const token = getAuthToken();
    if (!token) return null;

    try {
      const url = `${getApiBaseUrl()}/api/auth/me`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return null;

      const data = await response.json();
      const identity = data.identity;
      if (!identity) return null;

      return {
        id: identity.user_id,
        name: identity.username,
        username: identity.username,
        email: `${identity.username}@local`,
        role: (identity.role ? identity.role.toUpperCase() : "STAFF") as any,
        status: "active",
        mustChangePassword: false,
        permissions: [],
        createdAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Application-facing access point for current Bearer token.
   */
  static getToken(): string | null {
    return getAuthToken();
  }

  /**
   * Returns current authenticated user or null.
   */
  static getCurrentUser(): AuthUser | null {
    return useAuthStore.getState().user || getSession()?.user || null;
  }

  /**
   * Returns boolean indicating if user is authenticated.
   */
  static isAuthenticated(): boolean {
    return useAuthStore.getState().isAuthenticated || (getSession() !== null && isSessionValid(getSession()));
  }
}
