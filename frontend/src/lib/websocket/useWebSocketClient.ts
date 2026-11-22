// src/lib/websocket/useWebSocketClient.ts
//
// PERF-D: WebSocket push client for NMM realtime backend.
// Connects to the Express WS endpoint (/ws).
// Complies with backend wsServer.ts authentication handshake:
// - Step 1: Open WebSocket connection to /ws (NO token in query parameters)
// - Step 2: First inbound frame from client must be: { type: 'auth', token: '<JWT>' }
// - Step 3: Server validates and responds: { type: 'auth_ok', userId, branchId }
//           or { type: 'auth_error', message } and closes socket.
// - Step 4: Listens for typed NotifyHint messages broadcast by backend.
// - Step 5: Responds to server heartbeat pings (automatic in browser/Tauri WS).
//
// Reconnection: Exponential back-off reconnect (1s → 30s cap).
// Reconnect performs a fresh first-frame auth handshake on every new socket.

import { useEffect, useRef, useCallback, useState } from 'react';

/** Shape emitted by the backend pgListener on NOTIFY nmm_realtime */
export interface NotifyHint {
  v: 1;
  orgId: string;
  branchId: string | null;
  eventType: string;   // e.g. 'INVENTORY_OPERATION_RECORDED' | 'PRODUCT_CREATED' | 'SALE_CREATED'
  entityType: string;  // e.g. 'stock' | 'product' | 'sale' | 'customer'
  entityId: string;
  sequence: string;
}

export type NotifyHintListener = (hint: NotifyHint) => void;

// Module-level singleton so a single WS connection is shared across the app
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30_000;
const listeners = new Set<NotifyHintListener>();
let currentToken: string | null = null;
let isIntentionallyClosed = false;
let isAuthenticated = false;

function getWsUrl(): string {
  // The backend Express WS server uses the same port (8080) as HTTP.
  // Replace http(s):// with ws(s):// automatically.
  // Query parameter token is deliberately omitted to prevent token leakage in access logs.
  const base = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080')
    .replace(/^http/, 'ws');
  return `${base}/ws`;
}

function connect(token: string): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    // If connection already exists and active, do not recreate
    return;
  }

  currentToken = token;
  isIntentionallyClosed = false;
  isAuthenticated = false;

  const url = getWsUrl();
  const socket = new WebSocket(url);
  ws = socket;

  socket.onopen = () => {
    // Backend protocol: First message must be { type: 'auth', token: '...' }
    try {
      socket.send(JSON.stringify({ type: 'auth', token }));
      console.debug('[WS] Connected to NMM realtime server, sent auth handshake');
    } catch (err) {
      console.error('[WS] Failed to send authentication frame:', err);
    }
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as Record<string, unknown>;

      // Check for auth lifecycle frames
      if (msg['type'] === 'auth_ok') {
        isAuthenticated = true;
        reconnectDelay = 1000; // reset back-off on successful auth
        console.debug(`[WS] Authenticated successfully: user=${msg['userId']} branch=${msg['branchId']}`);
        return;
      }

      if (msg['type'] === 'auth_error') {
        isAuthenticated = false;
        console.error('[WS] Authentication error from server:', msg['message']);
        // If authentication permanently failed (e.g. invalid or expired token), stop infinite reconnection loop
        const errMsg = String(msg['message'] || '').toLowerCase();
        if (errMsg.includes('invalid') || errMsg.includes('expired')) {
          isIntentionallyClosed = true;
        }
        return;
      }

      // If hint frame arrived before auth was confirmed, drop it
      if (!isAuthenticated) {
        console.warn('[WS] Received frame before authentication complete, discarding');
        return;
      }

      // Process NotifyHint payload
      if (msg['v'] === 1 && typeof msg['entityType'] === 'string') {
        const hint: NotifyHint = {
          v: 1,
          orgId: String(msg['orgId'] || ''),
          branchId: msg['branchId'] !== undefined && msg['branchId'] !== null ? String(msg['branchId']) : null,
          eventType: String(msg['eventType'] || ''),
          entityType: String(msg['entityType'] || ''),
          entityId: String(msg['entityId'] || ''),
          sequence: String(msg['sequence'] || '0'),
        };

        listeners.forEach((fn) => {
          try {
            fn(hint);
          } catch (e) {
            console.error('[WS] Listener threw error:', e);
          }
        });
      }
    } catch {
      // non-JSON frame — ignore
    }
  };

  socket.onerror = (err) => {
    console.warn('[WS] Socket error encountered:', err);
  };

  socket.onclose = (event) => {
    console.debug(`[WS] Socket closed (code=${event.code}, reason=${event.reason || 'none'})`);
    if (ws === socket) {
      ws = null;
    }
    isAuthenticated = false;

    // Do not reconnect if closed intentionally or if token was invalid/expired (code 4004)
    if (!isIntentionallyClosed && currentToken && event.code !== 4004) {
      scheduleReconnect(currentToken);
    }
  };
}

function scheduleReconnect(token: string): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    connect(token);
  }, reconnectDelay);
}

function disconnect(): void {
  isIntentionallyClosed = true;
  isAuthenticated = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  currentToken = null;
}

function addListener(fn: NotifyHintListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Current WS readyState — 0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED/null */
export function getWsState(): number {
  return ws?.readyState ?? 3;
}

/** Returns whether the active socket has completed auth handshake */
export function isWsAuthenticated(): boolean {
  return isAuthenticated && ws?.readyState === WebSocket.OPEN;
}

/**
 * React hook — mounts WebSocket once per authenticated session and tears it
 * down on logout. Provide `onHint` to receive filtered realtime events.
 *
 * @example
 * useWebSocketClient({ onHint: (h) => { if (h.entityType === 'stock') refetch(); } });
 */
export function useWebSocketClient(options?: { onHint?: NotifyHintListener }): void {
  // Poll localStorage for the JWT token (NMM stores it under 'niazi_token')
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('niazi_token') : null
  );

  useEffect(() => {
    // Re-read on mount in case login happened in the same session before this hook mounted
    const stored = localStorage.getItem('niazi_token');
    if (stored !== token) setToken(stored);
    // Listen for storage events (cross-tab login/logout)
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'niazi_token') setToken(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [token]);

  const onHintRef = useRef<NotifyHintListener | undefined>(options?.onHint);
  onHintRef.current = options?.onHint;

  const stableListener = useCallback<NotifyHintListener>((hint) => {
    onHintRef.current?.(hint);
  }, []);

  useEffect(() => {
    if (!token) {
      disconnect();
      return;
    }
    connect(token);
    const remove = addListener(stableListener);
    return remove; // cleanup listener on unmount; shared WS stays alive
  }, [token, stableListener]);

  // Disconnect entirely when the component (usually App root) unmounts
  useEffect(() => {
    return () => {
      // Only fully disconnect if no other listeners remain after removing ours
      listeners.delete(stableListener);
      if (listeners.size === 0) disconnect();
    };
  }, [stableListener]);
}
