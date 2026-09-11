// /lib/auth/core/auth.client.ts

import { AuthUser } from "@/types/auth/auth";
import { AuthSession } from "@/types/auth/session";
import { setSession, clearSession, getAuthToken, getDeviceId } from "./auth.session";
import { isTauriEnvironment, tauriClient } from "@/lib/tauri/tauriClient";

export interface LoginResponse {
  user: AuthUser;
  token: string;
  refreshToken?: string;
  expiresIn?: number; // seconds
}

const getApiBaseUrl = (): string => {
  if (typeof window !== "undefined" && (window as any).__API_BASE_URL__) {
    return (window as any).__API_BASE_URL__;
  }
  return (import.meta as any).env?.VITE_API_BASE_URL || "";
};

// ─── Main login ─────────────────────────────────────────────────────────────

/**
 * MAIN LOGIN FUNCTION (CORE ENTRY POINT)
 * In Tauri desktop mode: routes directly to native Rust auth commands.
 * In Browser HTTP mode: routes to Axum /api/auth/login and stores JWT.
 */
export async function loginUser(identifier: string, password: string) {
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

    return {
      user,
      token: "native-tauri-session",
      session,
    };
  }

  // Web Browser HTTP Mode against Axum API
  const url = `${getApiBaseUrl()}/api/auth/login`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: identifier,
      password: password,
    }),
  });

  if (!response.ok) {
    let errMessage = "Invalid credentials or login failure";
    try {
      const errData = await response.json();
      if (errData && errData.message) {
        errMessage = errData.message;
      }
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(errMessage);
  }

  const data = await response.json();
  const rawUser = data.user;
  const token = data.token;

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

  const session: AuthSession = {
    expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
    deviceId: getDeviceId(),
    user,
    token: token,
  };

  setSession(session);

  return {
    user,
    token,
    session,
  };
}

// ─── Logout ─────────────────────────────────────────────────────────────────

/**
 * LOGOUT FUNCTION
 */
export function logoutUser() {
  const token = getAuthToken();
  clearSession();

  if (isTauriEnvironment()) {
    tauriClient.authLogout().catch(console.error);
  } else if (token) {
    const url = `${getApiBaseUrl()}/api/auth/logout`;
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).catch(console.error);
  }
}

/**
 * GET ME (fetch current user via Tauri or Axum /api/auth/me)
 */
export async function getMeUser() {
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
      headers: {
        Authorization: `Bearer ${token}`,
      },
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
      role: identity.role ? identity.role.toUpperCase() : "STAFF",
      status: "active",
      mustChangePassword: false,
      permissions: [],
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}