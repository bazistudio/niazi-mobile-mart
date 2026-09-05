import { Notification, ipcMain } from 'electron';
import { logger } from './logger';

export function showNotification(title: string, body: string) {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
    });
    
    notification.on('click', () => {
      logger.info(`[Notification] User clicked notification: ${title}`);
      // Could emit event to window if needed
    });
    
    notification.show();
  } else {
    logger.warn(`[Notification] Unsupported on this system. (Title: ${title}, Body: ${body})`);
  }
}

export function setupNotifications() {
  if (!ipcMain.listenerCount('app:notify')) {
    ipcMain.handle('app:notify', (_, title: string, body: string) => {
      showNotification(title, body);
    });
  }
}
