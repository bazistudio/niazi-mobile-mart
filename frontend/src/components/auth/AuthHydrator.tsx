"use client";

// /components/auth/AuthHydrator.tsx
//
// Runs once on app boot (client-side) and rehydrates the Zustand
// auth store.
// In Tauri mode: Queries the authoritative native Rust session via IPC.
// In browser mode: Rehydrates from localStorage / cookies.

import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth/core/auth.store";
import { getSession, isSessionValid } from "@/lib/auth/core/auth.session";
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
          const session = await tauriClient.getCurrentSession();
          if (session && session.is_authenticated && session.user_id) {
            const rawUser = await tauriClient.getCurrentUser();
            if (rawUser) {
              const user: AuthUser = {
                id: rawUser.id,
                name: rawUser.name,
                email: `${rawUser.username}@local`,
                role: rawUser.role as any,
                status: rawUser.is_active ? "active" : "suspended",
                permissions: rawUser.access_profile.allowed_actions,
                createdAt: rawUser.created_at,
              };

              setAuth(user, {
                expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
                deviceId: "native-desktop",
                user,
              });

              if (session.is_locked) {
                useTerminalStore.getState().lockTerminal();
              }
              return;
            }
          }
          logout();
        } catch (err) {
          console.warn("[AuthHydrator] Failed to query native session:", err);
          logout();
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
