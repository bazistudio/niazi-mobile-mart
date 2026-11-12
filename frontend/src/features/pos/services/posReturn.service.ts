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
  'Return needs the original invoice. Use "Return by Invoice" to load it first. ' +
  'Returns without an invoice are not supported yet.';

export const EXCHANGE_BLOCKED_MESSAGE =
  'Exchange cannot be completed yet: returned items would be recorded as a sale. ' +
  'Process the return with "Return by Invoice" + "Return", then sell the new items as a normal sale.';

export const INVOICE_LOADED_CHECKOUT_BLOCKED_MESSAGE =
  'An invoice is loaded for return. Use "Return" to process it, or clear the cart to start a new sale.';

/**
 * Maps POS cart items onto the original sale's returnable lines.
 * A product may appear on several sale lines; quantities are allocated line by line.
 * Throws if an item is not on the invoice or more is requested than can still be returned.
 */
/**
 * Safely extracts the remaining returnable quantity from either Desktop (Rust) or Web (Express) API response.
 */
export function getReturnableQuantity(line: SaleReturnableLineDto): number {
  const qty = line.returnable_quantity ?? line.remaining_quantity;
  if (qty === undefined || qty === null || isNaN(Number(qty))) {
    return 0;
  }
  return Math.max(0, Number(qty));
}

export function allocateReturnLines(
  cartItems: ReturnCartItem[],
  returnableLines: SaleReturnableLineDto[],
): CreateSalesReturnLineDto[] {
  const remaining = new Map<string, number>();
  for (const line of returnableLines) {
    const returnable = getReturnableQuantity(line);
    remaining.set(line.sale_line_id, returnable);
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
 * @deprecated Use createUnifiedReturnForInvoice() instead.
 * Kept for backward compatibility with any remaining call sites.
 * Always uses CASH — does NOT auto-detect customer credit sales.
 */
export async function createCashReturnForInvoice(
  saleId: string,
  cartItems: ReturnCartItem[],
) {
  return createUnifiedReturnForInvoice(saleId, cartItems, 'CASH', 'POS Cash Return');
}

/**
 * Creates a sales return against the linked invoice with the specified refund method.
 * Supports 'CASH' (physical refund) and 'CREDIT' (customer ledger credit).
 * The backend computes refund amounts from original sale lines and enforces
 * remaining returnable quantities.
 */
export async function createReturnForInvoice(
  saleId: string,
  cartItems: ReturnCartItem[],
  refundMethod: 'CASH' | 'CREDIT',
  reason = 'POS Invoice Return',
) {
  return createUnifiedReturnForInvoice(saleId, cartItems, refundMethod, reason);
}

/**
 * Unified return service entry point (Phase 2 canonical implementation).
 *
 * Fetches authoritative returnable info from the backend, allocates quantities
 * to original sale lines, then submits a single return request with the
 * cashier-confirmed refund method.
 *
 * Supported refund methods:
 *   'CASH'   — physical cash refund from drawer; backend enforces open cash session.
 *   'CREDIT' — customer ledger credit entry; no cash movement posted.
 *
 * The backend (returns.repo.ts / sales_return_service.rs) is authoritative for:
 *   - Quantity validation against already_returned_quantity.
 *   - Customer balance calculation.
 *   - Atomic transaction (ledger + cash + stock + return header).
 *
 * Split allocation (partially-paid invoice: credit reversal + cash payout) is
 * handled upstream in processReturn() — the cashier selects one of:
 *   1. Keep excess as customer account advance → 'CREDIT' (backend allows negative balance).
 *   2. Refund excess in cash → 'CASH' for the full return amount.
 * No schema migration is required; the existing single refund_method field is
 * sufficient for each of the two paths the cashier can choose.
 */
export async function createUnifiedReturnForInvoice(
  saleId: string,
  cartItems: ReturnCartItem[],
  refundMethod: 'CASH' | 'CREDIT',
  reason = 'POS Return',
) {
  const info = await returnsApi.getSaleReturnableInfo(saleId);
  const lines = allocateReturnLines(cartItems, info.lines);
  return returnsApi.createSalesReturn({
    sale_id: info.sale_id,
    lines,
    refund_method: refundMethod,
    reason,
    notes: null,
  });
}
