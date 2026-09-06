// ===========================
// TYPES
// ===========================

export interface ThemeColors {
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  text?: {
    primary: string;
    secondary: string;
    muted: string;
    disabled: string;
  };
}

export interface ThemeBranding {
  logo: string;
  favicon: string;
}

export interface ThemeTypography {
  mode: 'auto' | 'custom';
}

export interface Theme {
  mode: 'light' | 'dark' | 'system';
  typography?: ThemeTypography;
  colors: ThemeColors;
  branding: ThemeBranding;
  source: 'organization' | 'branch';
  themeVersion: number;
}

export interface ThemeUpdatePayload {
  mode?: Theme['mode'];
  typography?: Partial<ThemeTypography>;
  colors?: Partial<ThemeColors>;
}

// ===========================
// API CALLS
// ===========================

import { DEFAULT_THEME } from './applyTheme';

const THEME_STORAGE_KEY = 'niazi_desktop_theme';

export const themeApi = {
  /**
   * Fetches the local theme preferences for desktop presentation.
   */
  getCurrentTheme: async (): Promise<Theme> => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved) {
          return JSON.parse(saved);
        }
      }
    } catch (e) {
      console.warn('Failed to read theme from local storage', e);
    }
    return DEFAULT_THEME as unknown as Theme;
  },

  /**
   * Updates the desktop theme preferences locally.
   */
  updateTheme: async (payload: ThemeUpdatePayload): Promise<Theme> => {
    const current = await themeApi.getCurrentTheme();
    const updated: Theme = {
      ...current,
      ...payload,
      colors: {
        ...current.colors,
        ...(payload.colors || {}),
      },
      typography: {
        mode: payload.typography?.mode || current.typography?.mode || 'auto',
      },
      source: current.source || 'organization',
      themeVersion: (current.themeVersion || 1) + 1,
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(updated));
    }
    return updated;
  },
};
