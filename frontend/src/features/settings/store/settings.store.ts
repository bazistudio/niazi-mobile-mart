import { create } from 'zustand';
import { settingsApi } from '../services/settings.api';

interface SettingsState {
  staffList: any[];
  roleList: any[];
  isLoading: boolean;
  error: string | null;
  fetchStaff: () => Promise<void>;
  createStaff: (data: any) => Promise<void>;
  updateStaff: (id: string, data: any) => Promise<void>;
  fetchRoles: () => Promise<void>;
  updateRole: (roleId: string, permissions: Record<string, boolean>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  staffList: [],
  roleList: [],
  isLoading: false,
  error: null,

  fetchStaff: async () => {
    try {
      set({ isLoading: true, error: null });
      const data = await settingsApi.getStaff();
      set({ staffList: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch staff', isLoading: false });
    }
  },

  createStaff: async (data) => {
    try {
      set({ isLoading: true, error: null });
      await settingsApi.createStaff(data);
      await get().fetchStaff();
    } catch (err: any) {
      set({ error: err.message || 'Failed to create staff', isLoading: false });
      throw err;
    }
  },

  updateStaff: async (id, data) => {
    try {
      set({ isLoading: true, error: null });
      await settingsApi.updateStaff(id, data);
      await get().fetchStaff();
    } catch (err: any) {
      set({ error: err.message || 'Failed to update staff', isLoading: false });
      throw err;
    }
  },

  fetchRoles: async () => {
    try {
      set({ isLoading: true, error: null });
      const data = await settingsApi.getRoles();
      set({ roleList: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch roles', isLoading: false });
    }
  },

  updateRole: async (roleId, permissions) => {
    try {
      set({ isLoading: true, error: null });
      await settingsApi.updateRole(roleId, permissions);
      await get().fetchRoles();
    } catch (err: any) {
      set({ error: err.message || 'Failed to update role', isLoading: false });
      throw err;
    }
  }
}));
