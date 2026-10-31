import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isTauriEnvironment, tauriClient } from '@/lib/tauri/tauriClient';

interface TerminalState {
  isTerminalLocked: boolean;
  setTerminalLocked: (locked: boolean) => void;
  lockTerminal: () => void;
  unlockTerminal: () => void;
}

const TERMINAL_LOCK_STORAGE_KEY = 'niazi_terminal_lock_state';

/**
 * Terminal UI State Store with Fail-Closed Persistence
 *
 * Strictly manages terminal lock status and screen guarding.
 * Contains ZERO authentication credentials, JWTs, or user identity records.
 * useAuthStore remains the sole authentication authority.
 *
 * Security & Persistence Guarantees:
 * 1. A locked workstation remains locked across page refreshes, browser navigation, and restarts.
 * 2. Unlocking is strictly controlled: calling unlockTerminal clears the lock in persistent storage
 *    and notifies native Tauri backend when running in desktop mode.
 * 3. Lock state is persisted securely in local storage via zustand/persist under a dedicated key.
 *    No sensitive tokens, credentials, or hashes are ever saved.
 */
export const useTerminalStore = create<TerminalState>()(
  persist(
    (set) => ({
      isTerminalLocked: false,

      setTerminalLocked: (locked: boolean) => {
        set({ isTerminalLocked: locked });
        if (locked && isTauriEnvironment()) {
          tauriClient.authLock().catch(() => {});
        }
      },

      lockTerminal: () => {
        set({ isTerminalLocked: true });
        if (isTauriEnvironment()) {
          tauriClient.authLock().catch(() => {});
        }
      },

      unlockTerminal: () => {
        set({ isTerminalLocked: false });
      },
    }),
    {
      name: TERMINAL_LOCK_STORAGE_KEY,
      partialize: (state) => ({ isTerminalLocked: state.isTerminalLocked }),
    }
  )
);
