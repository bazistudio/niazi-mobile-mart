import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import {
  tauriClient,
  UpdateCheckResponse,
  UpdateProgressPayload,
} from '@/lib/tauri/tauriClient';

export type UpdaterStatus =
  | 'IDLE'
  | 'CHECKING'
  | 'AVAILABLE'
  | 'DOWNLOADING'
  | 'INSTALLING'
  | 'READY'
  | 'ERROR';

export interface UpdaterState {
  status: UpdaterStatus;
  currentVersion: string;
  availableVersion: string;
  downloadedBytes: number;
  totalBytes: number | null;
  progressPercent: number | null;
  errorMessage: string;
  releaseNotes: string | null;
  isModalOpen: boolean;
}

interface UpdaterContextType {
  state: UpdaterState;
  checkUpdate: (manualOpenModal?: boolean) => Promise<void>;
  startDownload: () => Promise<void>;
  restartAndInstall: () => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
  dismissBanner: () => void;
  isBannerDismissed: boolean;
}

const UpdaterContext = createContext<UpdaterContextType | null>(null);

export const UpdaterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<UpdaterState>({
    status: 'IDLE',
    currentVersion: '',
    availableVersion: '',
    downloadedBytes: 0,
    totalBytes: null,
    progressPercent: null,
    errorMessage: '',
    releaseNotes: null,
    isModalOpen: false,
  });

  const [isBannerDismissed, setIsBannerDismissed] = useState<boolean>(false);
  const isOperationLocked = useRef<boolean>(false);

  const openModal = () => setState((prev) => ({ ...prev, isModalOpen: true }));
  const closeModal = () => setState((prev) => ({ ...prev, isModalOpen: false }));
  const dismissBanner = () => setIsBannerDismissed(true);

  // ── Core Update Check ───────────────────────────────────────────────────
  const checkUpdate = async (manualOpenModal = false) => {
    if (!tauriClient.isTauri()) return;
    if (manualOpenModal) {
      openModal();
    }

    // Single-flight lock: avoid duplicate checks if already checking or downloading
    if (isOperationLocked.current) {
      return;
    }

    isOperationLocked.current = true;
    setState((prev) => ({
      ...prev,
      status: 'CHECKING',
      errorMessage: '',
    }));

    try {
      const res: UpdateCheckResponse = await tauriClient.checkAppUpdate();
      if (res.available) {
        setState((prev) => ({
          ...prev,
          status: 'AVAILABLE',
          currentVersion: res.current_version,
          availableVersion: res.version,
          releaseNotes: res.body || null,
        }));
        // Automatically start background download if an update is found
        await executeDownload();
      } else {
        setState((prev) => ({
          ...prev,
          status: 'IDLE',
          currentVersion: res.current_version,
          availableVersion: res.current_version,
        }));
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to check for updates.';
      setState((prev) => ({
        ...prev,
        status: 'ERROR',
        errorMessage: msg,
      }));
    } finally {
      isOperationLocked.current = false;
    }
  };

  // ── Execute Background Download ────────────────────────────────────────
  const executeDownload = async () => {
    setState((prev) => ({
      ...prev,
      status: 'DOWNLOADING',
      errorMessage: '',
    }));
    try {
      await tauriClient.downloadAndInstallUpdate();
      setState((prev) => ({
        ...prev,
        status: 'READY',
        progressPercent: 100,
      }));
    } catch (err: any) {
      const msg = err?.message || 'Download/install failed.';
      setState((prev) => ({
        ...prev,
        status: 'ERROR',
        errorMessage: msg,
      }));
    }
  };

  const startDownload = async () => {
    if (isOperationLocked.current && state.status === 'DOWNLOADING') return;
    isOperationLocked.current = true;
    try {
      await executeDownload();
    } finally {
      isOperationLocked.current = false;
    }
  };

  const restartAndInstall = async () => {
    try {
      await tauriClient.relaunchApp();
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        status: 'ERROR',
        errorMessage: 'Restart failed: ' + (err?.message || 'Unknown error'),
      }));
    }
  };

  // ── Global Tauri Event Listeners & Startup Check ────────────────────────
  useEffect(() => {
    if (!tauriClient.isTauri()) return;

    let unlistenTrigger: (() => void) | undefined;
    let unlistenProgress: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        // Help menu trigger: open modal & check update
        unlistenTrigger = await listen('trigger-update-check', () => {
          checkUpdate(true);
        });

        // Live download progress event emitted from Rust backend
        unlistenProgress = await listen<UpdateProgressPayload>('update-progress', (event) => {
          const payload = event.payload;
          const statusMap: Record<string, UpdaterStatus> = {
            downloading: 'DOWNLOADING',
            installing: 'INSTALLING',
            completed: 'READY',
            error: 'ERROR',
          };

          const newStatus = statusMap[payload.status] || 'DOWNLOADING';
          const validPercentage =
            typeof payload.percentage === 'number' && !isNaN(payload.percentage)
              ? Math.min(100, Math.max(0, payload.percentage))
              : null;

          setState((prev) => ({
            ...prev,
            status: newStatus,
            downloadedBytes: payload.downloaded || 0,
            totalBytes: payload.total || null,
            progressPercent: validPercentage,
            errorMessage: payload.error || prev.errorMessage,
          }));
        });
      } catch (e) {
        console.warn('[UPDATER] Listener setup failed:', e);
      }
    };

    setupListeners();

    // Silent background update check on app launch
    const timer = setTimeout(() => {
      checkUpdate(false);
    }, 2000);

    return () => {
      clearTimeout(timer);
      if (unlistenTrigger) unlistenTrigger();
      if (unlistenProgress) unlistenProgress();
    };
  }, []);

  return (
    <UpdaterContext.Provider
      value={{
        state,
        checkUpdate,
        startDownload,
        restartAndInstall,
        openModal,
        closeModal,
        dismissBanner,
        isBannerDismissed,
      }}
    >
      {children}
    </UpdaterContext.Provider>
  );
};

export const useUpdater = (): UpdaterContextType => {
  const context = useContext(UpdaterContext);
  if (!context) {
    throw new Error('useUpdater must be used within an UpdaterProvider');
  }
  return context;
};
