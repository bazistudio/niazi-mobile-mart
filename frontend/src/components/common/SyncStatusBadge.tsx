import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { tauriClient } from '@/lib/tauri/tauriClient';

interface SyncStatusState {
  pending_count: number;
  is_online: boolean;
  last_synced_at?: string;
  last_error?: string;
}

export const SyncStatusBadge: React.FC = () => {
  const [status, setStatus] = useState<SyncStatusState>({
    pending_count: 0,
    is_online: true,
  });
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await tauriClient.syncGetStatus();
      setStatus(res);
    } catch {
      // Fallback in web mode
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const res = await tauriClient.syncTriggerNow();
      setStatus(res);
    } catch {
      // ignore error
    } finally {
      setTimeout(() => setIsSyncing(false), 800);
    }
  };

  if (!status.is_online) {
    return (
      <div
        onClick={handleManualSync}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/30 cursor-pointer hover:bg-amber-500/25 transition-all"
        title={status.last_error || 'Offline mode active — transactions saved locally'}
      >
        <WifiOff className="w-3.5 h-3.5 text-amber-500" />
        <span>Offline ({status.pending_count} pending)</span>
      </div>
    );
  }

  if (status.pending_count > 0 || isSyncing) {
    return (
      <div
        onClick={handleManualSync}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-500 border border-blue-500/30 cursor-pointer hover:bg-blue-500/25 transition-all"
        title="Syncing pending outbox items to central server..."
      >
        <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
        <span>Syncing ({status.pending_count})</span>
      </div>
    );
  }

  if (status.last_error) {
    return (
      <div
        onClick={handleManualSync}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-500 border border-red-500/30 cursor-pointer hover:bg-red-500/25 transition-all"
        title={status.last_error}
      >
        <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
        <span>Sync Error</span>
      </div>
    );
  }

  return (
    <div
      onClick={handleManualSync}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/25 transition-all"
      title="Online & Synchronized with central PostgreSQL"
    >
      <Wifi className="w-3.5 h-3.5 text-emerald-500" />
      <span>Online</span>
    </div>
  );
};
