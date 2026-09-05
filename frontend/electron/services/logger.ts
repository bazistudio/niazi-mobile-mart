import fs from 'fs';
import path from 'path';
import { app } from 'electron';

// Lazily resolved on first write — safe before app.whenReady()
let syncLogPath: string | null = null;

function getLogPath(): string {
  if (!syncLogPath) {
    const logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    syncLogPath = path.join(logDir, 'sync.log');
  }
  return syncLogPath;
}

export const syncLogger = {
  info: (message: string, meta: any = {}) => {
    const entry = `[INFO] ${new Date().toISOString()} - ${message} - ${JSON.stringify(meta)}\n`;
    fs.appendFileSync(getLogPath(), entry);
  },
  error: (message: string, error: any) => {
    const entry = `[ERROR] ${new Date().toISOString()} - ${message} - ${error?.message || error}\n`;
    fs.appendFileSync(getLogPath(), entry);
  }
};

