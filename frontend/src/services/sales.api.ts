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
  payments?: { method: string; amount: number; referenceNumber?: string; notes?: string }[];
  transactionType?: string;
  taxRate?: number;
  discount?: number;
  notes?: string;
  branchId?: string;
  idempotencyKey?: string;
}

export function mapSaleToOrder(s: Sale, lines: any[] = [], payments: any[] = []): any {
  let paymentMethod = 'cash';
  const hasPayments = payments && payments.length > 0;

  // Detect whether this sale involves an internal exchange return offset
  const hasExchangeOffset =
    hasPayments &&
    payments.some(
      (p: any) =>
        (p.payment_method === 'OTHER' || p.method === 'OTHER') &&
        ((p.notes && String(p.notes).startsWith('Exchange Return Offset:')) ||
          (p.reference_number && String(p.reference_number).startsWith('RET-')) ||
          (p.referenceNumber && String(p.referenceNumber).startsWith('RET-')))
    );

  // Non-offset genuine tenders (e.g. CASH, CARD, BANK)
  const genuineTenders = hasPayments
    ? payments.filter(
        (p: any) =>
          !(
            (p.payment_method === 'OTHER' || p.method === 'OTHER') &&
            ((p.notes && String(p.notes).startsWith('Exchange Return Offset:')) ||
              (p.reference_number && String(p.reference_number).startsWith('RET-')) ||
              (p.referenceNumber && String(p.referenceNumber).startsWith('RET-')))
          )
      )
    : [];

  if (hasExchangeOffset) {
    if (genuineTenders.length > 0) {
      // Genuine external tender provided alongside exchange offset (e.g. cash, card)
      const primaryTender = (genuineTenders[0].payment_method || genuineTenders[0].method || '').toLowerCase();
      paymentMethod = primaryTender ? `${primaryTender} / exchange` : 'exchange';
    } else {
      // Fully settled via exchange merchandise return offset
      paymentMethod = 'exchange';
    }
  } else if (hasPayments) {
    paymentMethod = (payments[0].payment_method || payments[0].method || 'cash').toLowerCase();
  } else if (s.payment_status === 'UNPAID' || (s.paid_amount !== undefined && s.paid_amount < s.total_amount)) {
    paymentMethod = 'credit';
  }

  // Authoritative financial calculations
  const totalAmount = Number(s.total_amount ?? 0);
  const paidAmount = Number(s.paid_amount ?? 0);
  const changeAmount = Number(s.change_amount ?? 0);

  // Remaining balance due:
  // For fully paid sales (PAID status or paid_amount >= total_amount), due is strictly 0.
  // For partial or unpaid sales, due is the positive difference total_amount - paid_amount.
  const isPaid = s.payment_status === 'PAID' || paidAmount >= totalAmount;
  const remainingDue = isPaid ? 0 : Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100);

  // Authoritative tendered calculation:
  // When change was given (change_amount > 0), customer tendered paid_amount + change_amount.
  // When underpaid or exact payment, tendered is paid_amount.
  const tenderedAmount = changeAmount > 0 ? (paidAmount + changeAmount) : paidAmount;

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
    performedBy: s.performed_by,
    subtotal: s.subtotal,
    discountAmount: s.discount,
    discountTotal: s.discount,
    taxAmount: s.tax_amount,
    totalAmount: s.total_amount,
    grandTotal: s.total_amount,
    paidAmount: s.paid_amount,
    totalPaid: s.paid_amount,
    tenderedAmount,
    tendered: tenderedAmount,
    changeAmount: s.change_amount,
    change: s.change_amount,
    changeReturned: s.change_amount,
    creditAmount: remainingDue,
    remainingDue,
    due: remainingDue,
    paymentStatus: s.payment_status,
    paymentMethod,
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
      imei: l.imei1 || (l.sku_snapshot && l.sku_snapshot !== 'MOBILE' && l.sku_snapshot !== 'DEFAULT' ? l.sku_snapshot : undefined),
      specs: l.specs,
      lineType: l.line_type || 'PRODUCT',
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
    // F-07: a sale may only contain positive whole quantities. Returns go through the
    // sales-return service; a non-positive quantity is rejected instead of being
    // silently turned into a sale of 1 unit.
    const invalidItem = payload.items.find((i) => !Number.isInteger(i.quantity) || i.quantity <= 0);
    if (invalidItem) {
      throw new Error(
        'Invalid sale quantity. Returns and exchanges must be processed through the sales-return flow, not as a sale.',
      );
    }

    try {
      const saleResult = await tauriClient.saleComplete({
        branch_id: payload.branchId || null,
        customer_id: payload.customerId || null,
        items: payload.items.map((i) => ({
          product_id: i.productId,
          quantity: i.quantity,
          unit_price: i.price,
          price: i.price,
          discount: i.discount || 0,
        })),
        discount: payload.discount ?? null,
        paid_amount: payload.paidAmount !== undefined ? payload.paidAmount : null,
        payment_method: payload.paymentMethod || 'cash',
        payments: payload.payments
          ? payload.payments.map((p) => ({
              method: p.method,
              amount: p.amount,
              reference_number: p.referenceNumber || null,
              notes: p.notes || null,
            }))
          : null,
        notes: payload.notes || null,
        idempotency_key: payload.idempotencyKey || null,
      });

      const order = mapSaleToOrder(saleResult.sale, saleResult.lines, saleResult.payments);
      order.creditAmount = saleResult.credit_amount;
      order.remainingDue = saleResult.credit_amount;
      order.due = saleResult.credit_amount;
      order.customerBalanceAfter = saleResult.customer_balance_after;

      return {
        success: true,
        order,
        saleResult,
        message: 'Sale completed successfully',
      };
    } catch (err: any) {
      const msg = err?.message || err?.toString() || 'Failed to complete sale';
      console.error('Failed to complete sale:', msg);
      throw (err instanceof Error ? err : new Error(msg));
    }
  },

  processExchange: async (payload: {
    originalSaleId: string;
    returnLines: { saleLineId: string; quantity: number }[];
    replacementItems: { productId: string; quantity: number; unitPrice?: number; discount?: number }[];
    replacementDiscount?: number;
    refundMethod?: 'CASH' | 'CREDIT' | null;
    payments?: { method: string; amount: number; referenceNumber?: string; notes?: string }[];
    paymentMethod?: string;
    paidAmount?: number;
    idempotencyKey: string;
    notes?: string;
    reason?: string;
  }) => {
    try {
      const res = await tauriClient.salesExchange({
        original_sale_id: payload.originalSaleId,
        return_lines: payload.returnLines.map((l) => ({
          sale_line_id: l.saleLineId,
          quantity: l.quantity,
        })),
        replacement_items: payload.replacementItems.map((i) => ({
          product_id: i.productId,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          price: i.unitPrice,
          discount: i.discount || 0,
        })),
        replacement_discount: payload.replacementDiscount ?? null,
        refund_method: payload.refundMethod ?? null,
        payments: payload.payments
          ? payload.payments.map((p) => ({
              method: p.method,
              amount: p.amount,
              reference_number: p.referenceNumber || null,
              notes: p.notes || null,
            }))
          : null,
        payment_method: payload.paymentMethod || null,
        paid_amount: payload.paidAmount !== undefined ? payload.paidAmount : null,
        idempotency_key: payload.idempotencyKey,
        notes: payload.notes || null,
        reason: payload.reason || null,
      });

      const order = mapSaleToOrder(
        res.replacement_sale.sale,
        res.replacement_sale.lines,
        res.replacement_sale.payments
      );
      order.creditAmount = res.replacement_sale.credit_amount;
      order.customerBalanceAfter = res.customer_balance_after;

      return {
        success: true,
        exchangeResult: res,
        order,
        message: 'Exchange completed successfully',
      };
    } catch (err: any) {
      const msg = err?.message || err?.toString() || 'Failed to complete exchange';
      console.error('Failed to complete exchange:', msg);
      throw (err instanceof Error ? err : new Error(msg));
    }
  },

  getOrders: async (params?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    orderNumber?: string;
    customerId?: string;
    paymentStatus?: string;
    branchId?: string | null;
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
        branch_id: params?.branchId || null,
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
      const lines = await tauriClient.saleGetLines(sale.id);
      const payments = await tauriClient.saleGetPayments(sale.id);
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
