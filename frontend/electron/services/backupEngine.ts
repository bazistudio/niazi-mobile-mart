import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { db } from '../db/index';
import { configStore } from './config';
import { app } from 'electron';

export async function createBackup(): Promise<{ success: boolean; message: string; backupFile?: string }> {
  try {
    const backupPath = configStore.get('backupPath');
    if (!backupPath) {
      return { success: false, message: 'Backup path not configured' };
    }

    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `tijarat_backup_${dateStr}.db.gz`;
    const destinationFile = path.join(backupPath, backupFileName);

    // 1. We must safely copy the DB. better-sqlite3 provides a .backup() method
    // which handles SQLite locks and WAL safely. We backup to a temp file, compress it, then delete.
    const tempDbPath = path.join(app.getPath('temp'), `temp_backup_${dateStr}.db`);
    
    await db.backup(tempDbPath);

    // 2. Compress the temp backup file
    const source = fs.createReadStream(tempDbPath);
    const destination = fs.createWriteStream(destinationFile);
    const gzip = zlib.createGzip();

    await pipeline(source, gzip, destination);

    // 3. Cleanup temp file
    fs.unlinkSync(tempDbPath);

    // 4. Update last backup date
    const todayStr = new Date().toISOString().split('T')[0];
    configStore.set('lastBackupDate', todayStr);

    // 5. Cleanup old backups (keep last 30)
    cleanupOldBackups(backupPath);

    return { success: true, message: 'Backup completed successfully', backupFile: destinationFile };
  } catch (error: any) {
    console.error('Backup failed:', error);
    return { success: false, message: error.message || 'Backup failed' };
  }
}

function cleanupOldBackups(backupPath: string) {
  try {
    const files = fs.readdirSync(backupPath)
      .filter(f => f.startsWith('tijarat_backup_') && f.endsWith('.db.gz'))
      .map(f => ({ name: f, time: fs.statSync(path.join(backupPath, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time); // newest first

    // Keep the first 30, delete the rest
    if (files.length > 30) {
      const toDelete = files.slice(30);
      for (const file of toDelete) {
        fs.unlinkSync(path.join(backupPath, file.name));
      }
    }
  } catch (err) {
    console.error('Failed to cleanup old backups:', err);
  }
}

export function getBackupStatus() {
  return {
    backupPath: configStore.get('backupPath'),
    lastBackupDate: configStore.get('lastBackupDate'),
    autoBackupEnabled: configStore.get('autoBackupEnabled')
  };
}
