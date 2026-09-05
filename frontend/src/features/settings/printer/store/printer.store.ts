import { create } from 'zustand';
import { PrinterSettings, ShopHeader } from '../types/printer.types';
import axiosInstance from '@/lib/api/axios';
import toast from 'react-hot-toast';

interface PrinterState {
  settings: PrinterSettings | null;
  shopHeader: ShopHeader | null;
  isLoading: boolean;
  error: string | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (updates: Partial<PrinterSettings>) => void;
  updateShopHeader: (updates: Partial<ShopHeader>) => void;
  saveSettings: () => Promise<void>;
}

export const usePrinterStore = create<PrinterState>((set, get) => ({
  settings: null,
  shopHeader: null,
  isLoading: false,
  error: null,

  fetchSettings: async () => {
    try {
      set({ isLoading: true, error: null });
      const response = await axiosInstance.get('/api/v1/settings');
      set({ 
        settings: response.data.printer,
        shopHeader: response.data.shopHeader || {
          name: '', address: '', phone: '', email: '', taxNumber: '', footerText: 'Thank you!'
        },
        isLoading: false 
      });
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch settings', isLoading: false });
    }
  },

  updateSettings: (updates) => {
    const current = get().settings;
    if (current) {
      set({ settings: { ...current, ...updates } });
    }
  },

  updateShopHeader: (updates) => {
    const current = get().shopHeader;
    if (current) {
      set({ shopHeader: { ...current, ...updates } });
    }
  },

  saveSettings: async () => {
    try {
      set({ isLoading: true, error: null });
      const { settings, shopHeader } = get();
      await axiosInstance.put('/api/v1/settings', { printer: settings, shopHeader });
      set({ isLoading: false });
      toast.success('Printer settings saved successfully');
    } catch (err: any) {
      set({ error: err.message || 'Failed to save settings', isLoading: false });
      toast.error('Failed to save printer settings');
    }
  }
}));
