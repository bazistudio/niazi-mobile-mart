import React, { useEffect, useState } from 'react';

type UpdateState = {
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error';
  progress: {
    percent?: number;
    transferred?: number;
    total?: number;
    bytesPerSecond?: number;
  } | null;
  version: string | null;
  currentAppVersion: string;
  error: string | null;
  isCheckingOrDownloading: boolean;
};

type UpdateModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const UpdateModal: React.FC<UpdateModalProps> = ({ isOpen, onClose }) => {
  const [updateState, setUpdateState] = useState<UpdateState>({
    status: 'checking',
    progress: null,
    version: null,
    currentAppVersion: '',
    error: null,
    isCheckingOrDownloading: false
  });

  const syncState = async () => {
    if (!window.electron?.updater?.getState) return;
    try {
      const state = await window.electron.updater.getState();
      setUpdateState(prev => ({
        ...prev,
        status: (state.status as any) || 'idle',
        progress: state.progress || null,
        version: state.version || null,
        currentAppVersion: state.currentAppVersion || prev.currentAppVersion,
        error: state.error || null,
        isCheckingOrDownloading: state.isCheckingOrDownloading || false
      }));
    } catch {
      // Ignored in non-electron environments
    }
  };

  useEffect(() => {
    if (!isOpen || !window.electron) return;

    syncState();

    const onStatus = (_: any, status: string) => {
      setUpdateState(prev => ({
        ...prev,
        status: status as any,
        error: status === 'error' ? prev.error : null
      }));
    };

    const onAvailable = (_: any, info: any) => {
      setUpdateState(prev => ({
        ...prev,
        status: 'available',
        version: info?.version || null
      }));
    };

    const onProgress = (_: any, progressObj: any) => {
      setUpdateState(prev => ({
        ...prev,
        status: 'downloading',
        progress: progressObj
      }));
    };

    const onDownloaded = (_: any, info: any) => {
      setUpdateState(prev => ({
        ...prev,
        status: 'downloaded',
        version: info?.version || prev.version
      }));
    };

    const onError = (_: any, errMessage: string) => {
      setUpdateState(prev => ({
        ...prev,
        status: 'error',
        error: errMessage
      }));
    };

    window.electron.on('updater:status', onStatus);
    window.electron.on('updater:available', onAvailable);
    window.electron.on('updater:progress', onProgress);
    window.electron.on('updater:downloaded', onDownloaded);
    window.electron.on('updater:error', onError);

    return () => {
      if (!window.electron) return;
      window.electron.off('updater:status', onStatus);
      window.electron.off('updater:available', onAvailable);
      window.electron.off('updater:progress', onProgress);
      window.electron.off('updater:downloaded', onDownloaded);
      window.electron.off('updater:error', onError);
    };
  }, [isOpen]);

  const handleManualCheck = async () => {
    setUpdateState(prev => ({ ...prev, status: 'checking', error: null }));
    if (window.electron?.updater?.checkForUpdates) {
      try {
        await window.electron.updater.checkForUpdates();
      } catch (err: any) {
        setUpdateState(prev => ({
          ...prev,
          status: 'error',
          error: err?.message || 'Check failed'
        }));
      }
    }
  };

  const handleInstallNow = () => {
    if (window.electron?.updater?.installUpdate) {
      window.electron.updater.installUpdate();
    }
  };

  if (!isOpen) return null;

  const percent = updateState.progress?.percent ? Math.round(updateState.progress.percent) : 0;
  const transferredMB = updateState.progress?.transferred ? (updateState.progress.transferred / 1024 / 1024).toFixed(1) : '0';
  const totalMB = updateState.progress?.total ? (updateState.progress.total / 1024 / 1024).toFixed(1) : '0';
  const speedMBs = updateState.progress?.bytesPerSecond ? (updateState.progress.bytesPerSecond / 1024 / 1024).toFixed(1) : '0';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#141414] border border-white/10 rounded-2xl shadow-2xl overflow-hidden w-full max-w-md animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-[#1a1a1a]">
          <div className="flex items-center gap-2">
            <span className="text-blue-400 font-semibold text-sm">TijaratPro Updates</span>
            {updateState.currentAppVersion && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10">
                v{updateState.currentAppVersion}
              </span>
            )}
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-white/5 transition-colors"
            title="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {/* 1. CHECKING */}
          {updateState.status === 'checking' && (
            <div className="text-center py-4 space-y-3">
              <div className="w-10 h-10 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto" />
              <div className="text-white font-medium">Checking for updates...</div>
              <p className="text-gray-400 text-xs">Connecting to TijaratPro Cloud update service</p>
            </div>
          )}

          {/* 2. UP TO DATE */}
          {updateState.status === 'up-to-date' && (
            <div className="text-center py-3 space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold text-base">You're Up to Date</h3>
                <p className="text-gray-400 text-xs mt-1">
                  TijaratPro v{updateState.currentAppVersion} is currently the newest available release.
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-2">
                <button
                  onClick={handleManualCheck}
                  className="px-4 py-1.5 text-xs text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
                >
                  Check Again
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* 3. DOWNLOADING / AVAILABLE */}
          {(updateState.status === 'available' || updateState.status === 'downloading') && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold text-sm">
                    {updateState.version ? `Downloading v${updateState.version}` : 'Downloading Update...'}
                  </h3>
                  <p className="text-gray-400 text-xs mt-0.5">
                    Background download active — POS operations are unaffected.
                  </p>
                </div>
                <span className="text-blue-400 font-mono font-bold text-sm">{percent}%</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/10">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-200"
                  style={{ width: `${percent}%` }}
                />
              </div>

              {/* Honest Progress Metrics */}
              {updateState.progress && (
                <div className="flex justify-between text-[11px] text-gray-400 font-mono">
                  <span>{transferredMB} MB of {totalMB} MB</span>
                  <span>{speedMBs} MB/s</span>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 text-xs text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
                >
                  Continue Working
                </button>
              </div>
            </div>
          )}

          {/* 4. DOWNLOADED / READY TO INSTALL */}
          {updateState.status === 'downloaded' && (
            <div className="text-center py-2 space-y-4">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto border border-blue-500/20">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold text-base">
                  Update Ready to Install
                </h3>
                <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                  TijaratPro {updateState.version ? `v${updateState.version}` : 'update'} has been downloaded and verified.
                  Local database and active sales will be safely closed before restart.
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10"
                >
                  Install on Next Launch
                </button>
                <button
                  onClick={handleInstallNow}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors shadow-lg shadow-blue-600/20 flex items-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                  Install & Restart Now
                </button>
              </div>
            </div>
          )}

          {/* 5. ERROR / OFFLINE */}
          {updateState.status === 'error' && (
            <div className="text-center py-2 space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">Unable to Check for Updates</h3>
                <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                  Could not reach the update service. TijaratPro is fully offline-capable; all POS and shop features remain operational.
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-2">
                <button
                  onClick={handleManualCheck}
                  className="px-4 py-1.5 text-xs text-white bg-white/10 hover:bg-white/15 rounded-lg transition-colors border border-white/10"
                >
                  Try Again
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 text-xs text-gray-400 hover:text-white bg-transparent rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
