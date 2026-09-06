// /lib/auth/core/auth.client.ts

import { AuthUser } from "@/types/auth/auth";
import { AuthSession } from "@/types/auth/session";
import { setSession, clearSession } from "./auth.session";
import { isTauriEnvironment, tauriClient } from "@/lib/tauri/tauriClient";

export interface LoginResponse {
  user: AuthUser;
  token: string;
  refreshToken?: string;
  expiresIn?: number; // seconds
}

// ─── Main login ─────────────────────────────────────────────────────────────

/**
 * MAIN LOGIN FUNCTION (CORE ENTRY POINT)
 * In Tauri desktop mode: routes directly to native Rust auth commands.
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

  throw new Error("Desktop application requires Tauri runtime environment. Please launch via native desktop app.");
}

// ─── Logout ─────────────────────────────────────────────────────────────────

/**
 * LOGOUT FUNCTION
 */
export function logoutUser() {
  clearSession();
  if (isTauriEnvironment()) {
    tauriClient.authLogout().catch(console.error);
  }
}

/**
 * GET ME (fetch current user via Tauri)
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
      permissions: rawUser.access_profile.allowed_actions,
      createdAt: rawUser.created_at,
    };
  }

  return null;
}