import Store from 'electron-store';
import { ipcMain } from 'electron';
import { logger } from '../logger';

export interface AppSettings {
  settingsVersion: number;
  minimizeToTray: boolean;
  closeToTray: boolean;
  autoUpdate: boolean;
  theme: 'system' | 'light' | 'dark';
  language: string;
}

const defaultSettings: AppSettings = {
  settingsVersion: 1,
  minimizeToTray: false,
  closeToTray: false,
  autoUpdate: true,
  theme: 'system',
  language: 'en'
};

const migrations = {
  '1.0.0': (store: Store<AppSettings>) => {
    store.set('settingsVersion', 1);
  },
  // Future versions:
  // '2.0.0': (store: Store<AppSettings>) => {
  //    store.set('settingsVersion', 2);
  //    if (!store.has('newSetting')) store.set('newSetting', true);
  // }
};

let settingsStore: Store<AppSettings>;

export function initSettings() {
  try {
    settingsStore = new Store<AppSettings>({
      name: 'tijarat-settings',
      defaults: defaultSettings,
      projectVersion: '1.0.0', // Used by electron-store for migrations
      migrations: migrations as any
    });
    logger.info(`[SettingsManager] Initialized. Version: ${settingsStore.get('settingsVersion')}`);
  } catch (err) {
    logger.error('[SettingsManager] Failed to initialize settings store:', err);
    // Fallback to memory store if disk write fails
    settingsStore = new Store<AppSettings>({ defaults: defaultSettings });
  }

  // Register IPCs
  if (!ipcMain.listenerCount('settings:get')) {
    ipcMain.handle('settings:get', () => {
      return settingsStore.store;
    });
  }

  if (!ipcMain.listenerCount('settings:update')) {
    ipcMain.handle('settings:update', (_, newSettings: Partial<AppSettings>) => {
      try {
        for (const [key, value] of Object.entries(newSettings)) {
          settingsStore.set(key as keyof AppSettings, value);
        }
        logger.info('[SettingsManager] Settings updated:', newSettings);
        return { success: true, settings: settingsStore.store };
      } catch (err: any) {
        logger.error('[SettingsManager] Failed to update settings:', err);
        return { success: false, error: err.message };
      }
    });
  }
}

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  if (!settingsStore) initSettings();
  return settingsStore.get(key);
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  if (!settingsStore) initSettings();
  settingsStore.set(key, value);
}

export function getAllSettings(): AppSettings {
  if (!settingsStore) initSettings();
  return settingsStore.store as AppSettings;
}
