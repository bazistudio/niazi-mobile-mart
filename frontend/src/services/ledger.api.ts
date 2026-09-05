import axiosInstance from '@/lib/api/axios';

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
  getPartyLedger: async (partyId: string, partyType: 'CUSTOMER' | 'SUPPLIER') => {
    const response = await axiosInstance.get<PartyLedgerResponse>(`/api/v1/ledger/${partyId}`, {
      params: { partyType }
    });
    return response.data;
  },

  getCustomerLedger: async (customerId: string) => {
    return await ledgerApi.getPartyLedger(customerId, 'CUSTOMER');
  },

  recordPayment: async (payload: RecordPaymentPayload) => {
    const response = await axiosInstance.post<{ success: boolean; data: { paymentId: string; newBalance: number } }>('/api/v1/ledger/payment', payload);
    return response.data;
  },

  recordPayout: async (payload: RecordPaymentPayload) => {
    const response = await axiosInstance.post<{ success: boolean; data: { paymentId: string; newBalance: number; shopCashBalance: number } }>('/api/v1/ledger/payout', payload);
    return response.data;
  }
};
