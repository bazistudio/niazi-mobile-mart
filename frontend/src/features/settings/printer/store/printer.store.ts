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

const DEFAULT_SETTINGS: PrinterSettings = {
  enabled: true,
  printerType: 'THERMAL_80MM',
  connectionType: 'BROWSER_PRINT',
  paperSize: { width: '80mm' },
  layout: { orientation: 'portrait', marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
  font: { size: 12, family: 'sans-serif' },
  invoice: {
    showLogo: true,
    showShopInfo: true,
    showBarcode: true,
    showQR: false,
    showTax: false,
    showDiscount: true,
  },
  autoPrint: false,
  printCopyCount: 1,
};

const DEFAULT_SHOP_HEADER: ShopHeader = {
  name: 'Niazi Mobile Mart',
  branchName: 'Main Branch',
  address: 'Main Market, City Branch',
  phone: '0300-1234567',
  secondaryPhone: '',
  whatsapp: '0300-1234567',
  email: '',
  taxNumber: '',
  returnPolicy: 'Goods once sold can only be returned/exchanged within 3 days with original receipt.',
  warrantyInstructions: 'Warranty claims require original invoice. Physical or liquid damage voids warranty.',
  footerText: 'Thank you for shopping with us!',
  logoUrl: '',
};

export const usePrinterStore = create<PrinterState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  shopHeader: DEFAULT_SHOP_HEADER,
  isLoading: false,
  error: null,

  fetchSettings: async () => {
    try {
      set({ isLoading: true, error: null });

      // Try fetching persistent settings from backend DB
      const { httpFetch } = await import('@/lib/tauri/tauriClient');
      const dbData: any = await httpFetch('/api/settings/invoice-printer');

      if (dbData && dbData.shop_name) {
        const pSettings: PrinterSettings = {
          enabled: true,
          printerType: dbData.printer_type || 'THERMAL_80MM',
          connectionType: dbData.connection_type || 'BROWSER_PRINT',
          paperSize: { width: dbData.paper_width || '80mm' },
          layout: {
            orientation: 'portrait',
            marginTop: dbData.margin_top || 0,
            marginBottom: dbData.margin_bottom || 0,
            marginLeft: dbData.margin_left || 0,
            marginRight: dbData.margin_right || 0,
          },
          font: {
            size: dbData.font_size || 12,
            family: dbData.font_family === 'monospace' ? 'monospace' : 'sans-serif',
          },
          invoice: {
            showLogo: dbData.show_logo !== false,
            showShopInfo: dbData.show_shop_info !== false,
            showBarcode: dbData.show_barcode !== false,
            showQR: Boolean(dbData.show_qr),
            showTax: Boolean(dbData.show_tax),
            showDiscount: dbData.show_discount !== false,
          },
          autoPrint: Boolean(dbData.auto_print),
          printCopyCount: dbData.print_copy_count || 1,
        };

        const header: ShopHeader = {
          name: dbData.shop_name || 'Niazi Mobile Mart',
          branchName: dbData.branch_name || 'Main Branch',
          address: dbData.address || '',
          phone: dbData.phone || '',
          secondaryPhone: dbData.secondary_phone || '',
          whatsapp: dbData.whatsapp || '',
          email: dbData.email || '',
          taxNumber: dbData.tax_number || '',
          returnPolicy: dbData.return_policy || 'Goods once sold can only be returned/exchanged within 3 days with original receipt.',
          warrantyInstructions: dbData.warranty_instructions || 'Warranty claims require original invoice. Physical or liquid damage voids warranty.',
          footerText: dbData.footer_text || 'Thank you for shopping with us!',
          logoUrl: dbData.logo_url || '',
        };

        set({ settings: pSettings, shopHeader: header, isLoading: false });

        if (typeof window !== 'undefined') {
          localStorage.setItem('niazi_printer_settings', JSON.stringify({ printer: pSettings, shopHeader: header }));
        }
        return;
      }
    } catch (backendErr) {
      console.warn('[printer.store] Backend settings fetch failed, falling back to localStorage:', backendErr);
    }

    // Fallback to localStorage
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('niazi_printer_settings') : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        set({
          settings: { ...DEFAULT_SETTINGS, ...parsed.printer },
          shopHeader: { ...DEFAULT_SHOP_HEADER, ...parsed.shopHeader },
          isLoading: false,
        });
      } else {
        set({ settings: DEFAULT_SETTINGS, shopHeader: DEFAULT_SHOP_HEADER, isLoading: false });
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch settings', isLoading: false });
    }
  },

  updateSettings: (updates) => {
    const current = get().settings || DEFAULT_SETTINGS;
    set({ settings: { ...current, ...updates } });
  },

  updateShopHeader: (updates) => {
    const current = get().shopHeader || DEFAULT_SHOP_HEADER;
    set({ shopHeader: { ...current, ...updates } });
  },

  saveSettings: async () => {
    try {
      set({ isLoading: true, error: null });
      const { settings, shopHeader } = get();

      const pSettings = settings || DEFAULT_SETTINGS;
      const header = shopHeader || DEFAULT_SHOP_HEADER;

      // Save to local storage first for immediate offline availability
      if (typeof window !== 'undefined') {
        localStorage.setItem('niazi_printer_settings', JSON.stringify({ printer: pSettings, shopHeader: header }));
      }

      // Save persistently to PostgreSQL database
      const { httpFetch } = await import('@/lib/tauri/tauriClient');
      await httpFetch('/api/settings/invoice-printer', {
        method: 'PUT',
        body: JSON.stringify({
          shop_name: header.name,
          branch_name: header.branchName,
          address: header.address,
          phone: header.phone,
          secondary_phone: header.secondaryPhone,
          whatsapp: header.whatsapp,
          email: header.email,
          logo_url: header.logoUrl,
          tax_number: header.taxNumber,
          printer_type: pSettings.printerType,
          connection_type: pSettings.connectionType,
          paper_width: pSettings.paperSize?.width || '80mm',
          font_family: pSettings.font?.family || 'sans-serif',
          font_size: pSettings.font?.size || 12,
          margin_top: pSettings.layout?.marginTop || 0,
          margin_bottom: pSettings.layout?.marginBottom || 0,
          margin_left: pSettings.layout?.marginLeft || 0,
          margin_right: pSettings.layout?.marginRight || 0,
          show_logo: pSettings.invoice?.showLogo,
          show_shop_info: pSettings.invoice?.showShopInfo,
          show_barcode: pSettings.invoice?.showBarcode,
          show_qr: pSettings.invoice?.showQR,
          show_tax: pSettings.invoice?.showTax,
          show_discount: pSettings.invoice?.showDiscount,
          auto_print: pSettings.autoPrint,
          print_copy_count: pSettings.printCopyCount,
          return_policy: header.returnPolicy,
          warranty_instructions: header.warrantyInstructions,
          footer_text: header.footerText,
        }),
      });

      set({ isLoading: false });
      toast.success('Invoice & printer settings saved successfully');
    } catch (err: any) {
      console.warn('[printer.store] Database save notice:', err.message);
      set({ isLoading: false });
      toast.success('Printer settings saved locally');
    }
  },
}));
