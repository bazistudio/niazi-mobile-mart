import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

// --------------------------------------------------------------------------
// Type definitions exposed to the renderer (window.electron)
// --------------------------------------------------------------------------
export interface AppInfo {
  version: string;
  name: string;
  isDev: boolean;
  platform: NodeJS.Platform;
}

export interface ElectronAPI {
  /** Returns basic information about the running app */
  getAppInfo: () => Promise<AppInfo>;

  /** Returns detailed OS/App system info */
  getSystemInfo: () => Promise<any>;

  /** Quits the desktop application */
  quit: () => Promise<void>;

  /** Opens a URL safely in the system default browser */
  openExternal: (url: string) => Promise<void>;

  /** Relaunches the app */
  relaunch: () => Promise<void>;

  /** Opens the log folder */
  openLogs: () => Promise<void>;

  /** Subscribe to a named event pushed from the main process */
  on: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void;

  /** Unsubscribe from a named main-process event */
  off: (channel: string, listener: (...args: unknown[]) => void) => void;

  db: {
    mutate: (entityType: string, operation: 'CREATE'|'UPDATE'|'DELETE', payload: any) => Promise<{ success: boolean; opId?: string; error?: string }>;
    query: (entityType: string, id: string) => Promise<any>;
    queryAll: (entityType: string) => Promise<any[]>;
    backup: () => Promise<{ success: boolean; message: string; backupFile?: string }>;
    restore: (backupFilePath: string) => Promise<{ success: boolean; message: string }>;
    getBackupStatus: () => Promise<any>;
    setBackupPath: (path: string) => Promise<{ success: boolean }>;
  };

  auth: {
    setToken: (key: string, token: string) => Promise<void>;
    getToken: (key: string) => Promise<string | null>;
    clearToken: (key: string) => Promise<void>;
  };

  updater: {
    checkForUpdates: () => Promise<any>;
    installUpdate: () => Promise<void>;
    getState: () => Promise<{ status: string; progress?: any; version?: string; currentAppVersion: string; error?: string; isCheckingOrDownloading: boolean }>;
  };
}

// --------------------------------------------------------------------------
// Allowed IPC channels (whitelist for security)
// --------------------------------------------------------------------------
const ALLOWED_CHANNELS = [
  "app:notification",
  "app:updateAvailable",
  "updater:status",
  "updater:available",
  "updater:error",
  "updater:progress",
  "updater:downloaded",
  "updater:open-modal"
] as const;
type AllowedChannel = (typeof ALLOWED_CHANNELS)[number];

function isAllowedChannel(channel: string): channel is AllowedChannel {
  return (ALLOWED_CHANNELS as readonly string[]).includes(channel);
}

// --------------------------------------------------------------------------
// Expose the API on window.electron
// --------------------------------------------------------------------------
const electronAPI: ElectronAPI = {
  getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
  getSystemInfo: () => ipcRenderer.invoke("app:getSystemInfo"),

  quit: () => ipcRenderer.invoke("app:quit"),
  minimize: () => ipcRenderer.invoke("app:minimize"),
  maximize: () => ipcRenderer.invoke("app:maximize"),
  close: () => ipcRenderer.invoke("app:close"),

  openExternal: (url: string) => ipcRenderer.invoke("app:openExternal", url),
  relaunch: () => ipcRenderer.invoke("app:relaunch"),
  openLogs: () => ipcRenderer.invoke("app:openLogs"),

  on: (channel, listener) => {
    if (!isAllowedChannel(channel)) {
      console.warn(`[preload] Blocked subscription to unknown channel: ${channel}`);
      return;
    }
    ipcRenderer.on(channel, listener);
  },

  off: (channel, listener) => {
    if (!isAllowedChannel(channel)) return;
    ipcRenderer.off(channel, listener as never);
  },

  db: {
    mutate: (entityType, operation, payload) => ipcRenderer.invoke('db:mutate', entityType, operation, payload),
    query: (entityType, id) => ipcRenderer.invoke('db:query', entityType, id),
    queryAll: (entityType) => ipcRenderer.invoke('db:queryAll', entityType),
    backup: () => ipcRenderer.invoke('db:backup'),
    restore: (backupFilePath: string) => ipcRenderer.invoke('db:restore', backupFilePath),
    getBackupStatus: () => ipcRenderer.invoke('db:get-backup-status'),
    setBackupPath: (path: string) => ipcRenderer.invoke('db:set-backup-path', path),
  },

  auth: {
    setToken: (key: string, token: string) => ipcRenderer.invoke('auth:setToken', key, token),
    getToken: (key: string) => ipcRenderer.invoke('auth:getToken', key),
    clearToken: (key: string) => ipcRenderer.invoke('auth:clearToken', key),
  },

  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),
    installUpdate: () => ipcRenderer.invoke('updater:install'),
    getState: () => ipcRenderer.invoke('updater:getState')
  }
};

contextBridge.exposeInMainWorld("electron", electronAPI);
