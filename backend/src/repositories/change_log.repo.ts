/**
 * change_log.repo.ts
 *
 * Shared transactional helpers for writing change_log records and issuing
 * PostgreSQL NOTIFY within the same transaction.
 *
 * CONTRACT:
 *   - Every function that writes change_log MUST be called inside an open
 *     transaction (BEGIN issued by the caller, COMMIT/ROLLBACK by caller).
 *   - pg_notify() is called inside the same transaction so PostgreSQL only
 *     delivers the notification after the transaction commits successfully.
 *     A rolled-back transaction causes the notification to be discarded.
 *   - Payload sent via NOTIFY is a minimal invalidation hint — it never
 *     carries raw change_log.payload or full business records.
 *
 * NOTIFY channel: 'nmm_realtime'
 * Payload structure (JSON string, max ~8000 bytes for pg NOTIFY safety):
 *   {
 *     v: 1,                          // schema version
 *     orgId: string,
 *     branchId: string | null,       // null for org-wide events
 *     eventType: string,             // e.g. 'PRODUCT_CREATED'
 *     entityType: string,            // e.g. 'product'
 *     entityId: string,
 *     sequence: string,              // change_log.sequence as text
 *   }
 */

import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export const REALTIME_NOTIFY_CHANNEL = 'nmm_realtime';

/** Minimal invalidation hint broadcast via pg NOTIFY */
export interface NotifyHint {
  v: 1;
  orgId: string;
  branchId: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  sequence: string;
}

export interface WriteChangeLogOpts {
  organizationId?: string;
  branchId?: string | null;
  clientEventId?: string;
  eventType?: string;
  entityType?: string;
  entityId?: string;
  payloadStr?: string;
  event_type?: string;
  entity_type?: string;
  entity_id?: string;
  organization_id?: string;
  branch_id?: string | null;
  changed_by?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Write one change_log row and issue a PostgreSQL NOTIFY within the same
 * open transaction.  Returns the sequence number as a string.
 *
 * Must be called with an active PoolClient that is inside a BEGIN block.
 * The caller is responsible for COMMIT / ROLLBACK.
 */
export async function writeChangeLogEntry(
  client: PoolClient,
  opts: WriteChangeLogOpts
): Promise<string> {
  const clientEventId = opts.clientEventId ?? uuidv4();
  const now = new Date().toISOString();
  const orgId = opts.organizationId ?? opts.organization_id ?? '00000000-0000-0000-0000-000000000001';
  const branchId = opts.branchId !== undefined ? opts.branchId : (opts.branch_id ?? null);
  const evType = opts.eventType ?? opts.event_type ?? 'UNKNOWN';
  const entType = opts.entityType ?? opts.entity_type ?? 'unknown';
  const entId = opts.entityId ?? opts.entity_id ?? '';
  const payloadStr = opts.payloadStr ?? JSON.stringify(opts.metadata ?? {});

  const res = await client.query<{ sequence: string }>(
    `INSERT INTO change_log
       (organization_id, branch_id, client_event_id, event_type,
        entity_type, entity_id, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING sequence::text`,
    [
      orgId,
      branchId,
      clientEventId,
      evType,
      entType,
      entId,
      payloadStr,
      now,
    ]
  );

  const sequence: string = res.rows[0]?.sequence ?? '0';

  const hint: NotifyHint = {
    v: 1,
    orgId,
    branchId,
    eventType: evType,
    entityType: entType,
    entityId: entId,
    sequence,
  };

  await client.query(`SELECT pg_notify($1, $2)`, [
    REALTIME_NOTIFY_CHANNEL,
    JSON.stringify(hint),
  ]);

  return sequence;
}

export async function writeChangeLogOrgWide(
  client: PoolClient,
  opts: WriteChangeLogOpts & { notifyBranchId: null }
): Promise<string> {
  const clientEventId = opts.clientEventId ?? uuidv4();
  const now = new Date().toISOString();

  const res = await client.query<{ sequence: string }>(
    `INSERT INTO change_log
       (organization_id, branch_id, client_event_id, event_type,
        entity_type, entity_id, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING sequence::text`,
    [
      opts.organizationId,
      opts.branchId,
      clientEventId,
      opts.eventType,
      opts.entityType,
      opts.entityId,
      opts.payloadStr,
      now,
    ]
  );

  const sequence: string = res.rows[0]?.sequence ?? '0';

  const hint: NotifyHint = {
    v: 1,
    orgId: opts.organizationId ?? opts.organization_id ?? '00000000-0000-0000-0000-000000000001',
    branchId: null, // org-wide: all branches of this org receive the invalidation
    eventType: opts.eventType ?? opts.event_type ?? 'UNKNOWN',
    entityType: opts.entityType ?? opts.entity_type ?? 'unknown',
    entityId: opts.entityId ?? opts.entity_id ?? '',
    sequence,
  };

  await client.query(`SELECT pg_notify($1, $2)`, [
    REALTIME_NOTIFY_CHANNEL,
    JSON.stringify(hint),
  ]);

  return sequence;
}
