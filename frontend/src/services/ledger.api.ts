export interface LedgerTimelineEntry {
  id: string;
  transactionId: string;
  type: 'payment' | 'invoice' | 'supplier_invoice' | 'sale';
  amount: number;
  runningBalance: number;
  timestamp: number;
  description: string;
  debitAccount: string;
  creditAccount: string;
}

export interface PaymentAllocationData {
  _id: string;
  paymentEntryId: string;
  invoiceId: string;
  amountAllocated: number;
  createdAt: string;
}

export interface OpenInvoiceData {
  _id: string;
  orderNumber: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: 'pending' | 'partially_paid';
  createdAt: string;
}

export interface PartyLedgerResponse {
  success: boolean;
  message: string;
  data: {
    timeline: LedgerTimelineEntry[];
    allocations: PaymentAllocationData[];
    openInvoices: OpenInvoiceData[];
  };
}

export interface RecordPaymentPayload {
  partyId: string;
  partyType: 'CUSTOMER' | 'SUPPLIER';
  amount: number;
  method: 'cash' | 'card' | 'transfer' | 'credit';
  notes?: string;
  idempotencyKey?: string;
}

export const ledgerApi = {
  getPartyLedger: async (_partyId: string, _partyType: 'CUSTOMER' | 'SUPPLIER'): Promise<PartyLedgerResponse> => {
    return {
      success: true,
      message: 'Ledger retrieved',
      data: {
        timeline: [],
        allocations: [],
        openInvoices: [],
      }
    };
  },

  getCustomerLedger: async (customerId: string): Promise<PartyLedgerResponse> => {
    return await ledgerApi.getPartyLedger(customerId, 'CUSTOMER');
  },

  recordPayment: async (payload: RecordPaymentPayload): Promise<{ success: boolean; data: { paymentId: string; newBalance: number } }> => {
    return {
      success: true,
      data: {
        paymentId: `pay_${Date.now()}`,
        newBalance: 0,
      }
    };
  },

  recordPayout: async (payload: RecordPaymentPayload): Promise<{ success: boolean; data: { paymentId: string; newBalance: number; shopCashBalance: number } }> => {
    return {
      success: true,
      data: {
        paymentId: `payout_${Date.now()}`,
        newBalance: 0,
        shopCashBalance: 0,
      }
    };
  }
};
