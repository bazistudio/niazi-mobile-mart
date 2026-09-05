"use client";

// /components/auth/AuthHydrator.tsx
//
// Runs once on app boot (client-side) and rehydrates the Zustand
// auth store from localStorage so a page refresh doesn't wipe
// the user's session.
//
// This is intentionally separate from the middleware (server-side
// cookie check) — both layers must agree for the user to be
// considered authenticated.

import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth/core/auth.store";
import { getSession, isSessionValid } from "@/lib/auth/core/auth.session";
import { getMeUser } from "@/lib/auth/core/auth.client";

export default function AuthHydrator() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);
  const setHydrated = useAuthStore((s) => s.setHydrated);

  useEffect(() => {
    const hydrate = async () => {
      const session = getSession();

      if (session && isSessionValid(session)) {
        // Hydrate synchronously from local storage to prevent layout flash
        if (session.user) {
          setAuth(session.user, session);
        }

        try {
          // Fetch fresh user data from backend via tp_token cookie
          const freshUser = await getMeUser();
          if (freshUser) {
            setAuth(freshUser, session); // updates with fresh data
          }
        } catch (err: any) {
          // Token invalid or expired — backend explicitly returned 401
          if (err?.response?.status === 401) {
            logout(); // clears state and redirects
          } else {
            // Transient error / network blip — keep hydrated session
            console.warn("[AuthHydrator] Could not refresh user profile, retaining cached session:", err?.message);
          }
        }
      } else {
        // No session or expired — mark hydrated so dashboard can redirect
        if (session) logout(); // clean up stale session
        else setHydrated();    // no session at all — still mark done
      }
    };

    hydrate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null; // renders nothing
}
