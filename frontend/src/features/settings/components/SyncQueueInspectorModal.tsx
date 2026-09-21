import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  RotateCcw,
  Info,
  ShieldAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { tauriClient, SyncQueueItem } from '@/lib/tauri/tauriClient';
import { useAuthStore } from '@/lib/auth/core/auth.store';

export interface SyncQueueInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'conflicts' | 'failed';
}

/**
 * Normalization helper for legacy failure statuses.
 * Recognizes status === 'FAILED_PERMANENT', status === 'FAILED', or status === 'PENDING' with attempt_count >= 10.
 */
export function isFailedPermanent(item: SyncQueueItem): boolean {
  return (
    item.status === 'FAILED_PERMANENT' ||
    item.status === 'FAILED' ||
    (item.status === 'PENDING' && item.attempt_count >= 10)
  );
}

export const SyncQueueInspectorModal: React.FC<SyncQueueInspectorModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'conflicts',
}) => {
  const user = useAuthStore((s) => s.user);
  const isOrgAdmin =
    user?.role?.toUpperCase() === 'ADMIN' ||
    user?.role?.toUpperCase() === 'OWNER' ||
    user?.role?.toUpperCase() === 'SUPER_ADMIN' ||
    user?.access_profile?.allowed_pages?.includes('*');

  const [activeTab, setActiveTab] = useState<'conflicts' | 'failed'>(initialTab);
  const [conflicts, setConflicts] = useState<SyncQueueItem[]>([]);
  const [failedItems, setFailedItems] = useState<SyncQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [confirmRetryItem, setConfirmRetryItem] = useState<SyncQueueItem | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [conflictsRes, failedRes] = await Promise.all([
        tauriClient.syncListConflicts(50),
        tauriClient.syncListFailed(50),
      ]);
      setConflicts(conflictsRes || []);
      setFailedItems(failedRes || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch synchronization queue data from native daemon');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRetryConfirm = async () => {
    if (!confirmRetryItem) return;
    const targetId = confirmRetryItem.client_event_id;
    setConfirmRetryItem(null);
    setRetryingId(targetId);

    try {
      await tauriClient.syncRetryFailedItem(targetId);
      toast.success('Event reset and queued for synchronization retry');
      await fetchData();
      await tauriClient.syncGetStatus().catch(console.error);
    } catch (err: any) {
      toast.error(`Retry rejected: ${err?.message || 'Backend execution failed'}`);
      await fetchData().catch(console.error);
    } finally {
      setRetryingId(null);
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[85vh] flex flex-col bg-slate-900 border border-slate-800 rounded-xl shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Sync Queue Inspector</h2>
              <p className="text-xs text-slate-400">
                Inspect offline outbox failure states and trigger administrative retries
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh Queue Lists"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-800 bg-slate-900/50">
          <button
            onClick={() => setActiveTab('conflicts')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'conflicts'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10 rounded-t-md'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>Conflicts ({conflicts.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('failed')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'failed'
                ? 'border-red-500 text-red-400 bg-red-500/10 rounded-t-md'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span>Failed Permanent ({failedItems.length})</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Sync Queue Query Error</p>
                <p className="mt-0.5 opacity-90">{error}</p>
              </div>
            </div>
          )}

          {activeTab === 'conflicts' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  Synchronization conflicts require central business reconciliation. The original outbox payload is preserved locally and is not modified by this inspector.
                </p>
              </div>

              {isLoading && conflicts.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-slate-400 text-xs gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading conflict items...</span>
                </div>
              ) : conflicts.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs">
                  No synchronization conflicts in queue.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Event Type</th>
                        <th className="px-4 py-3">Client Event ID</th>
                        <th className="px-4 py-3">Attempts</th>
                        <th className="px-4 py-3">Created At</th>
                        <th className="px-4 py-3">Last Error</th>
                        <th className="px-4 py-3">Context</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                      {conflicts.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-medium text-amber-300 font-mono">
                            {item.event_type}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-400 max-w-[140px] truncate" title={item.client_event_id}>
                            {item.client_event_id}
                          </td>
                          <td className="px-4 py-3 text-slate-400">{item.attempt_count}</td>
                          <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatDate(item.created_at)}</td>
                          <td className="px-4 py-3 text-red-400 max-w-[220px] truncate" title={item.last_error || 'Conflict'}>
                            {item.last_error || '409 Conflict'}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-[11px] whitespace-nowrap">
                            T: {item.terminal_id.slice(0, 8)} | B: {item.branch_id.slice(0, 8)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'failed' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  Permanent synchronization failures (due to invalid request formatting, authorization issues, or exhausted retries). Authorized administrators may trigger a manual retry.
                </p>
              </div>

              {isLoading && failedItems.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-slate-400 text-xs gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading failed items...</span>
                </div>
              ) : failedItems.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs">
                  No permanent synchronization failures in queue.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Event Type</th>
                        <th className="px-4 py-3">Client Event ID</th>
                        <th className="px-4 py-3">Attempts</th>
                        <th className="px-4 py-3">Created At</th>
                        <th className="px-4 py-3">Last Error</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                      {failedItems.map((item) => {
                        const isRetrying = retryingId === item.client_event_id;
                        return (
                          <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-3 font-medium text-red-400 font-mono">
                              {item.event_type}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-400 max-w-[140px] truncate" title={item.client_event_id}>
                              {item.client_event_id}
                            </td>
                            <td className="px-4 py-3 text-slate-400">{item.attempt_count}</td>
                            <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatDate(item.created_at)}</td>
                            <td className="px-4 py-3 text-red-400 max-w-[220px] truncate" title={item.last_error || 'Permanent Error'}>
                              {item.last_error || 'Failed Permanent'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isOrgAdmin ? (
                                <button
                                  onClick={() => setConfirmRetryItem(item)}
                                  disabled={isRetrying || !!retryingId}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                                >
                                  <RotateCcw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                                  <span>{isRetrying ? 'Retrying...' : 'Retry Event'}</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-500 italic">Admin Only</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-950/60 text-xs text-slate-500">
          <span>Outbox events limit: 50 items</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors font-medium"
          >
            Close
          </button>
        </div>

        {/* Confirmation Modal Overlay */}
        {confirmRetryItem && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-md p-6 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl text-slate-100 space-y-4">
              <div className="flex items-center gap-3 text-amber-400">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h3 className="text-base font-bold text-slate-100">Confirm Sync Retry</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to reset event{' '}
                <span className="font-mono text-amber-300 font-semibold">{confirmRetryItem.client_event_id}</span> ({confirmRetryItem.event_type}) for retry? This will reset attempt count to 0 and re-queue the event for background push.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setConfirmRetryItem(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRetryConfirm}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                >
                  Confirm Retry
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
