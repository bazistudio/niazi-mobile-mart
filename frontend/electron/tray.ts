import { app, Menu, Tray, BrowserWindow, shell } from 'electron';
import path from 'path';
import { logger } from './logger';
import { getSetting } from './services/settingsManager';
import { autoUpdater } from 'electron-updater';

let tray: Tray | null = null;

export function setupTray(mainWindow: BrowserWindow) {
  if (tray) return;

  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'app.asar', 'build', iconName)
    : path.join(__dirname, '../build', iconName);

  try {
    tray = new Tray(iconPath);
    tray.setToolTip('TijaratPro');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show TijaratPro',
        click: () => {
          if (mainWindow.isMinimized()) mainWindow.restore();
          if (!mainWindow.isVisible()) mainWindow.show();
          mainWindow.focus();
        }
      },
      {
        label: 'Hide TijaratPro',
        click: () => {
          mainWindow.hide();
        }
      },
      { type: 'separator' },
      {
        label: 'Check for Updates',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            if (!mainWindow.isVisible()) mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('updater:open-modal');
          }
          autoUpdater.checkForUpdatesAndNotify().catch((err) => {
            logger.error(`Tray update check failed: ${err}`);
          });
        }
      },
      {
        label: 'Open Logs Folder',
        click: () => {
          shell.openPath(path.join(app.getPath('userData'), 'logs'));
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });

    logger.info('[Tray] System tray initialized.');
  } catch (error) {
    logger.error('[Tray] Failed to initialize tray:', error);
  }
}

export function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}
