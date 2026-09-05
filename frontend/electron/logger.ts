import log from 'electron-log';
import { app } from 'electron';
import path from 'path';

import fs from 'fs';

// Configure logging
const isDev = !app.isPackaged;

log.transports.file.level = isDev ? 'debug' : 'info';
log.transports.console.level = isDev ? 'debug' : false; // Disable console logging in production

// Set rolling log size to 1MB
log.transports.file.maxSize = 1048576; 

// Ensure logs are saved in userData/logs
const logPath = path.join(app.getPath('userData'), 'logs', 'main.log');
try {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
} catch (e) {}

log.transports.file.resolvePathFn = () => logPath;

export const logger = log;
