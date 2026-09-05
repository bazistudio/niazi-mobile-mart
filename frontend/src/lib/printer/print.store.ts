import { create } from 'zustand';

export type PrintDocumentType = 'SaleInvoice' | 'PurchaseInvoice' | 'ExpenseVoucher' | 'PaymentReceipt' | 'Generic';

interface PrintPayload {
  html: string;
  documentType: PrintDocumentType;
  referenceId: string; // The ID of the order/expense/etc.
  title: string;
}

interface PrintState {
  currentPayload: PrintPayload | null;
  isPreviewOpen: boolean;
  isPrinting: boolean;
  
  openPreview: (payload: PrintPayload) => void;
  closePreview: () => void;
  setPrinting: (isPrinting: boolean) => void;
  clearPayload: () => void;
}

export const usePrintStore = create<PrintState>((set, get) => ({
  currentPayload: null,
  isPreviewOpen: false,
  isPrinting: false,

  openPreview: (payload) => {
    if (get().isPreviewOpen || get().isPrinting) return;
    set({ currentPayload: payload, isPreviewOpen: true, isPrinting: true });
  },
  closePreview: () => set({ isPreviewOpen: false }),
  setPrinting: (isPrinting) => set({ isPrinting }),
  clearPayload: () => set({ currentPayload: null, isPreviewOpen: false, isPrinting: false })
}));
