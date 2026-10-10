/**
 * Sync Routes — TypeScript Backend Online Authority
 *
 * Implements the server-side half of the offline-first sync pipeline.
 *
 *   POST /api/v1/sync/push
 *     Receives batched outbox events from desktop Rust sync worker.
 *     Processes PRODUCT_CREATED, PRODUCT_UPDATED, INVENTORY_OPERATION_RECORDED,
 *     and PARTY_UPSERTED (change_log broadcast only).
 *     All other event types in KNOWN_SERVER_EVENT_TYPES are explicitly rejected
 *     with FAILED_PERMANENT / UNSUPPORTED_EVENT (no active server handler yet).
 *     Truly unknown event types (not in the registry) are rejected with UNKNOWN_EVENT_TYPE.
 *     Business write, sync_audit, and change_log are coordinated in a single PostgreSQL
 *     transaction — partial success is not possible.
 *     Returns per-event ack: { results: [{ client_event_id, server_event_id, status, error? }] }
 *
 *   GET  /api/v1/sync/pull?after_sequence=N&limit=100
 *     Returns change_log rows after the given sequence for a given organization.
 *     Returns: { changes: [...], next_sequence: N, has_more: bool }
 *
 * Security: Both routes require a valid Bearer JWT (authMiddleware).
 * Idempotency: sync_audit.client_event_id is UNIQUE — duplicate pushes are silently skipped.
 *
 * Supported event types (active server handlers):
 *   PRODUCT_CREATED, PRODUCT_UPDATED, INVENTORY_OPERATION_RECORDED, PARTY_UPSERTED
 *
 * Explicitly rejected event types (no server handler — UNSUPPORTED_EVENT):
 *   SALE_CREATED, SALES_RETURN_CREATED, PURCHASE_CREATED, PURCHASE_RETURN_CREATED,
 *   EXPENSE_CREATED, CUSTOMER_CREATED, CUSTOMER_UPDATED, CUSTOMER_PAYMENT_RECORDED,
 *   SUPPLIER_CREATED, SUPPLIER_UPDATED, SUPPLIER_PAYMENT_RECORDED, PRODUCT_DEACTIVATED,
 *   CATEGORY_CREATED, BRAND_CREATED, UNIT_CREATED, COMPANY_CREATED, QUALITY_CREATED,
 *   COLOR_CREATED
 */

import { Router, Request, Response } from 'express';
import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, RequestIdentity, NIAZI_ORGANIZATION_ID } from '../auth';
import {
  createProductWithInitialStock,
  updateProduct,
  getProductById,
  CreateProductDto,
  UpdateProductDto,
} from '../repositories/product.repo';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// NIAZI_ORGANIZATION_ID is imported from auth.ts — the single source of truth.
const DEFAULT_MAIN_BRANCH_ID = '00000000-0000-0000-0000-000000000002';

function NOW_ISO(): string {
  return new Date().toISOString();
}

/**
 * Event types the server push handler explicitly knows about.
 * This must stay in sync with KNOWN_SERVER_EVENT_TYPES in src-tauri/src/domain/sync_queue.rs.
 *
 * ACTIVE HANDLERS (business write performed):
 *   PRODUCT_CREATED, PRODUCT_UPDATED, INVENTORY_OPERATION_RECORDED
 *
 * DOWNSTREAM COMPATIBILITY HANDLERS (change_log write only, no separate data table):
 *   PARTY_UPSERTED
 *
 * EXPLICITLY UNSUPPORTED (FAILED_PERMANENT — no active server handler yet):
 *   All remaining types below. The client must NOT retry FAILED_PERMANENT events
 *   without a corresponding server upgrade.
 */
