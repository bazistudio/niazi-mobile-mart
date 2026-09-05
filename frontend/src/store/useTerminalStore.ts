import { create } from 'zustand';

interface TerminalState {
  isTerminalLocked: boolean;
  setTerminalLocked: (locked: boolean) => void;
  lockTerminal: () => void;
  unlockTerminal: () => void;
}

/**
 * Terminal UI State Store
 *
 * Strictly manages terminal lock status and screen guarding.
 * Contains ZERO authentication credentials, JWTs, or user identity records.
 * useAuthStore remains the sole authentication authority.
 */
export const useTerminalStore = create<TerminalState>((set) => ({
  isTerminalLocked: false,
  setTerminalLocked: (locked: boolean) => set({ isTerminalLocked: locked }),
  lockTerminal: () => set({ isTerminalLocked: true }),
  unlockTerminal: () => set({ isTerminalLocked: false }),
}));
