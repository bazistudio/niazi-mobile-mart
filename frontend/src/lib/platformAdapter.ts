/**
 * Platform Adapter for TijaratPro
 * Decouples platform-specific implementations from the business logic.
 */

export const platformAdapter = {
  isDesktop: () => false,
  
  isMobile: () => false,
  
  isWeb: () => true,

  /**
   * Dispatches global events. Useful for decoupled cross-module communication.
   */
  emitEvent: (eventName: string, detail?: any) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  }
};
