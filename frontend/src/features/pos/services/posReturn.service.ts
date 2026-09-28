// POS return routing (F-07 containment).
//
// POS returns must go through the dedicated sales-return backend (`sales_return_create`),
// which restocks items, records the cash refund or customer credit, and enqueues
// SALES_RETURN_CREATED for sync. They must never be sent to the sale-completion path.

import { returnsApi } from '@/services/returns.api';
import type {
  CreateSalesReturnLineDto,
  SaleReturnableLineDto,
} from '@/lib/tauri/tauriClient';

export interface ReturnCartItem {
  productId: string;
  productName: string;
  quantity: number;
}

export const WALK_IN_RETURN_BLOCKED_MESSAGE =
  'Cash Return needs the original invoice. Use "Return by Invoice" to load it first. ' +
  'Returns without an invoice are not supported yet.';

export const EXCHANGE_BLOCKED_MESSAGE =
  'Exchange cannot be completed yet: returned items would be recorded as a sale. ' +
  'Process the return with "Return by Invoice" + "Cash Return", then sell the new items as a normal sale.';

export const INVOICE_LOADED_CHECKOUT_BLOCKED_MESSAGE =
  'An invoice is loaded for return. Use "Cash Return" to refund it, or clear the cart to start a new sale.';

/**
 * Maps POS cart items onto the original sale's returnable lines.
 * A product may appear on several sale lines; quantities are allocated line by line.
 * Throws if an item is not on the invoice or more is requested than can still be returned.
 */
export function allocateReturnLines(
  cartItems: ReturnCartItem[],
  returnableLines: SaleReturnableLineDto[],
): CreateSalesReturnLineDto[] {
  const remaining = new Map<string, number>();
  for (const line of returnableLines) {
    remaining.set(line.sale_line_id, line.returnable_quantity);
  }

  const allocated = new Map<string, number>();

  for (const item of cartItems) {
    const requested = Math.abs(Math.trunc(item.quantity));
    if (requested <= 0) continue;

    let left = requested;
    for (const line of returnableLines) {
      if (left === 0) break;
      if (line.product_id !== item.productId) continue;
      const available = remaining.get(line.sale_line_id) ?? 0;
      if (available <= 0) continue;
      const take = Math.min(available, left);
      remaining.set(line.sale_line_id, available - take);
      allocated.set(line.sale_line_id, (allocated.get(line.sale_line_id) ?? 0) + take);
      left -= take;
    }

    if (left > 0) {
      throw new Error(
        `Cannot return ${requested} x "${item.productName}": only ${requested - left} can still be returned on this invoice.`,
      );
    }
  }

  const lines = Array.from(allocated.entries()).map(([sale_line_id, quantity]) => ({
    sale_line_id,
    quantity,
  }));

  if (lines.length === 0) {
    throw new Error('No items to return.');
  }
  return lines;
}

/**
 * Creates a proper sales return (cash refund) against the linked invoice.
 * The backend computes the refund amount from the original sale lines.
 */
export async function createCashReturnForInvoice(
  saleId: string,
  cartItems: ReturnCartItem[],
) {
  const info = await returnsApi.getSaleReturnableInfo(saleId);
  const lines = allocateReturnLines(cartItems, info.lines);
  return returnsApi.createSalesReturn({
    sale_id: info.sale_id,
    lines,
    refund_method: 'CASH',
    reason: 'POS Cash Return',
    notes: null,
  });
}
