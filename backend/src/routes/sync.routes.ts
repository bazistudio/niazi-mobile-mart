/**
 * Sync Routes — TypeScript Backend Online Authority
 *
 * Implements the server-side half of the offline-first sync pipeline.
 *
 *   POST /api/v1/sync/push
 *     Receives batched outbox events from desktop Rust sync worker.
 *     Processes PRODUCT_CREATED, PRODUCT_UPDATED, INVENTORY_OPERATION_RECORDED.
 *     Writes to change_log and sync_audit for idempotency.
 *     Returns per-event ack: { results: [{ client_event_id, server_event_id, status }] }
 *
 *   GET  /api/v1/sync/pull?after_sequence=N&limit=100
 *     Returns change_log rows after the given sequence for a given organization.
 *     Returns: { changes: [...], next_sequence: N, has_more: bool }
 *
 * Security: Both routes require a valid Bearer JWT (authMiddleware).
 * Idempotency: sync_audit.client_event_id is UNIQUE — duplicate pushes are silently skipped.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, RequestIdentity } from '../auth';
import {
  createProductWithInitialStock,
  updateProduct,
  adjustStock,
  getProductById,
  CreateProductDto,
  UpdateProductDto,
} from '../repositories/product.repo';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NIAZI_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_MAIN_BRANCH_ID = '00000000-0000-0000-0000-000000000002';

function NOW_ISO(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Entity-type helpers
// ---------------------------------------------------------------------------

function entityTypeForEvent(eventType: string): string {
  if (eventType.startsWith('PRODUCT')) return 'PRODUCT';
  if (eventType.startsWith('INVENTORY')) return 'INVENTORY';
  if (eventType.startsWith('SALE')) return 'SALE';
  if (eventType.startsWith('CUSTOMER')) return 'CUSTOMER';
  if (eventType.startsWith('SUPPLIER')) return 'SUPPLIER';
  return 'UNKNOWN';
}

function entityIdFromPayload(payload: Record<string, unknown>, eventType: string): string {
  // PRODUCT_CREATED / PRODUCT_UPDATED: payload.id is the product UUID
  if (typeof payload['id'] === 'string') return payload['id'];
  // INVENTORY_OPERATION_RECORDED: payload.product_id
  if (typeof payload['product_id'] === 'string') return payload['product_id'];
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Terminal auto-registration
// ---------------------------------------------------------------------------

/**
 * Upsert a terminal into the `terminals` table.
 * This is needed because sync_audit has a FK on terminal_id.
 * If the terminal is unknown (newly registered desktop), we register it on first push.
 */
async function ensureTerminal(
  pool: Pool,
  terminalId: string,
  organizationId: string,
  branchId: string
): Promise<void> {
  const now = NOW_ISO();
  await pool.query(
    `INSERT INTO terminals (id, organization_id, branch_id, device_name, is_active, is_offline_terminal, registered_centrally, created_at, updated_at, last_seen_at)
     VALUES ($1, $2, $3, 'Desktop Terminal', 1, 1, 1, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at, updated_at = EXCLUDED.updated_at`,
    [terminalId, organizationId, branchId, now, now, now]
  );
}

// ---------------------------------------------------------------------------
// Event processor: PRODUCT_CREATED
// ---------------------------------------------------------------------------

