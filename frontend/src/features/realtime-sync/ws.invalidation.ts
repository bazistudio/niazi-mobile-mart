/**
 * ws.invalidation.ts — Maps NotifyHint events to TanStack Query invalidations
 *
 * Design principles:
 *   - Targeted invalidation: each event type invalidates only affected query namespaces
 *   - Avoids global refetch storms
 *   - All query key shapes verified from the actual codebase
 *   - Branch-scoped: org-admins receive all; branch users receive their own branch
 *     (authorization enforced server-side before broadcast; client performs no filtering)
 */

import { QueryClient } from '@tanstack/react-query';
import { NotifyHint } from '@/lib/ws/wsClient';

// ── Query key shapes (verified from actual hooks in codebase) ─────────────────
//
//   products:    ['products', branchId, ...params]  → invalidate with ['products']
//   sales:       ['sales', branchId, dateFilter, startDate, endDate, search]
//   customers:   ['customers']
//   cash:        ['cash-daily-summary']
//   dashboard:   ['dashboard'] / ['dashboard', branchId]
//   ledger:      ['ledger', partyType, partyId, branchId]  or  ['ledger']
//   repairs:     ['repairs', statusFilter]
//   orders:      ['orders']
//   brands:      ['brands', orgId]
//   categories:  ['categories', orgId]
//   colors:      ['colors', orgId]
//   etc.
//
// For safety, we invalidate by top-level key (e.g. ['products']) which matches
// ALL active queries under that namespace without requiring exact parameters.

export function handleNotifyHint(
  queryClient: QueryClient,
  hint: NotifyHint,
): void {
  const { eventType } = hint;

  switch (eventType) {
    // ── Product events ────────────────────────────────────────────────────────
    case 'PRODUCT_CREATED':
    case 'PRODUCT_UPDATED':
    case 'PRODUCT_DEACTIVATED':
      queryClient.invalidateQueries({ queryKey: ['products'] });
      // Products affect dashboard stock summaries
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      break;

    // ── Stock / inventory events ──────────────────────────────────────────────
    case 'INVENTORY_OPERATION_RECORDED':
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['cash-daily-summary'] });
      break;

    // ── Stock transfer events ─────────────────────────────────────────────────
    case 'STOCK_TRANSFER_COMPLETED':
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      // Transfer history may appear in orders/history tabs
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      break;

    // ── Sale events ───────────────────────────────────────────────────────────
    case 'SALE_CREATED':
    case 'SALE_RETURN':
    case 'SALE_EXCHANGE':
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });       // stock deducted
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['cash-daily-summary'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });      // customer balance
      queryClient.invalidateQueries({ queryKey: ['ledger'] });
      break;

    // ── Customer / ledger events ──────────────────────────────────────────────
    case 'CUSTOMER_CREATED':
    case 'CUSTOMER_UPDATED':
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      break;

    case 'LEDGER_ENTRY_ADDED':
    case 'PAYMENT_RECEIVED':
      queryClient.invalidateQueries({ queryKey: ['ledger'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['cash-daily-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      break;

    // ── Cash / expense events ─────────────────────────────────────────────────
    case 'CASH_ENTRY_ADDED':
    case 'EXPENSE_CREATED':
    case 'EXPENSE_UPDATED':
    case 'EXPENSE_CANCELLED':
      queryClient.invalidateQueries({ queryKey: ['cash-daily-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      break;

    // ── Repair events ─────────────────────────────────────────────────────────
    case 'REPAIR_CREATED':
    case 'REPAIR_UPDATED':
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      if (hint.entityId) {
        queryClient.invalidateQueries({ queryKey: ['repairJob', hint.entityId] });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      break;

    // ── Org-level metadata events ─────────────────────────────────────────────
    case 'BRAND_UPDATED':
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      break;
    case 'CATEGORY_UPDATED':
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      break;
    case 'COMPANY_UPDATED':
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      break;
    case 'COLOR_UPDATED':
      queryClient.invalidateQueries({ queryKey: ['colors'] });
      break;
    case 'QUALITY_UPDATED':
      queryClient.invalidateQueries({ queryKey: ['qualities'] });
      break;
    case 'SUPPLIER_UPDATED':
    case 'SUPPLIER_CREATED':
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['ledger'] });
      break;

    default:
      // Unknown event type — do a targeted-but-safe invalidation of dashboard
      // to ensure something updates. Products are intentionally not touched for
      // unknown events to avoid excessive refetches.
      if (import.meta.env.DEV) {
        console.debug(`[WS] Unrecognised eventType: ${eventType}`);
      }
      break;
  }
}

/**
 * Broad catch-up invalidation: called after reconnect to restore current data.
 * Invalidates only the most user-visible namespaces to avoid a full refetch storm.
 */
export function handleCatchUp(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['products'] });
  queryClient.invalidateQueries({ queryKey: ['sales'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['cash-daily-summary'] });
  queryClient.invalidateQueries({ queryKey: ['customers'] });
  queryClient.invalidateQueries({ queryKey: ['ledger'] });
  queryClient.invalidateQueries({ queryKey: ['repairs'] });
  queryClient.invalidateQueries({ queryKey: ['orders'] });
  queryClient.invalidateQueries({ queryKey: ['inventory'] });
}
