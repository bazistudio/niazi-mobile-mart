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
  organizationId: string;
  branchId: string;
  /** Caller-supplied idempotency ID; defaults to a fresh uuid if omitted */
  clientEventId?: string;
  eventType: string;
  entityType: string;
  entityId: string;
  /** Already-serialised JSON string — caller controls what goes in here */
  payloadStr: string;
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

  // Issue NOTIFY in the same transaction — delivered only after COMMIT.
  const hint: NotifyHint = {
    v: 1,
    orgId: opts.organizationId,
    branchId: opts.branchId,
    eventType: opts.eventType,
    entityType: opts.entityType,
    entityId: opts.entityId,
    sequence,
  };

  // pg_notify payload must be a string literal; we pass it via parameterised
  // call to avoid injection.  PostgreSQL's pg_notify() takes (channel, payload).
  await client.query(`SELECT pg_notify($1, $2)`, [
    REALTIME_NOTIFY_CHANNEL,
    JSON.stringify(hint),
  ]);

  return sequence;
}

/**
 * Convenience variant for org-wide events that span multiple branches
 * (e.g. cross-branch stock transfers sent from the warehouse).
 * branchId is set to the provided value but branchId in NotifyHint is null
 * to signal org-wide broadcast.
 */
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
    orgId: opts.organizationId,
    branchId: null, // org-wide: all branches of this org receive the invalidation
    eventType: opts.eventType,
    entityType: opts.entityType,
    entityId: opts.entityId,
    sequence,
  };

  await client.query(`SELECT pg_notify($1, $2)`, [
    REALTIME_NOTIFY_CHANNEL,
    JSON.stringify(hint),
  ]);

  return sequence;
}
