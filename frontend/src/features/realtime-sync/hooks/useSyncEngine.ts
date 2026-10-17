'use client';

// src/features/realtime-sync/hooks/useSyncEngine.ts
//
// Phase 6 — React hook to initialize and dispose the Sync Engine.
// Phase 2-C addition: also starts the WebSocket client and wires
//   NotifyHint → TanStack Query invalidations.
//
// MUST be called once in the dashboard layout (ShopAdminDashboardLayout).
// The engine survives route transitions because the layout doesn't remount.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { syncEngine } from '../sync.engine';
import { nmmWsClient } from '@/lib/ws/wsClient';
import { handleNotifyHint, handleCatchUp } from '../ws.invalidation';

export const useSyncEngine = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    syncEngine.initialize();

    // ── Phase 2-C: Start WebSocket real-time invalidation ─────────────────────
    nmmWsClient.reset();
    nmmWsClient.connect();

    // Wire NotifyHint → TanStack Query invalidations
    const unsubHint = nmmWsClient.onHint((hint) => {
      handleNotifyHint(queryClient, hint);
    });

    // On reconnect, do a catch-up refetch of key namespaces
    const unsubCatchUp = nmmWsClient.onCatchUp(() => {
      handleCatchUp(queryClient);
    });

    // ── Phase 2-D: Listen for Tauri sync pull completion ─────────────────────
    let unlistenTauriSync: (() => void) | null = null;
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen('domain:sync_pull_completed', () => {
          handleCatchUp(queryClient);
        }).then((unlisten) => {
          unlistenTauriSync = unlisten;
        }).catch(() => {});
      }).catch(() => {});
    }

    // Cleanup on layout unmount (navigating away from dashboard)
    return () => {
      syncEngine.dispose();
      unsubHint();
      unsubCatchUp();
      nmmWsClient.dispose();
    };
  }, []); // Empty deps — run once on layout mount
};
