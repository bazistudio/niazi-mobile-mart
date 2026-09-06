// /lib/auth/core/auth.session.ts

import { AuthSession } from "@/types/auth/session";

const SESSION_KEY = "niazi_session";
const LEGACY_SESSION_KEY = "tijarat_session";

/**
 * Save session securely in browser storage
 */
export function setSession(session: AuthSession) {
  if (typeof window === "undefined") return;

  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Get current session
 */
export function getSession(): AuthSession | null {
  if (typeof window === "undefined") return null;

  const data = localStorage.getItem(SESSION_KEY) || localStorage.getItem(LEGACY_SESSION_KEY);
  if (!data) return null;

  try {
    return JSON.parse(data) as AuthSession;
  } catch {
    return null;
  }
}

/**
 * Clear session (logout)
 */
export function clearSession() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LEGACY_SESSION_KEY);
}

/**
 * Check if session is valid (expiry check)
 */
export function isSessionValid(session: AuthSession | null): boolean {
  if (!session) return false;

  return session.expiresAt > Date.now();
}

// Removed getAccessToken and getRefreshToken to prevent mixed sources of truth

/**
 * Get device ID (Browser safe)
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";

  let deviceId = localStorage.getItem("niazi_device_id") || localStorage.getItem("tijarat_device_id");

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("niazi_device_id", deviceId);
  }

  return deviceId;
}

/**
 * Update session expiry (used after refresh)
 */
export function updateSessionExpiry(expiresAt: number) {
  const session = getSession();

  if (!session) return;

  const updated: AuthSession = {
    ...session,
    expiresAt,
  };

  setSession(updated);
}