import React, { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { tauriClient, SyncEngineStatus } from '@/lib/tauri/tauriClient';
import { useInventoryStore } from '@/features/inventory/core/inventory.store';

export const SyncStatusBadge: React.FC = () => {
  const [status, setStatus] = useState<SyncEngineStatus>({
    pending_count: 0,
    is_online: true,
    is_syncing: false,
  });

  const wasSyncingRef = useRef(false);

  const fetchStatus = async () => {
    try {
      const res = await tauriClient.syncGetStatus();
      setStatus(res);

      // Detect completion transition (true -> false)
      if (wasSyncingRef.current && !res.is_syncing) {
        useInventoryStore.getState().fetchProducts().catch(console.error);
        if (res.last_error) {
          toast.error(`Sync error: ${res.last_error}`);
        } else {
          toast.success('Sync completed');
        }
      }
      wasSyncingRef.current = res.is_syncing;
    } catch {
      // Fallback in web mode
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleManualSync = async () => {
    if (status.is_syncing) return; // Prevent duplicate clicks while sync is active
    try {
      wasSyncingRef.current = true;
      const res = await tauriClient.syncTriggerNow();
      setStatus(res);
    } catch (err: any) {
      toast.error(`Sync request failed: ${err?.message || 'Connection error'}`);
    }
  };

  if (status.is_syncing) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-500 border border-blue-500/30 cursor-wait transition-all"
        title="Synchronizing local transactions and central server..."
      >
        <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
        <span>Syncing...</span>
      </div>
    );
  }

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

  if (status.pending_count > 0) {
    return (
      <div
        onClick={handleManualSync}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-500 border border-blue-500/30 cursor-pointer hover:bg-blue-500/25 transition-all"
        title="Outbox items pending central sync. Click to sync now."
      >
        <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
        <span>Pending ({status.pending_count})</span>
      </div>
    );
  }

  return (
    <div
      onClick={handleManualSync}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/25 transition-all"
      title="Online & Synchronized with central server"
    >
      <Wifi className="w-3.5 h-3.5 text-emerald-500" />
      <span>Online</span>
    </div>
  );
};