const KNOWN_SERVER_EVENT_TYPES = new Set([
  // Active handlers
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'INVENTORY_OPERATION_RECORDED',
  // Downstream compatibility — change_log only
  'PARTY_UPSERTED',
  // Explicitly unsupported (no handler implemented)
  'SALE_CREATED',
  'SALES_RETURN_CREATED',
  'PURCHASE_CREATED',
  'PURCHASE_RETURN_CREATED',
  'EXPENSE_CREATED',
  'CUSTOMER_CREATED',
  'CUSTOMER_UPDATED',
  'CUSTOMER_PAYMENT_RECORDED',
  'SUPPLIER_CREATED',
  'SUPPLIER_UPDATED',
  'SUPPLIER_PAYMENT_RECORDED',
  'PRODUCT_DEACTIVATED',
  'CATEGORY_CREATED',
  'BRAND_CREATED',
  'UNIT_CREATED',
  'COMPANY_CREATED',
  'QUALITY_CREATED',
  'COLOR_CREATED',
]);

// ---------------------------------------------------------------------------
// Entity-type helpers
// ---------------------------------------------------------------------------

function entityTypeForEvent(eventType: string): string {
  if (eventType.startsWith('PRODUCT')) return 'PRODUCT';
  if (eventType.startsWith('INVENTORY')) return 'INVENTORY';
  if (eventType.startsWith('SALE')) return 'SALE';
  if (eventType.startsWith('CUSTOMER')) return 'CUSTOMER';
  if (eventType.startsWith('SUPPLIER')) return 'SUPPLIER';
  if (eventType === 'PARTY_UPSERTED') return 'PARTY';
  return 'UNKNOWN';
}

