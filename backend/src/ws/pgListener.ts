/**
 * pgListener.ts
 *
 * Maintains a dedicated (non-pooled) PostgreSQL LISTEN connection for
 * real-time event distribution across all Cloud Run instances.
 *
 * Design decisions:
 *   - Uses a dedicated Client (not a pooled connection) so the LISTEN
 *     subscription is persistent and does not consume a pool slot.
 *   - Reconnects on error/disconnect with bounded exponential backoff.
 *   - On each reconnect the LISTEN subscription is re-issued.
 *   - The pg_notify payload carries only minimal invalidation hints (no PII,
 *     no raw change_log.payload) — see change_log.repo.ts NotifyHint type.
 */

import pg from 'pg';
import { REALTIME_NOTIFY_CHANNEL, NotifyHint } from '../repositories/change_log.repo';
import { broadcast } from './connectionRegistry';

const { Client } = pg;

const INITIAL_BACKOFF_MS  = 1_000;
const MAX_BACKOFF_MS      = 30_000;
const BACKOFF_MULTIPLIER  = 2;

let listenerClient: pg.Client | null = null;
let stopped = false;

/**
 * Start the listener loop.  Resolves once the first connection and LISTEN
 * subscription succeed.  After that it self-heals in the background.
 */
export async function startPgListener(connectionString: string): Promise<void> {
  stopped = false;
  await connectAndListen(connectionString, INITIAL_BACKOFF_MS);
}

/** Gracefully stop the listener (used during server shutdown). */
export async function stopPgListener(): Promise<void> {
  stopped = true;
  if (listenerClient) {
    try {
      await listenerClient.end();
    } catch {
      // ignore
    }
    listenerClient = null;
  }
}

async function connectAndListen(connectionString: string, backoff: number): Promise<void> {
  if (stopped) return;

  const client = new Client({ connectionString });
  listenerClient = client;

  try {
    await client.connect();

    // Re-subscribe on every (re-)connect
    await client.query(`LISTEN ${REALTIME_NOTIFY_CHANNEL}`);
    console.log(`[pgListener] Listening on channel "${REALTIME_NOTIFY_CHANNEL}"`);

    // Reset backoff on successful connection
    let currentBackoff = INITIAL_BACKOFF_MS;

    client.on('notification', (msg) => {
      if (msg.channel !== REALTIME_NOTIFY_CHANNEL) return;
      if (!msg.payload) return;
      try {
        const hint = JSON.parse(msg.payload) as NotifyHint;
        if (hint.v !== 1) {
          console.warn('[pgListener] Unknown hint version, skipping:', hint.v);
          return;
        }
        broadcast(hint);
      } catch {
        console.error('[pgListener] Failed to parse notification payload:', msg.payload);
      }
    });

    // Handle unexpected disconnects
    client.on('error', (err) => {
      console.error('[pgListener] Client error:', err.message);
    });

    client.on('end', () => {
      if (stopped) return;
      console.warn('[pgListener] Connection ended — scheduling reconnect');
      listenerClient = null;
      const nextBackoff = Math.min(currentBackoff * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
      currentBackoff = nextBackoff;
      setTimeout(() => connectAndListen(connectionString, nextBackoff), currentBackoff);
    });

  } catch (err) {
    console.error(`[pgListener] Connection failed, retrying in ${backoff}ms:`, (err as Error).message);
    listenerClient = null;
    const nextBackoff = Math.min(backoff * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
    setTimeout(() => connectAndListen(connectionString, nextBackoff), backoff);
    // Don't re-throw on initial connect: let the server start without blocking
    // (background reconnect loop will keep trying)
  }
}
