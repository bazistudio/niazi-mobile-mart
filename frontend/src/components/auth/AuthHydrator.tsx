"use client";

// /components/auth/AuthHydrator.tsx
//
// Runs once on app boot (client-side) and rehydrates the Zustand
// auth store.
// In Tauri mode: Queries the authoritative native Rust session via IPC.
// In browser mode: Rehydrates from localStorage / cookies.

import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth/core/auth.store";
import { getSession, isSessionValid, getAuthToken } from "@/lib/auth/core/auth.session";
import { getMeUser } from "@/lib/auth/core/auth.client";
import { isTauriEnvironment, tauriClient } from "@/lib/tauri/tauriClient";
import { useTerminalStore } from "@/store/useTerminalStore";
import type { AuthUser } from "@/types/auth/auth";

export default function AuthHydrator() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);
  const setHydrated = useAuthStore((s) => s.setHydrated);

  useEffect(() => {
    const hydrate = async () => {
      if (isTauriEnvironment()) {
        try {
          // 1. Query authoritative native session state from Rust first
          const session = await tauriClient.getCurrentSession();
          const token = getAuthToken();

          if (session && session.is_authenticated && session.user_id) {
            // Native session is already active. Attach stored Central JWT token if present for background SyncWorker
            if (token && token !== "native-tauri-session") {
              try {
                await tauriClient.authSyncSession(token);
              } catch (syncErr) {
                console.warn("[AuthHydrator] Non-fatal authSyncSession warning:", syncErr);
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

              setAuth(user, {
                expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
                deviceId: "native-desktop",
                user,
                token: token || undefined,
              });

              if (session.is_locked) {
                useTerminalStore.getState().lockTerminal();
              }
              return;
            }
          }

          // Native session is unauthenticated on startup.
          // Do NOT call logout() here — calling logout() wipes localStorage Central JWT & session!
          // Mark hydration complete so ProtectedRoute redirects to Sign In / PIN screen cleanly.
          setHydrated();
        } catch (err) {
          console.warn("[AuthHydrator] Failed to query native session:", err);
          setHydrated();
        }
        return;
      }

      // Browser Fallback
      const session = getSession();

      if (session && isSessionValid(session)) {
        if (session.user) {
          setAuth(session.user, session);
        }

        try {
          const freshUser = await getMeUser();
          if (freshUser) {
            setAuth(freshUser, session);
          }
        } catch (err: any) {
          if (err?.response?.status === 401) {
            logout();
          } else {
            console.warn("[AuthHydrator] Could not refresh user profile:", err?.message);
          }
        }
      } else {
        if (session) logout();
        else setHydrated();
      }
    };

    hydrate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
