/**
 * wsServer.ts
 *
 * WebSocket server — server-to-client invalidation channel.
 *
 * Protocol:
 *   1. Client opens WS connection: GET /ws
 *   2. On first message from client: expects { type: 'auth', token: '<JWT>' }
 *      within AUTH_TIMEOUT_MS.  Connection is closed if not received.
 *   3. Server verifies token using existing resolveIdentity().
 *      If invalid/expired: server sends { type: 'auth_error', message } and closes.
 *      If valid: server sends { type: 'auth_ok', userId, branchId }.
 *   4. Server pushes invalidation hints as JSON messages (NotifyHint shape).
 *   5. Heartbeat: server sends ping every PING_INTERVAL_MS; expects pong within
 *      PONG_TIMEOUT_MS; closes stale connections.
 *
 * Security constraints:
 *   - Token is sent in first WS message (not in URL query string) to avoid
 *     it appearing in server access logs.
 *   - Identity is resolved server-side; no client-supplied claims are trusted.
 *   - Clients cannot send business mutations through this channel.
 *   - Max message size enforced to prevent abuse.
 *   - Allowed origins enforced.
 */

import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { resolveIdentity } from '../auth';
import { registerClient, unregisterClient, WsClient } from './connectionRegistry';

const AUTH_TIMEOUT_MS = 10_000;   // 10s to send auth message
const PING_INTERVAL_MS = 30_000;  // ping every 30s
const PONG_TIMEOUT_MS  = 15_000;  // 15s to respond to ping
const MAX_MESSAGE_BYTES = 4_096;  // max inbound client message

/** Derive allowed WS origins from env or default to the Cloud Run service URL. */
function getAllowedOrigins(): Set<string> | null {
  const raw = process.env['WS_ALLOWED_ORIGINS'] ?? '';
  if (!raw.trim()) return null; // null = allow all (dev mode)
  return new Set(
    raw.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean)
  );
}

export function initWsServer(httpServer: http.Server): void {
  const allowedOrigins = getAllowedOrigins();

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: ({ req }: { req: http.IncomingMessage }, cb: (res: boolean, code?: number, message?: string) => void) => {
      if (!allowedOrigins) {
        cb(true);
        return;
      }
      const origin = (req.headers['origin'] ?? '').toLowerCase();
      if (allowedOrigins.has(origin)) {
        cb(true);
      } else {
        // Also allow Tauri apps which may omit or send a custom origin
        if (origin === '' || origin.startsWith('tauri://') || origin.startsWith('https://tauri.localhost')) {
          cb(true);
          return;
        }
        cb(false, 403, 'Origin not allowed');
      }
    },
  });

  console.log('[wsServer] WebSocket server initialized on path /ws');

  // Heartbeat interval — runs for all connections
  const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    wss.clients.forEach((ws) => {
      const client = (ws as any).__nmmClient as WsClient | undefined;
      if (!client) return;
      if (ws.readyState !== WebSocket.OPEN) return;

      // Detect missing pong (stale connection)
      if (now - client.lastPongAt > PING_INTERVAL_MS + PONG_TIMEOUT_MS) {
        console.warn('[wsServer] Stale connection detected, terminating:', client.identity.user_id);
        ws.terminate();
        return;
      }

      ws.ping();
    });
  }, PING_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', (ws: WebSocket) => {
    let authenticated = false;
    let client: WsClient | null = null;

    // Require authentication within timeout
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        ws.send(JSON.stringify({ type: 'auth_error', message: 'Authentication timeout' }));
        ws.close(4001, 'Authentication timeout');
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('message', (rawData) => {
      // After auth: ignore all client messages (server-to-client only channel)
      if (authenticated) return;

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(rawData.toString()) as Record<string, unknown>;
      } catch {
        ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid JSON' }));
        ws.close(4002, 'Invalid message');
        return;
      }

      if (msg['type'] !== 'auth' || typeof msg['token'] !== 'string') {
        ws.send(JSON.stringify({ type: 'auth_error', message: 'First message must be { type: "auth", token: "..." }' }));
        ws.close(4003, 'Protocol error');
        return;
      }

      const token = msg['token'] as string;
      let identity;
      try {
        identity = resolveIdentity(token);
      } catch {
        ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid or expired token' }));
        ws.close(4004, 'Authentication failed');
        return;
      }

      clearTimeout(authTimeout);
      authenticated = true;

      const now = Date.now();
      client = {
        ws,
        identity,
        connectedAt: now,
        lastPongAt: now,
      };
      (ws as any).__nmmClient = client;
      registerClient(client);

      ws.send(JSON.stringify({
        type: 'auth_ok',
        userId: identity.user_id,
        branchId: identity.branch_id,
      }));

      console.log(`[wsServer] Client authenticated: user=${identity.user_id} branch=${identity.branch_id}`);
    });

    ws.on('pong', () => {
      if (client) client.lastPongAt = Date.now();
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (client) {
        unregisterClient(client);
        console.log(`[wsServer] Client disconnected: user=${client.identity.user_id}`);
        client = null;
      }
    });

    ws.on('error', (err) => {
      console.error('[wsServer] WebSocket error:', err.message);
      clearTimeout(authTimeout);
      if (client) {
        unregisterClient(client);
        client = null;
      }
    });
  });
}
