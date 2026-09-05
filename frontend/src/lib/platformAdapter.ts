/**
 * Platform Adapter for Niazi Mobile Mart / TijaratPro
 * Decouples platform-specific implementations from the business logic.
 */
import { isTauriEnvironment } from './tauri/tauriClient';

export const platformAdapter = {
  isDesktop: () => isTauriEnvironment(),
  
  isMobile: () => false,
  
  isWeb: () => !isTauriEnvironment(),

  /**
   * Dispatches global events. Useful for decoupled cross-module communication.
   */
  emitEvent: (eventName: string, detail?: any) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  }
};
