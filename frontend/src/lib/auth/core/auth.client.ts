// /lib/auth/core/auth.client.ts

import axiosInstance from "@/lib/api/axios";
import { AuthUser } from "@/types/auth/auth";
import { AuthSession } from "@/types/auth/session";
import { getDeviceId, setSession, clearSession } from "./auth.session";

export interface LoginResponse {
  user: AuthUser;
  token: string;
  refreshToken?: string;
  expiresIn?: number; // seconds
}

// ─── Cookie helpers (needed so Next.js middleware can read tp_token) ──────────

function setTokenCookie(token: string, expiresIn: number) {
  if (typeof document === "undefined") return;
  document.cookie = `tp_token=${token}; path=/; max-age=${expiresIn}; SameSite=Lax`;
}

function clearTokenCookie() {
  if (typeof document === "undefined") return;
  document.cookie = "tp_token=; path=/; max-age=0; SameSite=Lax";
}

// ─── Main login ───────────────────────────────────────────────────────────────

/**
 * MAIN LOGIN FUNCTION (CORE ENTRY POINT)
 */
export async function loginUser(identifier: string, password: string) {
  const res = await axiosInstance.post("/api/v1/auth/login", {
    email: identifier,
    password,
    deviceId: getDeviceId(),
  });

  const data: LoginResponse = res.data.data;

  if (!data?.token || !data?.user) {
    throw new Error("Invalid login response");
  }

  // default expiry (fallback: 1 hour)
  const expiresIn = data.expiresIn ?? 3600;
  const expiresAt = Date.now() + expiresIn * 1000;

  // build session object
  const session: AuthSession = {
    expiresAt,
    deviceId: getDeviceId(),
    user: data.user,
  };

  // 1. store full session in localStorage
  setSession(session);

  // 2. set cookie so Next.js middleware can gate /dashboard
  setTokenCookie(data.token, expiresIn);

  return {
    user: data.user,
    token: data.token,
    session,
  };
}

// ─── Logout ───────────────────────────────────────────────────────────────────

/**
 * LOGOUT FUNCTION
 */
export function logoutUser() {
  clearSession();
  clearTokenCookie();
}

/**
 * GET ME (fetch current user via cookie)
 */
export async function getMeUser() {
  const res = await axiosInstance.get("/api/v1/auth/me");
  return res.data.data; // backend returns { success: true, data: { ... } }
}