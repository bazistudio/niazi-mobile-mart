// /lib/auth/core/auth.client.ts

import { AuthUser } from "@/types/auth/auth";
import { AuthSession } from "@/types/auth/session";
import { setSession, clearSession, getAuthToken, getDeviceId } from "./auth.session";
import { isTauriEnvironment, tauriClient, getApiBaseUrl } from "@/lib/tauri/tauriClient";

// ─── Main login ─────────────────────────────────────────────────────────────

/**
 * MAIN LOGIN FUNCTION (CORE ENTRY POINT)
 * In Tauri desktop mode: routes directly to native Rust auth commands.
 * In Browser HTTP mode: routes to Axum /api/auth/login and stores JWT.
 */
export async function loginUser(identifier: string, password: string) {
  const apiBaseUrl = getApiBaseUrl();

  // 1. If Central API base URL is configured, use Central HTTP API
  if (apiBaseUrl) {
    let response: Response | null = null;
    let netError: Error | null = null;

    try {
      const url = `${apiBaseUrl}/api/v1/auth/login`;
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: identifier,
          password: password,
        }),
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
        } catch {
          // Ignore JSON parse error
        }
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

      // Native Rust Session Establishment when running inside Tauri Desktop shell
      if (isTauriEnvironment()) {
        const localUsername = rawUser?.username || identifier;
        let nativeSuccess = false;

        try {
          await tauriClient.authLoginSnapshot(localUsername, password);
          nativeSuccess = true;
        } catch {
          try {
            await tauriClient.authLogin(localUsername, password);
            nativeSuccess = true;
          } catch (nativeErr: any) {
            console.warn("[loginUser] Native local desktop session sync warning:", nativeErr?.message || nativeErr);
          }
        }

        if (nativeSuccess) {
          // Attach Central JWT as active_token on the newly authenticated native session
          await tauriClient.authSyncSession(token).catch(() => {});
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
      }

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

    // Network error connecting to Central API in Tauri environment -> fallback to local snapshot authentication
    if (netError && isTauriEnvironment()) {
      try {
        const snapshotRes = await tauriClient.authLoginSnapshot(identifier, password);
        const existingToken = getAuthToken();
        if (existingToken && existingToken !== "native-tauri-session") {
          await tauriClient.authSyncSession(existingToken).catch(() => {});
        }

        const user: AuthUser = {
          id: snapshotRes.user.id,
          name: snapshotRes.user.name,
          username: snapshotRes.user.username,
          email: `${snapshotRes.user.username}@local`,
          role: (snapshotRes.user.role ? snapshotRes.user.role.toUpperCase() : "STAFF") as any,
          status: (snapshotRes.user.status ? snapshotRes.user.status.toLowerCase() : (snapshotRes.user.is_active ? "active" : "suspended")) as any,
          mustChangePassword: snapshotRes.user.must_change_password,
          permissions: snapshotRes.user.access_profile ? snapshotRes.user.access_profile.allowed_actions : [],
          createdAt: snapshotRes.user.created_at,
        };

        const session: AuthSession = {
          expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
          deviceId: "native-desktop",
          user,
          token: existingToken || "native-tauri-session",
        };

        setSession(session);

        return {
          user,
          token: existingToken || "native-tauri-session",
          session,
        };
      } catch {
        throw new Error("Central server unreachable and local authentication snapshot rejected");
      }
    }

    if (netError) {
      throw netError;
    }
  }

  // 2. Fallback to native Tauri IPC only when API base URL is unset (local SQLite dev mode)
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

  // Fallback Web Mode
  const url = `/api/v1/auth/login`;
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
export async function getMeUser(): Promise<AuthUser | null> {
  if (isTauriEnvironment()) {
    const rawUser = await tauriClient.getCurrentUser();
    if (!rawUser) return null;

    return {
      id: rawUser.id,
      name: rawUser.name,
      username: rawUser.username,
      email: `${rawUser.username}@local`,
      role: (rawUser.role ? rawUser.role.toUpperCase() : "STAFF") as any,
      status: (rawUser.status ? rawUser.status.toLowerCase() : (rawUser.is_active ? "active" : "suspended")) as AuthUser["status"],
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
      role: (identity.role ? identity.role.toUpperCase() : "STAFF") as any,
      status: "active" as const,
      mustChangePassword: false,
      permissions: [],
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * LOCAL SNAPSHOT / PIN LOGIN FUNCTION
 * Authenticates directly against SQLite local_auth_snapshot in native Tauri desktop environment.
 */
export async function loginUserWithSnapshot(username: string, pin: string) {
  if (!isTauriEnvironment()) {
    throw new Error("Local snapshot PIN login is supported in native desktop mode only.");
  }

  const res = await tauriClient.authLoginSnapshot(username, pin);

  // Attach stored Central JWT to native session if available
  const existingToken = getAuthToken();
  if (existingToken && existingToken !== "native-tauri-session") {
    await tauriClient.authSyncSession(existingToken).catch(() => {});
  }

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
    token: existingToken || "native-tauri-session",
  };

  setSession(session);

  return {
    user,
    token: existingToken || "native-tauri-session",
    session,
  };
}