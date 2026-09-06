import { create } from 'zustand';
import { PrinterSettings, ShopHeader } from '../types/printer.types';
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
      const saved = typeof window !== 'undefined' ? localStorage.getItem('niazi_printer_settings') : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        set({
          settings: parsed.printer,
          shopHeader: parsed.shopHeader || {
            name: 'Niazi Mobile Mart', address: 'Main Branch', phone: '', email: '', taxNumber: '', footerText: 'Thank you!'
          },
          isLoading: false
        });
      } else {
        set({ isLoading: false });
      }
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
      if (typeof window !== 'undefined') {
        localStorage.setItem('niazi_printer_settings', JSON.stringify({ printer: settings, shopHeader }));
      }
      set({ isLoading: false });
      toast.success('Printer settings saved locally');
    } catch (err: any) {
      set({ error: err.message || 'Failed to save settings', isLoading: false });
      toast.error('Failed to save printer settings');
    }
  }
}));
