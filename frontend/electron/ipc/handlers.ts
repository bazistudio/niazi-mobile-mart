import { ipcMain, BrowserWindow, app, shell } from 'electron';
import path from 'path';
import { mutateEntity, queryEntity, queryAll } from '../db/queries';
import { setToken, getToken, clearToken } from '../auth/storage';
import { createBackup, getBackupStatus, restoreDatabase, openBackupFolder } from '../services/backupManager';
import { configStore } from '../services/config';
import { validatePayload } from './validation';
import { logger } from '../logger';

function handleIpc(channel: string, handler: (...args: any[]) => any) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error: any) {
      logger.error(`[IPC Error] Channel: ${channel}`, {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  });
}

export function setupIpcHandlers() {
  handleIpc('db:mutate', (_event, entityType: string, operation: 'CREATE'|'UPDATE'|'DELETE', payload: any) => {
    let validatedPayload;
    try {
      validatedPayload = validatePayload(entityType, operation, payload);
    } catch (err: any) {
      // Log validation failures properly too (already caught and handled below if we throw, but we want a specific error structure)
      throw new Error(`[IPC Security] Invalid payload for ${entityType} ${operation}`);
    }

    try {
      return mutateEntity(entityType, operation, validatedPayload);
    } catch (err: any) {
      throw new Error(`Database mutation failed: ${err.message}`);
    }
  });

  handleIpc('db:query', (_event, entityType: string, id: string) => {
    return queryEntity(entityType, id);
  });

  handleIpc('db:queryAll', (_event, entityType: string) => {
    return queryAll(entityType);
  });


  // Auth / SafeStorage
  handleIpc('auth:setToken', (_event, key: string, token: string) => {
    setToken(key, token);
  });

  handleIpc('auth:getToken', (_event, key: string) => {
    return getToken(key);
  });

  handleIpc('auth:clearToken', (_event, key: string) => {
    clearToken(key);
  });

  // Backup Engine
  handleIpc('db:backup', async () => {
    return createBackup();
  });

  handleIpc('db:restore', async (_event, backupFilePath: string) => {
    return restoreDatabase(backupFilePath);
  });

  handleIpc('db:get-backup-status', () => {
    return getBackupStatus();
  });

  handleIpc('db:set-backup-path', (_event, backupPath: string) => {
    (configStore as any).set('backupPath', backupPath);
    return { success: true };
  });

  handleIpc('db:open-backup-folder', () => {
    openBackupFolder();
  });

  // Desktop Shell Controls
  handleIpc('app:minimize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  });

  handleIpc('app:maximize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  handleIpc('app:close', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
  });

  handleIpc('app:relaunch', () => {
    app.relaunch();
    app.exit(0);
  });

  handleIpc('app:openLogs', () => {
    shell.openPath(path.join(app.getPath('userData'), 'logs'));
  });

  handleIpc('app:getSystemInfo', () => {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      memoryUsage: process.getSystemMemoryInfo ? process.getSystemMemoryInfo() : process.memoryUsage()
    };
  });
}