async function handleProductCreated(
  pool: Pool,
  payload: Record<string, unknown>,
  userId: string
): Promise<{ status: 'SYNCED' | 'FAILED_PERMANENT' | 'DEPENDENCY_NOT_FOUND'; error?: string }> {
  const id = payload['id'] as string | undefined;
  if (!id || typeof id !== 'string' || id.length !== 36) {
    return { status: 'FAILED_PERMANENT', error: 'PRODUCT_CREATED payload missing id' };
  }

  // Check if product already exists (idempotency at product level)
  const existing = await getProductById(pool, id);
  if (existing) {
    // Already exists — treat as SYNCED (idempotent)
    return { status: 'SYNCED' };
  }

  const dto: CreateProductDto = {
    name: String(payload['name'] ?? 'Unknown'),
    sku: String(payload['sku'] ?? `SKU-${Date.now()}`),
    barcode: payload['barcode'] != null ? String(payload['barcode']) : null,
    category_id: String(payload['category_id'] ?? '00000000-0000-0000-0000-000000000001'),
    brand_id: payload['brand_id'] != null ? String(payload['brand_id']) : null,
    company_id: payload['company_id'] != null ? String(payload['company_id']) : null,
    quality_id: payload['quality_id'] != null ? String(payload['quality_id']) : null,
    color_id: payload['color_id'] != null ? String(payload['color_id']) : null,
    unit_id: payload['unit_id'] != null ? String(payload['unit_id']) : null,
    purchase_price: Math.round(Number(payload['purchase_price'] ?? 0)),
    average_cost: payload['average_cost'] != null ? Math.round(Number(payload['average_cost'])) : null,
    sale_price: Math.round(Number(payload['sale_price'] ?? 0)),
    low_stock_threshold: payload['low_stock_threshold'] != null ? Number(payload['low_stock_threshold']) : 5,
    description: payload['description'] != null ? String(payload['description']) : null,
    initial_quantity: payload['initial_quantity'] != null ? Number(payload['initial_quantity']) : null,
    branch_id: payload['branch_id'] != null ? String(payload['branch_id']) : DEFAULT_MAIN_BRANCH_ID,
  };

  try {
    await createProductWithInitialStock(pool, id, dto, userId);
    return { status: 'SYNCED' };
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    // FK violation: depends on another entity not yet synced
    if (msg.includes('foreign key') || msg.includes('violates') || msg.includes('23503')) {
      return { status: 'DEPENDENCY_NOT_FOUND', error: msg };
    }
    return { status: 'FAILED_PERMANENT', error: msg };
  }
}

// ---------------------------------------------------------------------------
// Event processor: PRODUCT_UPDATED
// ---------------------------------------------------------------------------

async function handleProductUpdated(
  pool: Pool,
  payload: Record<string, unknown>
): Promise<{ status: 'SYNCED' | 'FAILED_PERMANENT' | 'DEPENDENCY_NOT_FOUND'; error?: string }> {
  const id = payload['id'] as string | undefined;
  if (!id || typeof id !== 'string' || id.length !== 36) {
    return { status: 'FAILED_PERMANENT', error: 'PRODUCT_UPDATED payload missing id' };
  }

  const dto: UpdateProductDto = {
    name: payload['name'] != null ? String(payload['name']) : undefined,
    sku: payload['sku'] != null ? String(payload['sku']) : undefined,
    barcode: payload['barcode'] != null ? String(payload['barcode']) : null,
    category_id: payload['category_id'] != null ? String(payload['category_id']) : undefined,
    brand_id: payload['brand_id'] != null ? String(payload['brand_id']) : undefined,
    company_id: payload['company_id'] != null ? String(payload['company_id']) : undefined,
    quality_id: payload['quality_id'] != null ? String(payload['quality_id']) : undefined,
    color_id: payload['color_id'] != null ? String(payload['color_id']) : undefined,
    unit_id: payload['unit_id'] != null ? String(payload['unit_id']) : undefined,
    purchase_price: payload['purchase_price'] != null ? Math.round(Number(payload['purchase_price'])) : undefined,
    average_cost: payload['average_cost'] != null ? Math.round(Number(payload['average_cost'])) : undefined,
    sale_price: payload['sale_price'] != null ? Math.round(Number(payload['sale_price'])) : undefined,
    low_stock_threshold: payload['low_stock_threshold'] != null ? Number(payload['low_stock_threshold']) : undefined,
    description: payload['description'] != null ? String(payload['description']) : null,
  };

  try {
    await updateProduct(pool, id, dto);
    return { status: 'SYNCED' };
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (msg.includes('not found') || msg.includes('404')) {
      return { status: 'DEPENDENCY_NOT_FOUND', error: `Product ${id} not found` };
    }
    return { status: 'FAILED_PERMANENT', error: msg };
  }
}

// ---------------------------------------------------------------------------
// Event processor: INVENTORY_OPERATION_RECORDED
// ---------------------------------------------------------------------------

