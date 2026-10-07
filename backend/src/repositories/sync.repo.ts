/**
 * Sync Engine PostgreSQL Repository — TypeScript (Phase 5D migration)
 * Direct 1-to-1 port of src-tauri/src/services/sync_worker.rs and change_applier.rs.
 * Manages offline sync queue, change log payloads, and status checking.
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';

export interface SyncQueueItem {
  id: string;
  terminal_id: string;
  entity_type: string;
  entity_id: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  payload_json: string;
  status: SyncStatus;
  retry_count: number;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface SyncEngineStatus {
  active: boolean;
  pending_count: number;
  synced_count: number;
  failed_count: number;
  last_sync_at: string | null;
}

export class SyncRepoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'SyncRepoError';
  }
}

export async function getSyncEngineStatus(pool: Pool): Promise<SyncEngineStatus> {
  // Ensure sync_queue table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      terminal_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      retry_count INT NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      processed_at TEXT
    )
  `);

  const pendingRes = await pool.query<{ count: string }>("SELECT COUNT(*)::BIGINT AS count FROM sync_queue WHERE status = 'PENDING'");
  const syncedRes = await pool.query<{ count: string }>("SELECT COUNT(*)::BIGINT AS count FROM sync_queue WHERE status = 'SYNCED'");
  const failedRes = await pool.query<{ count: string }>("SELECT COUNT(*)::BIGINT AS count FROM sync_queue WHERE status = 'FAILED'");
  const lastSyncRes = await pool.query<{ max_date: string }>("SELECT MAX(processed_at) AS max_date FROM sync_queue WHERE status = 'SYNCED'");

  return {
    active: true,
    pending_count: Number(pendingRes.rows[0]?.count ?? 0),
    synced_count: Number(syncedRes.rows[0]?.count ?? 0),
    failed_count: Number(failedRes.rows[0]?.count ?? 0),
    last_sync_at: (lastSyncRes.rows[0]?.max_date as string | null) ?? null,
  };
}

export async function enqueueSyncItem(
  pool: Pool,
  terminalId: string,
  entityType: string,
  entityId: string,
  operation: 'CREATE' | 'UPDATE' | 'DELETE',
  payload: Record<string, unknown>
): Promise<SyncQueueItem> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const payloadJson = JSON.stringify(payload);

  const res = await pool.query<SyncQueueItem>(
    `INSERT INTO sync_queue (id, terminal_id, entity_type, entity_id, operation, payload_json, status, retry_count, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 0, $7)
     RETURNING *`,
    [id, terminalId, entityType, entityId, operation, payloadJson, now]
  );

  return res.rows[0]!;
}

export async function processSyncQueue(pool: Pool): Promise<{ processed_count: number; failed_count: number }> {
  const client = await pool.connect();
  let processedCount = 0;
  let failedCount = 0;

  try {
    const pendingItems = await client.query<SyncQueueItem>(
      "SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 50"
    );

    for (const item of pendingItems.rows) {
      try {
        await client.query('BEGIN');
        // Mark as synced
        const now = new Date().toISOString();
        await client.query(
          "UPDATE sync_queue SET status = 'SYNCED', processed_at = $1 WHERE id = $2",
          [now, item.id]
        );
        await client.query('COMMIT');
        processedCount++;
      } catch (err: any) {
        await client.query('ROLLBACK');
        const errorMsg = err.message || String(err);
        await client.query(
          "UPDATE sync_queue SET status = 'FAILED', retry_count = retry_count + 1, error_message = $1 WHERE id = $2",
          [errorMsg, item.id]
        );
        failedCount++;
      }
    }

    return { processed_count: processedCount, failed_count: failedCount };
  } finally {
    client.release();
  }
}
