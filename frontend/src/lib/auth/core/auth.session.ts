// /lib/auth/core/auth.session.ts

import { AuthSession } from "@/types/auth/session";

const SESSION_KEY = "tijarat_session";

/**
 * Save session securely in browser/Electron storage
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

  const data = localStorage.getItem(SESSION_KEY);
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
 * Get device ID (Electron + browser safe)
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";

  let deviceId = localStorage.getItem("tijarat_device_id");

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("tijarat_device_id", deviceId);
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