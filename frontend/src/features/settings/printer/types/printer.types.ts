export type PrinterType = 'A4' | 'THERMAL_80MM' | 'THERMAL_58MM' | 'PDF_ONLY' | 'CUSTOM';
export type ConnectionType = 'BROWSER_PRINT' | 'USB' | 'LAN' | 'BLUETOOTH';

export interface ShopHeader {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
  footerText: string;
  logoUrl?: string;
}

export interface PrinterSettings {
  enabled: boolean;
  printerType: PrinterType;
  connectionType: ConnectionType;
  paperSize: {
    width: 'A4' | '80mm' | '58mm';
    customWidth?: number;
  };
  layout: {
    orientation: 'portrait' | 'landscape';
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
  };
  font: {
    size: number;
    family: 'monospace' | 'sans-serif';
  };
  invoice: {
    showLogo: boolean;
    showShopInfo: boolean;
    showBarcode: boolean;
    showQR: boolean;
    showTax: boolean;
    showDiscount: boolean;
  };
  autoPrint: boolean;
  printCopyCount: number;
}

// Unified DTO (Immutable snapshot of the invoice at the time of printing)
export interface UnifiedInvoice {
  invoiceNo: string;
  date: string;
  customer?: {
    name: string;
    phone?: string;
  };
  cashier?: string;
  items: {
    name: string;
    qty: number;
    price: number;
    total: number;
    imei?: string;
  }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  tendered?: number;
  change?: number;
  shop: ShopHeader;
  returnPolicy?: string;
}