async function handleInventoryOperation(
  pool: Pool,
  payload: Record<string, unknown>,
  clientEventId: string,
  branchId: string
): Promise<{ status: 'SYNCED' | 'FAILED_PERMANENT' | 'DEPENDENCY_NOT_FOUND'; error?: string }> {
  const productId = payload['product_id'] as string | undefined;
  if (!productId || typeof productId !== 'string' || productId.length !== 36) {
    return { status: 'FAILED_PERMANENT', error: 'INVENTORY_OPERATION_RECORDED payload missing product_id' };
  }

  // Idempotency: check if this exact stock movement was already applied
  // by looking for a stock_movements record with reference_id = clientEventId
  try {
    const dupCheck = await pool.query(
      'SELECT id FROM stock_movements WHERE reference_id = $1 LIMIT 1',
      [clientEventId]
    );
    if (dupCheck.rows.length > 0) {
      // Already applied — idempotent success
      return { status: 'SYNCED' };
    }
  } catch {
    // stock_movements table may not have reference_id — continue anyway
  }

  // Ensure product exists before adjusting stock
  const product = await getProductById(pool, productId);
  if (!product) {
    return { status: 'DEPENDENCY_NOT_FOUND', error: `Product ${productId} not found` };
  }

  const operationType = payload['operation_type'] as string | undefined;
  const targetBranchId = (payload['branch_id'] as string | undefined) ?? branchId;

  try {
    if (operationType === 'ADJUST' || operationType === 'OPENING_STOCK' || !operationType) {
      // Use adjustStock for ADJUST and opening stock (target absolute quantity)
      const targetQty = Number(payload['target_quantity'] ?? payload['resulting_stock'] ?? payload['quantity'] ?? 0);
      await adjustStock(pool, {
        product_id: productId,
        branch_id: targetBranchId,
        target_quantity: targetQty,
        reason: (payload['reason'] as string | undefined) ?? 'Sync Adjustment',
        reference_id: clientEventId,
      });
    } else if (operationType === 'INCREASE' || operationType === 'IN') {
      // Increase: if target_quantity is provided (e.g. opening stock), use it as the
      // authoritative absolute result; otherwise add delta to current stock.
      const explicitTarget = payload['target_quantity'] != null ? Number(payload['target_quantity']) : null;
      let finalQty: number;
      if (explicitTarget !== null) {
        finalQty = explicitTarget;
      } else {
        const delta = Number(payload['quantity'] ?? 0);
        const stockRes = await pool.query(
          'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2',
          [productId, targetBranchId]
        );
        const currentQty = Number(stockRes.rows[0]?.['quantity'] ?? 0);
        finalQty = currentQty + delta;
      }
      await adjustStock(pool, {
        product_id: productId,
        branch_id: targetBranchId,
        target_quantity: finalQty,
        reason: (payload['reason'] as string | undefined) ?? 'Stock Increase',
        reference_id: clientEventId,
      });
    } else if (operationType === 'DECREASE' || operationType === 'OUT') {
      // Decrease: subtract delta from current stock
      const delta = Number(payload['quantity'] ?? 0);
      const stockRes = await pool.query(
        'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2',
        [productId, targetBranchId]
      );
      const currentQty = Number(stockRes.rows[0]?.['quantity'] ?? 0);
      const newQty = Math.max(0, currentQty - delta);
      await adjustStock(pool, {
        product_id: productId,
        branch_id: targetBranchId,
        target_quantity: newQty,
        reason: (payload['reason'] as string | undefined) ?? 'Stock Decrease',
        reference_id: clientEventId,
      });
    } else {
      // Unknown operation type — treat as ADJUST using target_quantity or resulting_stock
      const targetQty = Number(payload['target_quantity'] ?? payload['resulting_stock'] ?? payload['quantity'] ?? 0);
      await adjustStock(pool, {
        product_id: productId,
        branch_id: targetBranchId,
        target_quantity: targetQty,
        reason: (payload['reason'] as string | undefined) ?? `Sync ${operationType}`,
        reference_id: clientEventId,
      });
    }
    return { status: 'SYNCED' };
  } catch (err: any) {
    return { status: 'FAILED_PERMANENT', error: String(err?.message ?? err) };
  }
}

// ---------------------------------------------------------------------------
// change_log + sync_audit writers
// ---------------------------------------------------------------------------

