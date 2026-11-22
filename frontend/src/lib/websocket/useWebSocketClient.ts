// src/lib/websocket/useWebSocketClient.ts
//
// PERF-D: WebSocket push client for NMM realtime backend.
// Connects to the Express WS endpoint (/ws) with JWT Bearer auth.
// Implements exponential back-off reconnect (1s → 30s cap) and emits
// typed NotifyHint events to registered listeners.

import { useEffect, useRef, useCallback, useState } from 'react';

/** Shape emitted by the backend pgListener on NOTIFY nmm_realtime */
export interface NotifyHint {
  v: 1;
  orgId: string;
  branchId: string;
  eventType: string;   // e.g. 'CREATED' | 'UPDATED' | 'DELETED'
  entityType: string;  // e.g. 'PRODUCT' | 'INVENTORY' | 'SALE'
  entityId: string;
  sequence: number;
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

function getWsUrl(token: string): string {
  // The backend Express WS server uses the same port (8080) as HTTP.
  // Replace http(s):// with ws(s):// automatically.
  const base = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080')
    .replace(/^http/, 'ws');
  return `${base}/ws?token=${encodeURIComponent(token)}`;
}

function connect(token: string): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  currentToken = token;
  isIntentionallyClosed = false;

  const url = getWsUrl(token);
  ws = new WebSocket(url);

  ws.onopen = () => {
    reconnectDelay = 1000; // reset back-off on successful connection
    console.debug('[WS] Connected to NMM realtime server');
  };

  ws.onmessage = (event) => {
    try {
      const hint = JSON.parse(event.data as string) as NotifyHint;
      if (hint.v === 1) {
        listeners.forEach(fn => fn(hint));
      }
    } catch {
      // non-JSON frame — ignore
    }
  };

  ws.onerror = (err) => {
    console.warn('[WS] Error — will attempt reconnect', err);
  };

  ws.onclose = () => {
    ws = null;
    if (!isIntentionallyClosed && currentToken) {
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
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.close(); ws = null; }
  currentToken = null;
}

function addListener(fn: NotifyHintListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Current WS readyState — 0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED/null */
export function getWsState(): number {
  return ws?.readyState ?? 3;
}

/**
 * React hook — mounts WebSocket once per authenticated session and tears it
 * down on logout. Provide `onHint` to receive filtered realtime events.
 *
 * @example
 * useWebSocketClient({ onHint: (h) => { if (h.entityType === 'INVENTORY') refetch(); } });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
