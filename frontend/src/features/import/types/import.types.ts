export type ParsedInvoiceItem = {
  name: string;
  qty: number;
  price: number;
};

export type ParsedInvoice = {
  customerName: string;
  phone: string;
  totalAmount: number;
  items: ParsedInvoiceItem[];
  date: string;
};

export type ImportState = {
  file: File | null;
  rawText: string;
  parsedData: ParsedInvoice | null;
  loading: boolean;
  error: string | null;
};

export type UnifiedImportPayload = {
  type: "invoice-import";
  customer: {
    name: string;
    phone: string;
  };
  items: ParsedInvoiceItem[];
  totalAmount: number;
  date: string;
  source: "pdf";
};

export type PriceData = {
  costPrice: number;
  salePrice: number;
};

export type PurchaseOptions = {
  type: 'cash' | 'credit';
  supplierId?: string;
  priceOverrides?: Record<string, PriceData>;
};
