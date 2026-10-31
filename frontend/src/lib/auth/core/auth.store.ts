// /lib/auth/store/auth.store.ts

import { create } from "zustand";
import { AuthUser } from "@/types/auth/auth";
import { AuthSession } from "@/types/auth/session";
import { setSession, clearSession } from "@/lib/auth/core/auth.session";
import { getQueryClient } from "@/components/providers/ReactQueryProvider";
import { isTauriEnvironment, tauriClient } from "@/lib/tauri/tauriClient";
import { nmmWsClient } from "@/lib/ws/wsClient";
import { useTerminalStore } from "@/store/useTerminalStore";

interface AuthState {
  user: AuthUser | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isHydrated: boolean; // true once AuthHydrator has finished its first check

  // actions
  setAuth: (user: AuthUser, session: AuthSession) => void;
  logout: () => void;        // sync for interceptor hard-logout
  logoutAsync: () => Promise<void>; // async with API call for UI logout
  updateUser: (user: Partial<AuthUser>) => void;
  setHydrated: () => void;   // called by AuthHydrator when done
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isAuthenticated: false,
  isHydrated: false,

  // -------------------------
  // LOGIN / SET AUTH
  // -------------------------
  setAuth: (user, session) => {
    setSession(session); // persist session

    set({
      user,
      session,
      isAuthenticated: true,
      isHydrated: true, // hydration complete — user is logged in
    });
  },

  setHydrated: () => set({ isHydrated: true }),

  // -------------------------
  // LOGOUT (sync — for interceptor hard-logout)
  // -------------------------
  logout: () => {
    // 1. Native desktop session destruction
    if (isTauriEnvironment()) {
      tauriClient.authLogout().catch(console.error);
    }

    // 2. Terminate real-time WebSocket connection and stop heartbeats
    try {
      nmmWsClient.dispose();
    } catch (wsErr) {
      console.warn("[AuthStore] WS dispose error:", wsErr);
    }

    // 3. Clear terminal lock persistent state
    try {
      useTerminalStore.getState().unlockTerminal();
    } catch {}

    // 4. Purge browser authentication storage & credentials
    clearSession();

    // 5. Purge all cached queries (customer records, inventory, finances)
    getQueryClient().clear();

    // 6. Reset in-memory auth state
    set({ user: null, session: null, isAuthenticated: false, isHydrated: true });
  },

  // -------------------------
  // LOGOUT ASYNC — for UI logout button & workstation handoff
  // -------------------------
  logoutAsync: async () => {
    // 1. Native desktop session destruction
    if (isTauriEnvironment()) {
      try {
        await tauriClient.authLogout();
      } catch (err) {
        console.warn("[Tauri authLogout error]", err);
      }
    }

    // 2. Terminate real-time WebSocket connection and stop heartbeats
    try {
      nmmWsClient.dispose();
    } catch (wsErr) {
      console.warn("[AuthStore] WS dispose error:", wsErr);
    }

    // 3. Clear terminal lock persistent state
    try {
      useTerminalStore.getState().unlockTerminal();
    } catch {}

    // 4. Purge browser authentication storage & credentials
    clearSession();

    // 5. Purge all cached queries (customer records, inventory, finances)
    getQueryClient().clear();

    // 6. Reset in-memory auth state
    set({ user: null, session: null, isAuthenticated: false });

    // 7. Route cleanly to login screen
    window.location.href = "/auth/login";
  },

  // -------------------------
  // UPDATE USER (role/shop changes etc.)
  // -------------------------
  updateUser: (updatedUser) => {
    const current = get().user;

    if (!current) return;

    const newUser = {
      ...current,
      ...updatedUser,
    };

    set({
      user: newUser,
    });
  },
}));
