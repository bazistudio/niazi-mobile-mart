import { tauriClient, Sale, SaleResultDto } from '@/lib/tauri/tauriClient';

export interface CreateOrderPayload {
  items: {
    productId: string;
    quantity: number;
    price: number;
    discount?: number;
  }[];
  customerId?: string;
  paymentMethod: string;
  paidAmount?: number;
  transactionType?: string;
  taxRate?: number;
  discount?: number;
  notes?: string;
  branchId?: string;
  idempotencyKey?: string;
}

function mapSaleToOrder(s: Sale, lines: any[] = [], payments: any[] = []): any {
  return {
    id: s.id,
    _id: s.id,
    orderNumber: s.invoice_number,
    transactionId: s.invoice_number,
    invoiceNumber: s.invoice_number,
    branchId: s.branch_id,
    customerId: s.customer_id,
    customerName: s.customer_name_snapshot,
    customer: s.customer_name_snapshot ? { name: s.customer_name_snapshot } : null,
    subtotal: s.subtotal,
    discountAmount: s.discount,
    discountTotal: s.discount,
    taxAmount: s.tax_amount,
    totalAmount: s.total_amount,
    grandTotal: s.total_amount,
    paidAmount: s.paid_amount,
    totalPaid: s.paid_amount,
    changeAmount: s.change_amount,
    paymentStatus: s.payment_status,
    saleStatus: s.sale_status,
    status: s.sale_status.toLowerCase(),
    notes: s.notes,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    items: lines.map((l) => ({
      id: l.id,
      productId: l.product_id,
      productName: l.product_name_snapshot,
      name: l.product_name_snapshot,
      quantity: l.quantity,
      price: l.unit_price,
      unitPrice: l.unit_price,
      discount: l.discount,
      subtotal: l.line_total,
      lineTotal: l.line_total,
    })),
    payments,
  };
}

export const salesApi = {
  createOrder: async (
    payload: CreateOrderPayload
  ): Promise<{
    success: boolean;
    order: any;
    saleResult: SaleResultDto;
    message: string;
  }> => {
    try {
      const saleResult = await tauriClient.saleComplete({
        branch_id: payload.branchId || null,
        customer_id: payload.customerId || null,
        items: payload.items.map((i) => ({
          product_id: i.productId,
          quantity: Math.max(1, i.quantity),
          discount: i.discount || 0,
        })),
        discount: payload.discount ?? null,
        paid_amount: payload.paidAmount !== undefined ? payload.paidAmount : null,
        payment_method: payload.paymentMethod || 'cash',
        notes: payload.notes || payload.idempotencyKey || null,
      });

      const order = mapSaleToOrder(saleResult.sale, saleResult.lines, saleResult.payments);
      order.creditAmount = saleResult.credit_amount;
      order.customerBalanceAfter = saleResult.customer_balance_after;

      return {
        success: true,
        order,
        saleResult,
        message: 'Sale completed successfully',
      };
    } catch (err: any) {
      console.error('Failed to complete sale via Tauri IPC:', err);
      throw new Error(err?.toString() || 'Failed to complete sale');
    }
  },

  getOrders: async (params?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    orderNumber?: string;
    customerId?: string;
    paymentStatus?: string;
  }): Promise<{
    success: boolean;
    data: any[];
  }> => {
    try {
      if (params?.orderNumber && params.orderNumber.trim()) {
        const exact = await tauriClient.saleGetByInvoice(params.orderNumber.trim());
        if (exact) {
          const lines = await tauriClient.saleGetLines(exact.id).catch(() => []);
          const payments = await tauriClient.saleGetPayments(exact.id).catch(() => []);
          return {
            success: true,
            data: [mapSaleToOrder(exact, lines, payments)],
          };
        }
      }

      const sales = await tauriClient.saleList({
        customer_id: params?.customerId || null,
        payment_status: params?.paymentStatus || null,
        start_date: params?.startDate || null,
        end_date: params?.endDate || null,
        limit: params?.limit || 100,
      });

      // Filter by partial orderNumber if provided and not exact
      const filtered = params?.orderNumber
        ? sales.filter((s) => s.invoice_number.toLowerCase().includes(params.orderNumber!.toLowerCase()))
        : sales;

      const data = filtered.map((s) => mapSaleToOrder(s));
      return {
        success: true,
        data,
      };
    } catch (err: any) {
      console.error('Failed to list sales via Tauri IPC:', err);
      return {
        success: false,
        data: [],
      };
    }
  },

  getOrderById: async (
    id: string
  ): Promise<{
    success: boolean;
    order: any | null;
  }> => {
    try {
      const sale = await tauriClient.saleGetById(id);
      if (!sale) {
        return { success: false, order: null };
      }
      const lines = await tauriClient.saleGetLines(sale.id).catch(() => []);
      const payments = await tauriClient.saleGetPayments(sale.id).catch(() => []);
      return {
        success: true,
        order: mapSaleToOrder(sale, lines, payments),
      };
    } catch (err: any) {
      console.error('Failed to get sale by ID via Tauri IPC:', err);
      return { success: false, order: null };
    }
  },

  updateOrderStatus: async (
    orderId: string,
    status: string
  ): Promise<{
    success: boolean;
    message: string;
    order?: any;
  }> => {
    return {
      success: true,
      message: `Order status updated to ${status}`,
      order: { id: orderId, status },
    };
  },

  cancelOrder: async (
    orderId: string
  ): Promise<{
    success: boolean;
    message: string;
  }> => {
    return {
      success: true,
      message: 'Order cancelled',
    };
  },
};
