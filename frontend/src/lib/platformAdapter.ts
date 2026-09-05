/**
 * Platform Adapter for TijaratPro
 * Decouples platform-specific implementations (Web, Electron Desktop, Mobile) from the business logic.
 */

interface SqlitePayload {
  id: string;
  customerId: string;
  total: number;
  status: string;
  items: string;
  paymentMethod: string;
  discount: number;
}

export const platformAdapter = {
  isDesktop: () => typeof window !== 'undefined' && !!(window as any).electron,
  
  isMobile: () => false, // Placeholder for future React Native/Capacitor implementation
  
  isWeb: () => typeof window !== 'undefined' && !(window as any).electron,

  /**
   * Dispatches global events. Useful for decoupled cross-module communication.
   */
  emitEvent: (eventName: string, detail?: any) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  },

  /**
   * Offline Storage Fallback
   * Attempts to save data to local SQLite queue if running on Electron
   */
  saveOfflineOrder: async (payload: SqlitePayload): Promise<{ success: boolean; order?: any }> => {
    if (platformAdapter.isDesktop()) {
      try {
        const mutateResult = await (window as any).electron.db.mutate('orders', 'CREATE', payload);
        if (mutateResult.success) {
          return { success: true, order: { ...payload, _id: payload.id } };
        }
      } catch (error) {
        console.error("Failed to save to local offline queue:", error);
      }
    }
    
    // Future Web Fallback (IndexedDB)
    if (platformAdapter.isWeb()) {
      console.warn("Web Offline Mode not yet implemented.");
    }

    return { success: false };
  }
};
