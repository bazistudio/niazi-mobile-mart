'use client';

import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { themeApi, type Theme, type ThemeUpdatePayload } from '@/services/theme.api';
import { applyTheme, resetTheme, DEFAULT_THEME } from '@/services/applyTheme';
import { useAuthStore } from '@/lib/auth/core/auth.store';

// ===========================
// CONTEXT TYPES
// ===========================

interface ThemeContextValue {
  theme: Theme | null;
  isLoading: boolean;
  /** Preview a theme change instantly (before saving) */
  previewTheme: (partial: Partial<Theme>) => void;
  /** Reset preview back to the saved DB theme */
  cancelPreview: () => void;
  /** Save theme to the database */
  saveTheme: (payload: ThemeUpdatePayload) => Promise<void>;
  isSaving: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const THEME_QUERY_KEY = ['theme', 'current'] as const;

// ===========================
// PROVIDER
// ===========================

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();

  // ── Fetch theme from DB via React Query ──────────────────────────────────
  const { data: theme, isLoading } = useQuery({
    queryKey: THEME_QUERY_KEY,
    queryFn: themeApi.getCurrentTheme,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 min — theme rarely changes
    gcTime: 10 * 60 * 1000,
  });

  // ── Apply to CSS variables whenever the DB theme changes ─────────────────
  useEffect(() => {
    if (theme) {
      applyTheme(theme);
    } else if (!isAuthenticated) {
      resetTheme();
    }
  }, [theme, isAuthenticated]);

  // ── Mutation: save theme to DB ─────────────────────────────────────────
  const { mutateAsync: saveThemeMutation, isPending: isSaving } = useMutation({
    mutationFn: themeApi.updateTheme,
    onSuccess: (updatedTheme) => {
      // Update the cache so the whole app reflects the new theme immediately
      queryClient.setQueryData(THEME_QUERY_KEY, updatedTheme);
      applyTheme(updatedTheme);
    },
  });

  const saveTheme = useCallback(
    async (payload: ThemeUpdatePayload) => {
      await saveThemeMutation(payload);
    },
    [saveThemeMutation]
  );

  // ── Preview: instant visual feedback without saving ────────────────────
  const previewTheme = useCallback(
    (partial: Partial<Theme>) => {
      // Deep merge colors to preserve nested `text` object when only brand colors change
      const merged: Partial<Theme> = {
        ...theme,
        ...partial,
        colors: {
          surface: partial.colors?.surface ?? theme?.colors?.surface ?? '#ffffff',
          background: partial.colors?.background ?? theme?.colors?.background ?? '#f8fafc',
          primary: partial.colors?.primary ?? theme?.colors?.primary ?? '#006970',
          secondary: partial.colors?.secondary ?? theme?.colors?.secondary ?? '#00b4bb',
          ...(theme?.colors ?? {}),
          ...(partial.colors ?? {}),
          text: {
            primary: partial.colors?.text?.primary ?? theme?.colors?.text?.primary ?? '#111827',
            secondary: partial.colors?.text?.secondary ?? theme?.colors?.text?.secondary ?? '#4b5563',
            muted: partial.colors?.text?.muted ?? theme?.colors?.text?.muted ?? '#6b7280',
            disabled: partial.colors?.text?.disabled ?? theme?.colors?.text?.disabled ?? '#9ca3af',
          },
        },
        typography: {
          ...(theme?.typography ?? { mode: 'auto' }),
          ...(partial.typography ?? {}),
        },
      };
      applyTheme(merged);
    },
    [theme]
  );

  const cancelPreview = useCallback(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{ theme: theme ?? null, isLoading, previewTheme, cancelPreview, saveTheme, isSaving }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

// ===========================
// HOOK
// ===========================

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() must be used inside <ThemeProvider>');
  return ctx;
}
