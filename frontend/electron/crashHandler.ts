import { app, dialog, BrowserWindow, shell, clipboard } from 'electron';
import path from 'path';
import Store from 'electron-store';
import { logger } from './logger';
import { closeDb } from './db';

const crashStore = new Store<{ startupCrashes: number; gpuCrashes: number }>({ name: 'crash-state', defaults: { startupCrashes: 0, gpuCrashes: 0 } });

const isDev = !app.isPackaged;
let shuttingDown = false;
let appReadyForUse = false;

export function setAppReadyForUse(ready: boolean) {
  appReadyForUse = ready;
}

export function setupCrashHandler() {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    gracefulShutdown('Uncaught Exception', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('Unhandled Rejection', reason);
  });

  app.on('render-process-gone', (event, webContents, details) => {
    logger.error(`Render process gone. Reason: ${details.reason}, Exit code: ${details.exitCode}`);
    if (details.reason === 'crashed' || details.reason === 'oom') {
      const win = BrowserWindow.fromWebContents(webContents);
      if (win && !win.isDestroyed()) {
        logger.info('Attempting to load error.html in crashed renderer...');
        win.loadFile(path.join(__dirname, '../electron/error.html')).catch(err => {
          gracefulShutdown(`Renderer Process Crashed (${details.reason})`, err);
        });
      } else {
        gracefulShutdown(`Renderer Process Crashed (${details.reason})`);
      }
    }
  });

  app.on('child-process-gone', (event, details) => {
    logger.error(`Child process gone. Type: ${details.type}, Reason: ${details.reason}, Name: ${details.name}`);
    if (details.type === 'GPU' && details.reason === 'crashed') {
      logger.error('GPU process crashed! This might indicate a graphics driver issue.');
      const gpuCrashes = (crashStore.get('gpuCrashes') as number) + 1;
      crashStore.set('gpuCrashes', gpuCrashes);
    }
  });
}

function gracefulShutdown(reason: string, error?: any) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Initiating graceful shutdown due to: ${reason}`);

  try {
    logger.info('Closing database connections safely...');
    closeDb();
  } catch (err) {
    logger.error('Error while closing database during shutdown:', err);
  }

  // Show dialog in production so the user knows why it quit
  if (!isDev) {
    // If the window is not ready yet, it's a startup crash
    const isStartup = !appReadyForUse;
    if (isStartup) {
      const crashes = (crashStore.get('startupCrashes') as number) + 1;
      crashStore.set('startupCrashes', crashes);
      if (crashes >= 3) {
        logger.warn('Safe Mode activated due to repeated startup crashes.');
        // Could implement safe-mode logic here, for now we just log it and maybe avoid reloading
      }
    }

    const logPath = path.join(app.getPath('userData'), 'logs', 'main.log');
    const response = dialog.showMessageBoxSync({
      type: 'error',
      title: 'Unexpected Error',
      message: 'TijaratPro encountered an unexpected error.',
      detail: 'The application needs to close safely.\n\nPlease restart the application.\n\nIf the issue continues, contact support and send the log file.',
      buttons: ['Restart App', 'Copy Error Details', 'Open Logs Folder', 'View Logs', 'Exit'],
      defaultId: 0,
      cancelId: 4,
      noLink: true
    });

    if (response === 1) {
      const details = [
        `App Version: ${app.getVersion()}`,
        `Electron Version: ${process.versions.electron}`,
        `Node Version: ${process.versions.node}`,
        `OS: ${process.platform} ${process.arch}`,
        `Timestamp: ${new Date().toISOString()}`,
        `Log Path: ${logPath}`,
        `\nReason: ${reason}`
      ];
      if (error) {
        if (error.name) details.push(`Error Name: ${error.name}`);
        if (error.message) details.push(`Message: ${error.message}`);
        if (error.stack) details.push(`Stack Trace:\n${error.stack}`);
        else {
          try {
            details.push(`Error Obj: ${JSON.stringify(error, null, 2)}`);
          } catch {
            details.push(`Error Obj: ${String(error)}`);
          }
        }
      }
      clipboard.writeText(details.join('\n'));
    } else if (response === 2) {
      shell.showItemInFolder(logPath);
    } else if (response === 3) {
      shell.openPath(logPath);
    }

    if (response === 0) {
      app.relaunch();
      app.exit(0);
    }
  }

  logger.info('Closing browser windows...');
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.destroy(); // Use destroy for fatal crashes to prevent hang
    }
  });

  try {
    if ((logger as any).transports?.file?.getFile()?.clear) {
       // log flush isn't strictly needed for electron-log (it's synchronous), but we can try if there is an async transport
    }
  } catch (err) {}

  logger.info('Exiting application...');
  app.exit(0);
}
