import { tauriClient } from '@/lib/tauri/tauriClient';

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
  method: 'cash' | 'card' | 'transfer' | 'credit' | string;
  notes?: string;
  idempotencyKey?: string;
}

export const ledgerApi = {
  getPartyLedger: async (partyId: string, partyType: 'CUSTOMER' | 'SUPPLIER'): Promise<PartyLedgerResponse> => {
    if (partyType === 'CUSTOMER') {
      try {
        const statement = await tauriClient.customerGetStatement(partyId);

        const timeline: LedgerTimelineEntry[] = statement.entries.map((entry) => {
          const isPayment = entry.entry_type === 'PAYMENT';
          const timestamp = new Date(entry.date).getTime() || Date.now();
          return {
            id: entry.id,
            transactionId: entry.reference_number || entry.id,
            type: isPayment ? 'payment' : 'invoice',
            amount: isPayment ? entry.credit : entry.debit,
            runningBalance: entry.balance,
            timestamp,
            description: entry.description,
            // In POS customer accounting:
            // Debit receivable = credit sale was given to customer
            // Credit receivable = customer made payment
            debitAccount: isPayment ? 'cash' : 'receivable',
            creditAccount: isPayment ? 'receivable' : 'sales',
          };
        });

        // Retrieve open (unpaid or partially paid) sales for this customer
        let openInvoices: OpenInvoiceData[] = [];
        try {
          const sales = await tauriClient.saleList({ customer_id: partyId });
          openInvoices = sales
            .filter((s) => s.payment_status === 'UNPAID' || s.payment_status === 'PARTIALLY_PAID')
            .map((s) => ({
              _id: s.id,
              orderNumber: s.invoice_number,
              totalAmount: s.total_amount,
              paidAmount: s.paid_amount,
              remainingAmount: s.total_amount - s.paid_amount,
              paymentStatus: s.payment_status === 'PARTIALLY_PAID' ? 'partially_paid' : 'pending',
              createdAt: s.created_at,
            }));
        } catch (saleErr) {
          console.warn('Could not fetch open invoices for customer:', saleErr);
        }

        return {
          success: true,
          message: 'Customer ledger statement retrieved',
          data: {
            timeline,
            allocations: [],
            openInvoices,
          },
        };
      } catch (err: any) {
        console.error('Failed to get customer ledger via Tauri IPC:', err);
        return {
          success: false,
          message: err?.toString() || 'Failed to retrieve ledger',
          data: {
            timeline: [],
            allocations: [],
            openInvoices: [],
          },
        };
      }
    }

    // Default empty for SUPPLIER until supplier domain phase
    return {
      success: true,
      message: 'Supplier ledger placeholder',
      data: {
        timeline: [],
        allocations: [],
        openInvoices: [],
      },
    };
  },

  getCustomerLedger: async (customerId: string): Promise<PartyLedgerResponse> => {
    return await ledgerApi.getPartyLedger(customerId, 'CUSTOMER');
  },

  recordPayment: async (
    payload: RecordPaymentPayload
  ): Promise<{ success: boolean; data: { paymentId: string; newBalance: number; receiptNumber?: string } }> => {
    if (payload.partyType === 'CUSTOMER') {
      try {
        const res = await tauriClient.customerRecordPayment({
          customer_id: payload.partyId,
          amount: payload.amount,
          payment_method: payload.method,
          reference_number: payload.idempotencyKey || null,
          notes: payload.notes || null,
        });

        return {
          success: true,
          data: {
            paymentId: res.payment_id,
            receiptNumber: res.receipt_number,
            newBalance: res.new_balance,
          },
        };
      } catch (err: any) {
        console.error('Failed to record customer payment via Tauri IPC:', err);
        throw new Error(err?.toString() || 'Failed to record customer payment');
      }
    }

    // Default response for suppliers until supplier phase
    return {
      success: true,
      data: {
        paymentId: `pay_${Date.now()}`,
        newBalance: 0,
      },
    };
  },

  recordPayout: async (
    payload: RecordPaymentPayload
  ): Promise<{ success: boolean; data: { paymentId: string; newBalance: number; shopCashBalance: number } }> => {
    return {
      success: true,
      data: {
        paymentId: `payout_${Date.now()}`,
        newBalance: 0,
        shopCashBalance: 0,
      },
    };
  },
};
