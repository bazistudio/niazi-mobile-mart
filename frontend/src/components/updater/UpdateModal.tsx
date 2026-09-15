import React from 'react';
import {
  Download,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { useUpdater } from '@/context/UpdaterContext';
import { tauriClient } from '@/lib/tauri/tauriClient';

const FALLBACK_URL = 'https://github.com/bazistudio/niazi-mobile-mart/releases/latest';

export const UpdateModal: React.FC = () => {
  const { state, checkUpdate, startDownload, restartAndInstall, closeModal } = useUpdater();

  if (!state.isModalOpen) return null;

  const formatMB = (bytes: number): string => {
    return (bytes / (1024 * 1024)).toFixed(1);
  };

  const handleOpenManualDownload = async () => {
    try {
      await tauriClient.openExternalUrl(FALLBACK_URL);
    } catch {
      window.open(FALLBACK_URL, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl transition-all">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Software Update
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Niazi Mobile Mart Desktop Edition
              </p>
            </div>
          </div>
          {state.status !== 'DOWNLOADING' && state.status !== 'INSTALLING' && (
            <button
              onClick={closeModal}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6">
          {/* STATE A: CHECKING */}
          {state.status === 'CHECKING' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <RefreshCw className="h-10 w-10 animate-spin text-teal-600 dark:text-teal-400 mb-4" />
              <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                Checking for updates...
              </h4>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Querying official release distribution channel
              </p>
            </div>
          )}

          {/* STATE B: IDLE / NO UPDATE */}
          {state.status === 'IDLE' && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-4">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                You're up to date!
              </h4>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                Niazi Mobile Mart v{state.currentVersion || '1.1.5'} is currently the latest version.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => checkUpdate(true)}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2.5 px-4 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Check Again
                </button>
                <button
                  onClick={closeModal}
                  className="rounded-xl bg-gray-900 dark:bg-gray-100 py-2.5 px-6 text-sm font-medium text-white dark:text-gray-900 shadow hover:bg-gray-800 dark:hover:bg-white transition"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* STATE C: AVAILABLE */}
          {state.status === 'AVAILABLE' && (
            <div>
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <Download className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                      New Release
                    </span>
                    <span className="rounded-full bg-teal-50 dark:bg-teal-950/50 px-2.5 py-0.5 text-xs font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                      v{state.availableVersion}
                    </span>
                  </div>
                  <h4 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                    Version {state.availableVersion} is available
                  </h4>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Current installed version: v{state.currentVersion}
                  </p>
                </div>
              </div>

              {/* Release Notes Box */}
              <div className="mt-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 p-4">
                <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  Release Notes
                </h5>
                <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed max-h-40 overflow-y-auto">
                  {state.releaseNotes || 'Includes performance optimizations, security enhancements, and multi-terminal capabilities.'}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={startDownload}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 px-4 shadow-lg shadow-teal-600/20 transition active:scale-[0.98]"
                >
                  <Download className="h-4 w-4" />
                  Download & Install Update
                </button>
                <button
                  onClick={handleOpenManualDownload}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium py-3 px-4 transition"
                >
                  <ExternalLink className="h-4 w-4" />
                  Download Manually
                </button>
              </div>
            </div>
          )}

          {/* STATE D: DOWNLOADING */}
          {state.status === 'DOWNLOADING' && (
            <div className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-teal-600 dark:text-teal-400" />
                  Downloading Update v{state.availableVersion}...
                </span>
                <span className="text-sm font-bold text-teal-600 dark:text-teal-400">
                  {state.progressPercent != null
                    ? `${Math.round(state.progressPercent)}%`
                    : formatMB(state.downloadedBytes) + ' MB'}
                </span>
              </div>

              {/* Dynamic Progress Bar */}
              <div className="w-full h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${
                      state.progressPercent != null
                        ? Math.max(5, Math.min(100, state.progressPercent))
                        : 50
                    }%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between mt-3 text-xs text-gray-500 dark:text-gray-400">
                <span>
                  {state.totalBytes
                    ? `Downloaded ${formatMB(state.downloadedBytes)} MB of ${formatMB(state.totalBytes)} MB`
                    : `Downloaded ${formatMB(state.downloadedBytes)} MB`}
                </span>
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  <ShieldCheck className="h-3.5 w-3.5" /> Verifying Minisign signature
                </span>
              </div>
            </div>
          )}

          {/* STATE E: INSTALLING */}
          {state.status === 'INSTALLING' && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <RefreshCw className="h-10 w-10 animate-spin text-teal-600 dark:text-teal-400 mb-4" />
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                Installing Update...
              </h4>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Applying update packages to desktop application boundary
              </p>
            </div>
          )}

          {/* STATE F: READY */}
          {state.status === 'READY' && (
            <div className="text-center py-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-4">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h4 className="text-xl font-bold text-gray-900 dark:text-white">
                Update Ready to Install!
              </h4>
              <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300">
                Version {state.availableVersion} has been downloaded and verified. Restart Niazi Mobile Mart now to apply the update.
              </p>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={restartAndInstall}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 px-4 shadow-lg shadow-teal-600/20 transition"
                >
                  <RefreshCw className="h-4 w-4" />
                  Restart & Install Now
                </button>
                <button
                  onClick={closeModal}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium py-3 px-4 transition"
                >
                  Restart Later
                </button>
              </div>
            </div>
          )}

          {/* STATE G: ERROR */}
          {state.status === 'ERROR' && (
            <div>
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Update could not be installed automatically
                  </h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                    {state.errorMessage || 'An error occurred during update download.'}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => checkUpdate(true)}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-white text-white dark:text-gray-900 font-medium py-2.5 px-4 transition"
                >
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </button>
                <button
                  onClick={handleOpenManualDownload}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-medium py-2.5 px-4 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition"
                >
                  <ExternalLink className="h-4 w-4" />
                  Download Installer Manually
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
