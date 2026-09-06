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

    // Native Tauri handling for SUPPLIER
    try {
      const statement = await tauriClient.supplierGetStatement(partyId);

      const timeline: LedgerTimelineEntry[] = statement.rows.map((row, idx) => {
        const isPayment = row.entry_type === 'PAYMENT';
        const timestamp = new Date(row.date).getTime() || Date.now();
        return {
          id: `${partyId}_${idx}`,
          transactionId: row.reference_number || `TX-${idx}`,
          type: isPayment ? 'payment' : 'supplier_invoice',
          amount: isPayment ? row.credit : row.debit,
          runningBalance: row.balance,
          timestamp,
          description: row.description || (isPayment ? 'Supplier Payment' : 'Supplier Purchase'),
          debitAccount: isPayment ? 'payable' : 'purchases',
          creditAccount: isPayment ? 'cash' : 'payable',
        };
      });

      // Retrieve open (unpaid or partially paid) purchases for this supplier
      let openInvoices: OpenInvoiceData[] = [];
      try {
        const purchases = await tauriClient.purchaseList({ supplier_id: partyId });
        openInvoices = purchases
          .filter((p) => p.payment_status === 'UNPAID' || p.payment_status === 'PARTIALLY_PAID')
          .map((p) => ({
            _id: p.id,
            orderNumber: p.purchase_number,
            totalAmount: p.total_amount,
            paidAmount: p.paid_amount,
            remainingAmount: p.total_amount - p.paid_amount,
            paymentStatus: p.payment_status === 'PARTIALLY_PAID' ? 'partially_paid' : 'pending',
            createdAt: p.created_at,
          }));
      } catch (purErr) {
        console.warn('Could not fetch open purchases for supplier:', purErr);
      }

      return {
        success: true,
        message: 'Supplier ledger statement retrieved',
        data: {
          timeline,
          allocations: [],
          openInvoices,
        },
      };
    } catch (err: any) {
      console.error('Failed to get supplier ledger via Tauri IPC:', err);
      return {
        success: false,
        message: err?.toString() || 'Failed to retrieve supplier ledger',
        data: {
          timeline: [],
          allocations: [],
          openInvoices: [],
        },
      };
    }
  },

  getCustomerLedger: async (customerId: string): Promise<PartyLedgerResponse> => {
    return await ledgerApi.getPartyLedger(customerId, 'CUSTOMER');
  },

  getSupplierLedger: async (supplierId: string): Promise<PartyLedgerResponse> => {
    return await ledgerApi.getPartyLedger(supplierId, 'SUPPLIER');
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

    // Native supplier payment
    try {
      const res = await tauriClient.supplierRecordPayment({
        supplier_id: payload.partyId,
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
      console.error('Failed to record supplier payment via Tauri IPC:', err);
      throw new Error(err?.toString() || 'Failed to record supplier payment');
    }
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
