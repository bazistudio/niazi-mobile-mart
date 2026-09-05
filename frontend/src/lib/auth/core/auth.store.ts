// /lib/auth/store/auth.store.ts

import { create } from "zustand";
import { AuthUser } from "@/types/auth/auth";
import { AuthSession } from "@/types/auth/session";
import { setSession, clearSession } from "@/lib/auth/core/auth.session";
import axiosInstance from "@/lib/api/axios";
import { getQueryClient } from "@/components/providers/ReactQueryProvider";

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
    clearSession();
    getQueryClient().clear();
    set({ user: null, session: null, isAuthenticated: false, isHydrated: true });
    // isHydrated: true — hydration is done, we confirmed there's no valid session
  },

  // -------------------------
  // LOGOUT ASYNC — for UI logout button (calls backend to clear cookie)
  // -------------------------
  logoutAsync: async () => {
    try {
      await axiosInstance.post("/api/v1/auth/logout");
    } catch { /* ignore — clear client state regardless */ }
    clearSession();
    getQueryClient().clear();
    set({ user: null, session: null, isAuthenticated: false });
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