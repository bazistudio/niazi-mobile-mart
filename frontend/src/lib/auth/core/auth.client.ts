// /lib/auth/core/auth.client.ts

import axiosInstance from "@/lib/api/axios";
import { AuthUser } from "@/types/auth/auth";
import { AuthSession } from "@/types/auth/session";
import { getDeviceId, setSession, clearSession } from "./auth.session";
import { isTauriEnvironment, tauriClient } from "@/lib/tauri/tauriClient";

export interface LoginResponse {
  user: AuthUser;
  token: string;
  refreshToken?: string;
  expiresIn?: number; // seconds
}

// ─── Cookie helpers (for browser dev fallback) ──────────────────────────────

function setTokenCookie(token: string, expiresIn: number) {
  if (typeof document === "undefined") return;
  document.cookie = `tp_token=${token}; path=/; max-age=${expiresIn}; SameSite=Lax`;
}

function clearTokenCookie() {
  if (typeof document === "undefined") return;
  document.cookie = "tp_token=; path=/; max-age=0; SameSite=Lax";
}

// ─── Main login ─────────────────────────────────────────────────────────────

/**
 * MAIN LOGIN FUNCTION (CORE ENTRY POINT)
 * In Tauri desktop mode: routes directly to native Rust auth commands.
 * In browser mode: falls back to HTTP API.
 */
export async function loginUser(identifier: string, password: string) {
  if (isTauriEnvironment()) {
    const res = await tauriClient.authLogin(identifier, password);

    const user: AuthUser = {
      id: res.user.id,
      name: res.user.name,
      email: `${res.user.username}@local`,
      role: res.user.role as any,
      status: res.user.is_active ? "active" : "suspended",
      permissions: res.user.access_profile.allowed_actions,
      createdAt: res.user.created_at,
    };

    const session: AuthSession = {
      expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
      deviceId: "native-desktop",
      user,
    };

    setSession(session);

    return {
      user,
      token: "native-tauri-session",
      session,
    };
  }

  // Web Browser Fallback
  const res = await axiosInstance.post("/api/v1/auth/login", {
    email: identifier,
    password,
    deviceId: getDeviceId(),
  });

  const data: LoginResponse = res.data.data;

  if (!data?.token || !data?.user) {
    throw new Error("Invalid login response");
  }

  const expiresIn = data.expiresIn ?? 3600;
  const expiresAt = Date.now() + expiresIn * 1000;

  const session: AuthSession = {
    expiresAt,
    deviceId: getDeviceId(),
    user: data.user,
  };

  setSession(session);
  setTokenCookie(data.token, expiresIn);

  return {
    user: data.user,
    token: data.token,
    session,
  };
}

// ─── Logout ─────────────────────────────────────────────────────────────────

/**
 * LOGOUT FUNCTION
 */
export function logoutUser() {
  clearSession();
  clearTokenCookie();
  if (isTauriEnvironment()) {
    tauriClient.authLogout().catch(console.error);
  }
}

/**
 * GET ME (fetch current user via Tauri or cookie)
 */
export async function getMeUser() {
  if (isTauriEnvironment()) {
    const rawUser = await tauriClient.getCurrentUser();
    if (!rawUser) return null;

    return {
      id: rawUser.id,
      name: rawUser.name,
      email: `${rawUser.username}@local`,
      role: rawUser.role as any,
      status: rawUser.is_active ? "active" : "suspended",
      permissions: rawUser.access_profile.allowed_actions,
      createdAt: rawUser.created_at,
    };
  }

  const res = await axiosInstance.get("/api/v1/auth/me");
  return res.data.data;
}