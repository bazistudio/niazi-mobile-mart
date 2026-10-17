/**
 * wsClient.ts — Frontend WebSocket client for NMM real-time invalidation
 *
 * Architecture:
 *   - Single persistent connection per application instance
 *   - Authenticates with the first message after connection (auth token)
 *   - Receives NotifyHint events; dispatches them to registered listeners
 *   - Reconnects with bounded exponential backoff + jitter on close/error
 *   - On reconnect: triggers a catch-up refetch via registered catch-up callbacks
 *   - Cleans up on logout or explicit dispose
 *   - Never logs tokens or sensitive payload fields
 *
 * Security:
 *   - Token sent as a WebSocket message (not a URL query param or header)
 *   - No business mutations are sent through this channel
 *   - URL resolved using same conventions as HTTP client (getApiBaseUrl)
 */

import { getApiBaseUrl, isTauriEnvironment } from '@/lib/tauri/tauriClient';
import { getAuthToken } from '@/lib/auth/core/auth.session';

// ── NotifyHint contract (mirrors backend NotifyHint) ─────────────────────────
export interface NotifyHint {
  v: 1;
  orgId: string;
  branchId: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  sequence: string;
}

export type NotifyHintListener = (hint: NotifyHint) => void;
export type CatchUpCallback = () => void;

// ── Reconnect configuration ───────────────────────────────────────────────────
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;
const JITTER_FRACTION = 0.2;        // ±20% jitter
const AUTH_TIMEOUT_MS = 8_000;      // Close if auth_ok not received within 8s

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert an HTTP(S) base URL to a WebSocket URL. */
function httpToWs(url: string): string {
  return url
    .replace(/^https:\/\//i, 'wss://')
    .replace(/^http:\/\//i, 'ws://')
    .replace(/\/+$/, '');
}

/** Resolve the WebSocket endpoint URL. */
function resolveWsUrl(): string {
  const apiBase = getApiBaseUrl();
  if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
    return `${httpToWs(apiBase)}/ws`;
  }
  // Relative base or empty — use window location
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

function addJitter(ms: number): number {
  const jitter = ms * JITTER_FRACTION * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(ms + jitter));
}

// ── NmmWsClient ───────────────────────────────────────────────────────────────

class NmmWsClient {
  private ws: WebSocket | null = null;
  private isDisposed = false;
  private isAuthenticated = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private authTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = INITIAL_BACKOFF_MS;
  private connectAttempt = 0;

  private listeners = new Set<NotifyHintListener>();
  private catchUpCallbacks = new Set<CatchUpCallback>();

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Start (or restart) the WebSocket connection.
   * Idempotent: safe to call multiple times; only opens one connection.
   */
  connect(): void {
    if (this.isDisposed) return;
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;
    this._openSocket();
  }

  /**
   * Permanently close the connection (e.g. on logout).
   * Subsequent calls to connect() are no-ops until reset() is called.
   */
  dispose(): void {
    this.isDisposed = true;
    this._clearTimers();
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect loop
      this.ws.close(1000, 'disposed');
      this.ws = null;
    }
    this.isAuthenticated = false;
  }

  /** Re-enable after a dispose (e.g. on re-login). */
  reset(): void {
    this.isDisposed = false;
    this.backoffMs = INITIAL_BACKOFF_MS;
    this.connectAttempt = 0;
  }

  onHint(listener: NotifyHintListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onCatchUp(callback: CatchUpCallback): () => void {
    this.catchUpCallbacks.add(callback);
    return () => this.catchUpCallbacks.delete(callback);
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.isAuthenticated;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _openSocket(): void {
    this._clearTimers();
    this.isAuthenticated = false;
    this.connectAttempt++;

    const token = getAuthToken();
    if (!token) {
      if (import.meta.env.DEV) {
        console.debug('[WS] No auth token — skipping connection');
      }
      return;
    }

    const url = resolveWsUrl();

    if (import.meta.env.DEV) {
      const isTauri = isTauriEnvironment();
      console.debug(`[WS] Connecting (attempt ${this.connectAttempt}) — ${url} [${isTauri ? 'Tauri' : 'browser'}]`);
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[WS] Failed to construct WebSocket:', (err as Error).message);
      }
      this._scheduleReconnect();
      return;
    }

    this.ws = ws;

    // Auth timeout — if we don't get auth_ok within AUTH_TIMEOUT_MS, close and retry
    this.authTimeoutTimer = setTimeout(() => {
      if (!this.isAuthenticated && this.ws === ws) {
        if (import.meta.env.DEV) {
          console.warn('[WS] Auth timeout — closing');
        }
        ws.close(4001, 'auth_timeout');
      }
    }, AUTH_TIMEOUT_MS);

    ws.onopen = () => {
      try {
        ws.send(JSON.stringify({ type: 'auth', token }));
      } catch {
        ws.close(4001, 'send_failed');
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === 'auth_ok') {
          this.isAuthenticated = true;
          this._clearAuthTimer();
          this.backoffMs = INITIAL_BACKOFF_MS;
          this.connectAttempt = 0;
          if (import.meta.env.DEV) {
            console.debug('[WS] Authenticated — real-time updates active');
          }
          this._fireCatchUp();
          return;
        }

        if (msg.type === 'notify' && msg.hint) {
          this._dispatchHint(msg.hint as NotifyHint);
          return;
        }

        // Server also sends hints as top-level objects (direct broadcast)
        if (msg.v === 1 && msg.orgId) {
          this._dispatchHint(msg as NotifyHint);
        }
      } catch {
        // Malformed message — ignore
      }
    };

    ws.onerror = () => {
      // Error always precedes close; let onclose handle reconnect
    };

    ws.onclose = (event) => {
      this._clearAuthTimer();
      this.isAuthenticated = false;

      if (this.isDisposed) return;

      if (import.meta.env.DEV) {
        console.debug(`[WS] Closed (code=${event.code}) — reconnecting in ${this.backoffMs}ms`);
      }

      if (event.code === 4002) {
        this._scheduleReconnect(MAX_BACKOFF_MS);
        return;
      }

      this._scheduleReconnect();
    };
  }

  private _dispatchHint(hint: NotifyHint): void {
    if (hint.v !== 1) return;
    this.listeners.forEach((fn) => {
      try { fn(hint); } catch { /* listener errors must not crash WS */ }
    });
  }

  private _fireCatchUp(): void {
    this.catchUpCallbacks.forEach((fn) => {
      try { fn(); } catch { /* ignore */ }
    });
  }

  private _scheduleReconnect(delayMs?: number): void {
    if (this.isDisposed) return;
    const delay = addJitter(delayMs ?? this.backoffMs);
    this.reconnectTimer = setTimeout(() => {
      if (!this.isDisposed) this._openSocket();
    }, delay);
    if (!delayMs) {
      this.backoffMs = Math.min(this.backoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
    }
  }

  private _clearTimers(): void {
    this._clearAuthTimer();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _clearAuthTimer(): void {
    if (this.authTimeoutTimer !== null) {
      clearTimeout(this.authTimeoutTimer);
      this.authTimeoutTimer = null;
    }
  }
}

// ── Singleton — one connection per application instance ──────────────────────
export const nmmWsClient = new NmmWsClient();