async function writeChangeLog(
  pool: Pool,
  opts: {
    organizationId: string;
    branchId: string;
    clientEventId: string;
    eventType: string;
    entityType: string;
    entityId: string;
    payloadStr: string;
  }
): Promise<string> {
  const now = NOW_ISO();
  const res = await pool.query<{ sequence: string }>(
    `INSERT INTO change_log (organization_id, branch_id, client_event_id, event_type, entity_type, entity_id, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING sequence::text`,
    [
      opts.organizationId,
      opts.branchId,
      opts.clientEventId,
      opts.eventType,
      opts.entityType,
      opts.entityId,
      opts.payloadStr,
      now,
    ]
  );
  return res.rows[0]?.['sequence'] ?? '0';
}

async function writeSyncAudit(
  pool: Pool,
  opts: {
    clientEventId: string;
    terminalId: string;
    organizationId: string;
    branchId: string;
    eventType: string;
    payloadStr: string;
    status: string;
  }
): Promise<void> {
  const id = uuidv4();
  const now = NOW_ISO();
  // ON CONFLICT DO NOTHING ensures idempotency — duplicate client_event_id is silently ignored
  await pool.query(
    `INSERT INTO sync_audit (id, client_event_id, terminal_id, organization_id, branch_id, event_type, payload, status, processed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (client_event_id) DO NOTHING`,
    [
      id,
      opts.clientEventId,
      opts.terminalId,
      opts.organizationId,
      opts.branchId,
      opts.eventType,
      opts.payloadStr,
      opts.status,
      now,
    ]
  );
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function buildSyncRouter(pool: Pool): Router {
  const router = Router();

  // All sync routes require valid Bearer JWT
  router.use(authMiddleware);

  // -------------------------------------------------------------------------
  // POST /api/v1/sync/push
  // -------------------------------------------------------------------------
  router.post('/push', async (req: Request, res: Response): Promise<void> => {
    const identity = (req as unknown as { identity?: RequestIdentity }).identity;
    const userId = identity?.user_id ?? 'system';

    const events: unknown[] = Array.isArray(req.body?.events) ? req.body.events : [];

    if (events.length === 0) {
      res.status(200).json({ results: [] });
      return;
    }

    const results: Array<{
      client_event_id: string;
      server_event_id: string | null;
      status: string;
      error?: string;
    }> = [];

    for (const raw of events) {
      const event = raw as Record<string, unknown>;
      const clientEventId = (event['client_event_id'] as string | undefined) ?? (event['id'] as string | undefined) ?? uuidv4();
      const terminalId = (event['terminal_id'] as string | undefined) ?? 'unknown-terminal';
      const organizationId = (event['organization_id'] as string | undefined) ?? NIAZI_ORGANIZATION_ID;
      const branchId = (event['branch_id'] as string | undefined) ?? DEFAULT_MAIN_BRANCH_ID;
      const eventType = (event['event_type'] as string | undefined) ?? '';
      const payloadStr = typeof event['payload'] === 'string'
        ? event['payload']
        : JSON.stringify(event['payload'] ?? {});

      let payload: Record<string, unknown>;
      try {
        payload = typeof event['payload'] === 'string'
          ? JSON.parse(event['payload'])
          : (event['payload'] as Record<string, unknown>) ?? {};
      } catch {
        results.push({ client_event_id: clientEventId, server_event_id: null, status: 'FAILED_PERMANENT', error: 'Invalid JSON payload' });
        continue;
      }

      // Idempotency: check sync_audit first
      try {
        const existing = await pool.query(
          'SELECT id FROM sync_audit WHERE client_event_id = $1 LIMIT 1',
          [clientEventId]
        );
        if (existing.rows.length > 0) {
          // Already processed — ack as SYNCED without reprocessing
          results.push({ client_event_id: clientEventId, server_event_id: null, status: 'SYNCED' });
          continue;
        }
      } catch {
        // sync_audit table may not exist yet — continue
      }

      // Ensure terminal is registered (auto-register on first push)
      try {
        await ensureTerminal(pool, terminalId, organizationId, branchId);
      } catch {
        // Non-fatal: proceed even if terminal upsert fails (FK may be absent in some schema versions)
      }

      // Process the event by type
      let processResult: { status: 'SYNCED' | 'FAILED_PERMANENT' | 'DEPENDENCY_NOT_FOUND'; error?: string };

      switch (eventType) {
        case 'PRODUCT_CREATED':
          processResult = await handleProductCreated(pool, payload, userId);
          break;
        case 'PRODUCT_UPDATED':
          processResult = await handleProductUpdated(pool, payload);
          break;
        case 'INVENTORY_OPERATION_RECORDED':
          processResult = await handleInventoryOperation(pool, payload, clientEventId, branchId);
          break;
        default:
          // Unknown event type — log to change_log but mark as SYNCED so sync worker moves on
          processResult = { status: 'SYNCED' };
          break;
      }

      const entityType = entityTypeForEvent(eventType);
      const entityId = entityIdFromPayload(payload, eventType);

      let serverEventId: string | null = null;

      if (processResult.status === 'SYNCED') {
        // Write to change_log for downstream pull consumers
        try {
          serverEventId = await writeChangeLog(pool, {
            organizationId,
            branchId,
            clientEventId,
            eventType,
            entityType,
            entityId,
            payloadStr,
          });
        } catch (err) {
          // change_log write failure is logged but does not cause FAILED_PERMANENT
          console.error(`[sync/push] change_log write failed for ${clientEventId}:`, (err as Error).message);
        }

        // Write to sync_audit for idempotency tracking
        try {
          await writeSyncAudit(pool, {
            clientEventId,
            terminalId,
            organizationId,
            branchId,
            eventType,
            payloadStr,
            status: 'SYNCED',
          });
        } catch (err) {
          console.error(`[sync/push] sync_audit write failed for ${clientEventId}:`, (err as Error).message);
        }
      }

      results.push({
        client_event_id: clientEventId,
        server_event_id: serverEventId,
        status: processResult.status,
        ...(processResult.error ? { error: processResult.error } : {}),
      });
    }

    res.status(200).json({ results });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/sync/pull?after_sequence=N&limit=100
  // -------------------------------------------------------------------------
  router.get('/pull', async (req: Request, res: Response): Promise<void> => {
    const identity = (req as unknown as { identity?: RequestIdentity }).identity;
    const organizationId = identity?.organization_id ?? NIAZI_ORGANIZATION_ID;

    const afterSequence = Math.max(0, parseInt(String(req.query['after_sequence'] ?? '0'), 10));
    const rawLimit = parseInt(String(req.query['limit'] ?? '100'), 10);
    const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 100 : rawLimit), 500);
    // Fetch one extra row to determine has_more
    const fetchLimit = limit + 1;

    try {
      const result = await pool.query<{
        sequence: string;
        organization_id: string;
        branch_id: string;
        client_event_id: string | null;
        event_type: string;
        entity_type: string;
        entity_id: string;
        payload: string;
        created_at: string;
      }>(
        `SELECT sequence::text, organization_id, branch_id, client_event_id,
                event_type, entity_type, entity_id, payload, created_at
         FROM change_log
         WHERE organization_id = $1 AND sequence > $2
         ORDER BY sequence ASC
         LIMIT $3`,
        [organizationId, afterSequence, fetchLimit]
      );

      const rows = result.rows;
      const hasMore = rows.length === fetchLimit;
      const changes = hasMore ? rows.slice(0, limit) : rows;
      const nextSequence = changes.length > 0
        ? Number(changes[changes.length - 1]!['sequence'])
        : afterSequence;

      res.status(200).json({
        changes: changes.map((r) => ({
          sequence: Number(r.sequence),
          organization_id: r.organization_id,
          branch_id: r.branch_id,
          client_event_id: r.client_event_id,
          event_type: r.event_type,
          entity_type: r.entity_type,
          entity_id: r.entity_id,
          payload: r.payload,
          created_at: r.created_at,
        })),
        next_sequence: nextSequence,
        has_more: hasMore,
      });
    } catch (err: any) {
      console.error('[sync/pull] Failed to query change_log:', err.message);
      res.status(500).json({ error: 'Failed to fetch changes', detail: err.message });
    }
  });

  return router;
}