function entityIdFromPayload(payload: Record<string, unknown>, eventType: string): string {
  if (typeof payload['id'] === 'string') return payload['id'];
  if (typeof payload['product_id'] === 'string') return payload['product_id'];
  if (typeof payload['party_id'] === 'string') return payload['party_id'];
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Terminal auto-registration — with branch → organization validation
// ---------------------------------------------------------------------------

/**
 * Upsert a terminal into the `terminals` table.
 * This is needed because sync_audit has a FK on terminal_id.
 * If the terminal is unknown (newly registered desktop), we register it on first push.
 *
 * Security: validates that branchId belongs to organizationId before registration.
 * Rejects cross-organization terminal registration attempts.
 */
async function ensureTerminal(
  client: PoolClient,
  terminalId: string,
  organizationId: string,
  branchId: string
): Promise<void> {
  // Validate that the branch belongs to the authenticated organization.
  // This prevents cross-organization terminal registration via a spoofed branchId.
  const branchCheck = await client.query<{ organization_id: string; is_active: number }>(
    `SELECT organization_id, is_active FROM branches WHERE id = $1 LIMIT 1`,
    [branchId]
  );

  if (branchCheck.rows.length === 0) {
    throw new Error(`INVALID_BRANCH: Branch ${branchId} does not exist`);
  }

  const branch = branchCheck.rows[0]!;
  if (branch.organization_id !== organizationId) {
    throw new Error(
      `CROSS_ORG_BRANCH: Branch ${branchId} belongs to organization ${branch.organization_id}, not ${organizationId}`
    );
  }

  if (!branch.is_active) {
    throw new Error(`INACTIVE_BRANCH: Branch ${branchId} is inactive`);
  }

  const now = NOW_ISO();
  await client.query(
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
  client: PoolClient,
  payload: Record<string, unknown>,
  userId: string
): Promise<{ status: 'SYNCED' | 'FAILED_PERMANENT' | 'DEPENDENCY_NOT_FOUND'; error?: string }> {
  const id = payload['id'] as string | undefined;
  if (!id || typeof id !== 'string' || id.length !== 36) {
    return { status: 'FAILED_PERMANENT', error: 'PRODUCT_CREATED payload missing id' };
  }

  // Check if product already exists (idempotency at product level)
  const existing = await getProductById(client as unknown as Pool, id);
  if (existing) {
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
    await createProductWithInitialStock(client as unknown as Pool, id, dto, userId);
    return { status: 'SYNCED' };
  } catch (err: any) {
    const msg = String(err?.message ?? err);
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
  client: PoolClient,
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
    await updateProduct(client as unknown as Pool, id, dto);
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
  client: PoolClient,
  payload: Record<string, unknown>,
  clientEventId: string,
  branchId: string
): Promise<{ status: 'SYNCED' | 'FAILED_PERMANENT' | 'DEPENDENCY_NOT_FOUND' | 'CONFLICT'; error?: string }> {
  const productId = payload['product_id'] as string | undefined;
  if (!productId || typeof productId !== 'string' || productId.length !== 36) {
    return { status: 'FAILED_PERMANENT', error: 'INVENTORY_OPERATION_RECORDED payload missing product_id' };
  }

  // Idempotency: check if this exact stock movement was already applied
  try {
    const dupCheck = await client.query(
      'SELECT id FROM stock_movements WHERE reference_id = $1 LIMIT 1',
      [clientEventId]
    );
    if (dupCheck.rows.length > 0) {
      return { status: 'SYNCED' };
    }
  } catch {
    // stock_movements table may not have reference_id — continue
  }

  // Ensure product exists before adjusting stock
  const product = await getProductById(client as unknown as Pool, productId);
  if (!product) {
    return { status: 'DEPENDENCY_NOT_FOUND', error: `Product ${productId} not found` };
  }

  const operationType = payload['operation_type'] as string | undefined;
  const targetBranchId = (payload['branch_id'] as string | undefined) ?? branchId;
  const now = NOW_ISO();

  try {
    if (operationType === 'ADJUST' || operationType === 'OPENING_STOCK' || !operationType) {
      // Absolute target quantity — safe to use direct SET
      const targetQty = Math.max(0, Math.round(Number(
        payload['target_quantity'] ?? payload['resulting_stock'] ?? payload['quantity'] ?? 0
      )));
      await client.query(
        `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, branch_id) DO UPDATE
           SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at`,
        [productId, targetBranchId, targetQty, now]
      );
    } else if (operationType === 'INCREASE' || operationType === 'IN') {
      if (payload['target_quantity'] != null) {
        // Authoritative absolute target — use direct SET
        const targetQty = Math.max(0, Math.round(Number(payload['target_quantity'])));
        await client.query(
          `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (product_id, branch_id) DO UPDATE
             SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at`,
          [productId, targetBranchId, targetQty, now]
        );
      } else {
        // Relative delta — use atomic increment; no application-level read
        const delta = Math.max(0, Math.round(Number(payload['quantity'] ?? 0)));
        await client.query(
          `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (product_id, branch_id) DO UPDATE
             SET quantity = stock.quantity + $3, updated_at = $4`,
          [productId, targetBranchId, delta, now]
        );
      }
    } else if (operationType === 'DECREASE' || operationType === 'OUT') {
      // Atomic decrement: only succeeds when sufficient stock exists.
      // Returns 0 rows if quantity < delta — triggers CONFLICT (not silent clamp).
      const delta = Math.max(0, Math.round(Number(payload['quantity'] ?? 0)));
      const decreaseRes = await client.query<{ quantity: number }>(
        `UPDATE stock
         SET quantity = quantity - $1, updated_at = $2
         WHERE product_id = $3 AND branch_id = $4 AND quantity >= $1
         RETURNING quantity`,
        [delta, now, productId, targetBranchId]
      );
      if (decreaseRes.rowCount === 0) {
        // Either stock row missing or insufficient quantity
        const stockRow = await client.query<{ quantity: number }>(
          'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 LIMIT 1',
          [productId, targetBranchId]
        );
        const available = stockRow.rows[0]?.quantity ?? 0;
        return {
          status: 'CONFLICT',
          error: `INSUFFICIENT_STOCK: product=${productId} branch=${targetBranchId} available=${available} requested=${delta}`,
        };
      }
    } else if (operationType === 'TRANSFER') {
      // Transfer: deduct from source branch, credit destination branch atomically.
      const toBranchId = payload['to_branch_id'] as string | undefined;
      if (!toBranchId || typeof toBranchId !== 'string' || toBranchId.length !== 36) {
        return { status: 'FAILED_PERMANENT', error: 'TRANSFER payload missing to_branch_id' };
      }
      const delta = Math.max(0, Math.round(Number(payload['quantity'] ?? 0)));

      // Atomic source deduction — fails if insufficient
      const srcRes = await client.query<{ quantity: number }>(
        `UPDATE stock
         SET quantity = quantity - $1, updated_at = $2
         WHERE product_id = $3 AND branch_id = $4 AND quantity >= $1
         RETURNING quantity`,
        [delta, now, productId, targetBranchId]
      );
      if (srcRes.rowCount === 0) {
        const stockRow = await client.query<{ quantity: number }>(
          'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 LIMIT 1',
          [productId, targetBranchId]
        );
        const available = stockRow.rows[0]?.quantity ?? 0;
        return {
          status: 'CONFLICT',
          error: `INSUFFICIENT_STOCK_FOR_TRANSFER: product=${productId} src=${targetBranchId} available=${available} requested=${delta}`,
        };
      }

      // Atomic destination credit — must succeed or the whole transaction rolls back
      await client.query(
        `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, branch_id) DO UPDATE
           SET quantity = stock.quantity + $3, updated_at = $4`,
        [productId, toBranchId, delta, now]
      );
    } else {
      // Unknown operation sub-type within INVENTORY_OPERATION_RECORDED
      return {
        status: 'FAILED_PERMANENT',
        error: `UNSUPPORTED_OPERATION_TYPE: ${operationType} is not a recognized inventory operation`,
      };
    }

    return { status: 'SYNCED' };
  } catch (err: any) {
    return { status: 'FAILED_PERMANENT', error: String(err?.message ?? err) };
  }
}

// ---------------------------------------------------------------------------
// change_log + sync_audit writers (transactional — called inside BEGIN/COMMIT)
// ---------------------------------------------------------------------------

async function writeChangeLog(
  client: PoolClient,
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
  const res = await client.query<{ sequence: string }>(
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
  client: PoolClient,
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
  // ON CONFLICT DO NOTHING: idempotency — duplicate client_event_id is silently ignored
  await client.query(
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

      // --- Idempotency guard: check sync_audit before acquiring transaction ---
      // If already processed, ack immediately without touching the DB further.
      try {
        const existing = await pool.query(
          'SELECT id FROM sync_audit WHERE client_event_id = $1 LIMIT 1',
          [clientEventId]
        );
        if (existing.rows.length > 0) {
          results.push({ client_event_id: clientEventId, server_event_id: null, status: 'SYNCED' });
          continue;
        }
      } catch {
        // sync_audit may not exist yet — proceed
      }

      // --- Classify event type BEFORE entering transaction ---
      // Truly unknown events (not in registry) are rejected immediately.
      if (eventType === '' || !KNOWN_SERVER_EVENT_TYPES.has(eventType)) {
        results.push({
          client_event_id: clientEventId,
          server_event_id: null,
          status: 'FAILED_PERMANENT',
          error: `UNKNOWN_EVENT_TYPE: ${eventType} is not in the server event registry`,
        });
        continue;
      }

      // Known but explicitly unsupported event types — reject with FAILED_PERMANENT.
      // These have active Rust outbox producers but no implemented server handler.
      // Client must NOT retry without a corresponding server upgrade.
      const unsupportedEventTypes = new Set([
        'SALE_CREATED',
        'SALES_RETURN_CREATED',
        'PURCHASE_CREATED',
        'PURCHASE_RETURN_CREATED',
        'EXPENSE_CREATED',
        'CUSTOMER_CREATED',
        'CUSTOMER_UPDATED',
        'CUSTOMER_PAYMENT_RECORDED',
        'SUPPLIER_CREATED',
        'SUPPLIER_UPDATED',
        'SUPPLIER_PAYMENT_RECORDED',
        'PRODUCT_DEACTIVATED',
        'CATEGORY_CREATED',
        'BRAND_CREATED',
        'UNIT_CREATED',
        'COMPANY_CREATED',
        'QUALITY_CREATED',
        'COLOR_CREATED',
      ]);

      if (unsupportedEventTypes.has(eventType)) {
        results.push({
          client_event_id: clientEventId,
          server_event_id: null,
          status: 'FAILED_PERMANENT',
          error: `UNSUPPORTED_EVENT: ${eventType} is recognized but has no active server handler in this version`,
        });
        continue;
      }

      // --- Acquire a pooled client and run the event in a single transaction ---
      // Business write + change_log + sync_audit are committed atomically.
      // Any failure rolls back all three — the event must not be permanently marked
      // successful unless the authoritative operation was performed.
      const client = await pool.connect();
      let processResult: {
        status: 'SYNCED' | 'FAILED_PERMANENT' | 'DEPENDENCY_NOT_FOUND' | 'CONFLICT';
        error?: string;
      };
      let serverEventId: string | null = null;

      try {
        await client.query('BEGIN');

        // Validate terminal and branch→org membership inside the transaction.
        // ensureTerminal throws for invalid branch or cross-org mismatch.
        try {
          await ensureTerminal(client, terminalId, organizationId, branchId);
        } catch (termErr: any) {
          const msg = String(termErr?.message ?? termErr);
          // Cross-org or invalid branch is a permanent failure — reject the event.
          // Inactive branch gets FAILED_PERMANENT so the operator can investigate.
          await client.query('ROLLBACK');
          results.push({
            client_event_id: clientEventId,
            server_event_id: null,
            status: 'FAILED_PERMANENT',
            error: `TERMINAL_REGISTRATION_FAILED: ${msg}`,
          });
          continue;
        }

        // --- Dispatch to active event handler ---
        if (eventType === 'PRODUCT_CREATED') {
          processResult = await handleProductCreated(client, payload, userId);
        } else if (eventType === 'PRODUCT_UPDATED') {
          processResult = await handleProductUpdated(client, payload);
        } else if (eventType === 'INVENTORY_OPERATION_RECORDED') {
          processResult = await handleInventoryOperation(client, payload, clientEventId, branchId);
        } else if (eventType === 'PARTY_UPSERTED') {
          // Downstream compatibility path: no separate data table.
          // The change_log write below propagates the party identity update to pull consumers.
          processResult = { status: 'SYNCED' };
        } else {
          // Should be unreachable: filtered above. Defensive catch-all.
          processResult = {
            status: 'FAILED_PERMANENT',
            error: `UNSUPPORTED_EVENT: ${eventType} reached dispatch without a handler`,
          };
        }

        if (processResult.status === 'SYNCED') {
          // --- Atomic: change_log then sync_audit in the same transaction ---
          // If either write fails, the transaction rolls back and the event is NOT
          // permanently marked successful. The client will retry.
          const entityType = entityTypeForEvent(eventType);
          const entityId = entityIdFromPayload(payload, eventType);

          serverEventId = await writeChangeLog(client, {
            organizationId,
            branchId,
            clientEventId,
            eventType,
            entityType,
            entityId,
            payloadStr,
          });

          await writeSyncAudit(client, {
            clientEventId,
            terminalId,
            organizationId,
            branchId,
            eventType,
            payloadStr,
            status: 'SYNCED',
          });

          await client.query('COMMIT');
        } else {
          // Non-SYNCED result: roll back the transaction.
          // CONFLICT and DEPENDENCY_NOT_FOUND are retriable — the client will retry.
          // FAILED_PERMANENT is terminal — the client must not retry without investigation.
          await client.query('ROLLBACK');
        }
      } catch (txErr: any) {
        try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
        processResult = {
          status: 'FAILED_PERMANENT',
          error: `TRANSACTION_ERROR: ${String(txErr?.message ?? txErr)}`,
        };
        serverEventId = null;
      } finally {
        client.release();
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
