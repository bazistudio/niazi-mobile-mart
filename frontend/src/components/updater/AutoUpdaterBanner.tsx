import React from 'react';
import { Sparkles, Download, RefreshCw, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useUpdater } from '@/context/UpdaterContext';
import { tauriClient } from '@/lib/tauri/tauriClient';

export const AutoUpdaterBanner: React.FC = () => {
  const { state, restartAndInstall, openModal, isBannerDismissed, dismissBanner } = useUpdater();

  if (!tauriClient.isTauri()) return null;
  if (isBannerDismissed) return null;
  if (state.status === 'IDLE' || state.status === 'CHECKING') return null;

  const formatMB = (bytes: number): string => {
    return (bytes / (1024 * 1024)).toFixed(1);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9990] max-w-md w-full animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="overflow-hidden rounded-2xl border border-teal-500/30 bg-slate-900/95 text-white shadow-2xl backdrop-blur-md p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/20 text-teal-400 mt-0.5">
              {state.status === 'READY' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              ) : state.status === 'ERROR' ? (
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              ) : (
                <Sparkles className="h-5 w-5 animate-pulse text-teal-300" />
              )}
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-100">
                  {state.status === 'READY'
                    ? `Update v${state.availableVersion} Ready`
                    : state.status === 'DOWNLOADING' || state.status === 'INSTALLING'
                    ? `Downloading Update v${state.availableVersion}`
                    : state.status === 'ERROR'
                    ? 'Update Issue'
                    : `Update v${state.availableVersion} Available`}
                </span>
              </div>

              {/* Progress Detail */}
              {(state.status === 'DOWNLOADING' || state.status === 'INSTALLING') && (
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-300"
                      style={{
                        width: `${state.progressPercent ?? (state.status === 'INSTALLING' ? 100 : 15)}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-slate-300 flex items-center justify-between">
                    <span>
                      {state.progressPercent !== null
                        ? `${Math.round(state.progressPercent)}% downloaded`
                        : state.status === 'INSTALLING'
                        ? 'Applying update packages...'
                        : 'Downloading...'}
                    </span>
                    {state.totalBytes ? (
                      <span className="text-slate-400 text-[11px]">
                        {formatMB(state.downloadedBytes)} / {formatMB(state.totalBytes)} MB
                      </span>
                    ) : state.downloadedBytes > 0 ? (
                      <span className="text-slate-400 text-[11px]">
                        {formatMB(state.downloadedBytes)} MB
                      </span>
                    ) : null}
                  </p>
                </div>
              )}

              {state.status === 'READY' && (
                <p className="text-xs text-slate-300 mt-0.5">
                  The latest version has been downloaded. Restart to complete installation.
                </p>
              )}

              {state.status === 'ERROR' && (
                <p className="text-xs text-amber-300/90 mt-0.5 line-clamp-2">
                  {state.errorMessage || 'Unable to complete update automatically.'}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={dismissBanner}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={openModal}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            Details & Notes
          </button>

          {state.status === 'READY' && (
            <button
              type="button"
              onClick={restartAndInstall}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Restart & Install Now</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
