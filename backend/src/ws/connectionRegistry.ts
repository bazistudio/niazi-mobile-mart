/**
 * connectionRegistry.ts
 *
 * Tracks authenticated WebSocket connections and routes invalidation
 * notifications to authorized clients.
 *
 * Security model:
 *   - Identity is derived exclusively from the server-side JWT (set at
 *     handshake time). Clients cannot claim/override their org or branch.
 *   - Org admins receive all events for their organization.
 *   - Branch users receive only events for their own branch.
 *   - Cross-branch transfer events (branchId=null in NotifyHint) are
 *     delivered to org admins only.
 */

import WebSocket from 'ws';
import { RequestIdentity, isOrgAdmin, canAccessBranch } from '../auth';
import { NotifyHint } from '../repositories/change_log.repo';

export interface WsClient {
  ws: WebSocket;
  identity: RequestIdentity;
  /** Monotonic timestamp (Date.now()) used to detect stale connections */
  connectedAt: number;
  /** Last pong received — used for heartbeat liveness detection */
  lastPongAt: number;
}

const clients = new Set<WsClient>();

export function registerClient(client: WsClient): void {
  clients.add(client);
}

export function unregisterClient(client: WsClient): void {
  clients.delete(client);
}

export function clientCount(): number {
  return clients.size;
}

/**
 * Returns true if a connected client should receive a given invalidation hint.
 *
 * Authorization rules:
 *   1. Client must belong to the same organization as the event.
 *   2. Org admins receive all events for their organization.
 *   3. Branch-scoped users receive:
 *      - Events that specify a branchId that matches their branch.
 *      - Cross-branch events (branchId=null) are NOT delivered to branch users
 *        (they cannot act on other branches' data anyway).
 */
function clientShouldReceive(client: WsClient, hint: NotifyHint): boolean {
  const identity = client.identity;

  // Organization gate: never cross org boundaries
  if (identity.organization_id !== hint.orgId) return false;

  // Org admin: receives all org events
  if (isOrgAdmin(identity)) return true;

  // Branch user: only their branch events
  if (hint.branchId === null) {
    // org-wide event (e.g. cross-branch transfer) — branch users don't receive
    return false;
  }

  return canAccessBranch(identity, hint.branchId);
}

/**
 * Broadcast an invalidation hint to all authorized connected clients.
 * Dead connections are pruned opportunistically.
 */
export function broadcast(hint: NotifyHint): void {
  const message = JSON.stringify(hint);
  const dead: WsClient[] = [];

  for (const client of clients) {
    if (client.ws.readyState !== WebSocket.OPEN) {
      dead.push(client);
      continue;
    }
    if (clientShouldReceive(client, hint)) {
      try {
        client.ws.send(message);
      } catch {
        dead.push(client);
      }
    }
  }

  // Prune dead connections
  for (const c of dead) {
    clients.delete(c);
  }
}
