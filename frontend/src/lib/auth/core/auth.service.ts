// /lib/auth/core/auth.service.ts
//
// SINGLE CLIENT-SIDE AUTHENTICATION AUTHORITY
// Orchestrates login, logout, token persistence, and startup hydration.
// Exclusively uses the Central Axum API.

import { AuthUser } from "@/types/auth/auth";
import { AuthSession } from "@/types/auth/session";
import { setSession, getSession, getAuthToken, clearSession, isSessionValid, getDeviceId } from "./auth.session";
import { useAuthStore } from "./auth.store";
import { getApiBaseUrl } from "@/lib/tauri/tauriClient";

export class AuthService {
  /**
   * Single authoritative entry point for user login.
   * Central API HTTP Only.
   */
  static async login(identifier: string, password: string): Promise<{ user: AuthUser; token: string; session: AuthSession }> {
    const apiBaseUrl = getApiBaseUrl() || "http://localhost:8080";
    
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
    throw new Error("Unknown login error occurred");
  }

  /**
   * Single point of Logout orchestration.
   */
  static async logout(): Promise<void> {
    const token = getAuthToken();
    const apiBaseUrl = getApiBaseUrl();

    if (token && apiBaseUrl) {
      try {
        const url = `${apiBaseUrl}/api/auth/logout`;
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
    // Browser Mode Hydration (and desktop now relies on this purely)
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
   * Retrieves current authenticated profile via Central Axum API.
   */
  static async getMeUser(): Promise<AuthUser | null> {
    const token = getAuthToken();
    if (!token) return null;
    const apiBaseUrl = getApiBaseUrl() || "http://localhost:8080";

    try {
      const url = `${apiBaseUrl}/api/auth/me`;
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
