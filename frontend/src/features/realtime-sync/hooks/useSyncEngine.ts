'use client';

// src/features/realtime-sync/hooks/useSyncEngine.ts
//
// Phase 6 — React hook to initialize and dispose the Sync Engine.
// MUST be called once in the dashboard layout (ShopAdminDashboardLayout).
// The engine survives route transitions because the layout doesn't remount.

import { useEffect } from 'react';
import { syncEngine } from '../sync.engine';

export const useSyncEngine = () => {
  useEffect(() => {
    syncEngine.initialize();

    // Cleanup on layout unmount (navigating away from dashboard)
    return () => {
      syncEngine.dispose();
    };
  }, []); // Empty deps — run once on layout mount
};
