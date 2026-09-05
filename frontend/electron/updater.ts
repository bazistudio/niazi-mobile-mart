import { autoUpdater } from "electron-updater";
import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { logger } from "./logger";
import { syncEngine } from "./services/syncEngine";
import { closeDb } from "./db";

let isUpdaterInitialized = false;
let isCheckingOrDownloading = false;
let currentStatus: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error' = 'idle';
let currentProgress: any = null;
let currentVersion: string | null = null;
let lastError: string | null = null;

function performGracefulQuitAndInstall() {
  app.removeAllListeners("window-all-closed");
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.close();
    }
  });
  try {
    syncEngine.stop();
    closeDb();
  } catch (err) {
    logger.error('Error shutting down resources for auto-update:', err);
  }
  autoUpdater.quitAndInstall(false, true);
}

export function setupUpdater(mainWindow: BrowserWindow) {
  // Bind electron-log logger to autoUpdater for detailed logs
  autoUpdater.logger = logger;

  // We want full control over the download and install process
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Override feed URL to use our secure Cloud Run backend instead of direct GitHub API
  autoUpdater.setFeedURL({
    provider: "generic",
    url: "https://tijaratpro-api-598374253827.asia-south1.run.app/api/v1/updates"
  });

  if (!isUpdaterInitialized) {
    isUpdaterInitialized = true;

    autoUpdater.on('checking-for-update', () => {
      logger.info('Updater: Checking for updates...');
      currentStatus = 'checking';
      lastError = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:status', 'checking');
      }
    });

    autoUpdater.on('update-available', (info) => {
      logger.info(`Updater: Update available: version ${info.version}`);
      currentStatus = 'downloading';
      currentVersion = info.version;
      lastError = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:available', info);
      }
    });

    autoUpdater.on('update-not-available', () => {
      logger.info('Updater: App is up to date.');
      isCheckingOrDownloading = false;
      currentStatus = 'up-to-date';
      lastError = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:status', 'up-to-date');
      }
    });

    autoUpdater.on('error', (err) => {
      isCheckingOrDownloading = false;
      currentStatus = 'error';
      lastError = err.message || 'Update check failed';
      logger.error(`Updater Error (App version: ${app.getVersion()}): ${err.message}`);
      if (err.stack) {
        logger.error(`Updater Stack Trace: ${err.stack}`);
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:error', lastError);
      }
    });

    autoUpdater.on('download-progress', (progressObj) => {
      currentStatus = 'downloading';
      currentProgress = progressObj;
      const percent = Math.round(progressObj.percent);
      logger.info(`Updater: Downloading update... ${percent}%`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:progress', progressObj);
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      isCheckingOrDownloading = false;
      currentStatus = 'downloaded';
      currentVersion = info.version;
      logger.info(`Updater: Update downloaded: version ${info.version}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:downloaded', info);
      }
      
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'TijaratPro Update Ready',
        message: `A new version (${info.version}) of TijaratPro has been downloaded and is ready to install.`,
        buttons: ['Install Now', 'Later'],
        defaultId: 0,
        cancelId: 1
      }).then(({ response }) => {
        if (response === 0) {
          performGracefulQuitAndInstall();
        }
      });
    });
  }

  // Handle IPC calls from renderer safely (re-bind to prevent collisions)
  if (ipcMain.listenerCount('updater:check') > 0) {
    ipcMain.removeHandler('updater:check');
  }
  ipcMain.handle('updater:check', async () => {
    logger.info('Updater: Manual update check requested via IPC');
    if (isCheckingOrDownloading) {
      logger.info('Updater: Update check or download already in progress. Re-using active task.');
      return { status: currentStatus, inProgress: true };
    }
    try {
      isCheckingOrDownloading = true;
      currentStatus = 'checking';
      lastError = null;
      return await autoUpdater.checkForUpdatesAndNotify();
    } catch (err: any) {
      isCheckingOrDownloading = false;
      currentStatus = 'error';
      lastError = err.message;
      return { status: 'error', error: err.message };
    }
  });

  if (ipcMain.listenerCount('updater:getState') > 0) {
    ipcMain.removeHandler('updater:getState');
  }
  ipcMain.handle('updater:getState', () => {
    return {
      status: currentStatus,
      progress: currentProgress,
      version: currentVersion,
      currentAppVersion: app.getVersion(),
      error: lastError,
      isCheckingOrDownloading
    };
  });

  if (ipcMain.listenerCount('updater:install') > 0) {
    ipcMain.removeHandler('updater:install');
  }
  ipcMain.handle('updater:install', () => {
    logger.info('Updater: Manual update installation requested via IPC');
    performGracefulQuitAndInstall();
  });
}

