/**
 * Tauri IPC Client for Niazi Mobile Mart
 * Provides graceful fallback in browser mode and native IPC in Tauri mode.
 */

export interface HealthResponse {
  status: string;
  app_name: string;
  version: string;
  engine: string;
  timestamp_ms: number;
}

export const isTauriEnvironment = (): boolean => {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
};

export const tauriClient = {
  isTauri: isTauriEnvironment,

  async healthCheck(): Promise<HealthResponse> {
    if (isTauriEnvironment()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<HealthResponse>('health_check');
      } catch (err) {
        console.warn('[Tauri IPC Error]', err);
        throw err;
      }
    }
    return {
      status: 'ok',
      app_name: 'Niazi Mobile Mart (Web Fallback)',
      version: '5.0.3',
      engine: 'Browser Runtime (Development)',
      timestamp_ms: Date.now(),
    };
  },

  async ping(message?: string): Promise<string> {
    if (isTauriEnvironment()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<string>('ping', { message });
      } catch (err) {
        console.warn('[Tauri IPC Error]', err);
        throw err;
      }
    }
    return `pong (web fallback): ${message || 'hello'}`;
  },
};
