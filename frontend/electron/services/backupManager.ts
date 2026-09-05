import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { db, closeDb, getDb } from '../db/index';
import { configStore } from './config';
import { app, net, shell } from 'electron';
import { logger } from '../logger';
import { showNotification } from '../notifications';

// --------------------------------------------------------------------------
// Core Backup Operations
// --------------------------------------------------------------------------

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

    const tempDbPath = path.join(app.getPath('temp'), `temp_backup_${dateStr}.db`);
    
    // Backup safely via better-sqlite3 API
    await getDb().backup(tempDbPath);

    // Compress
    const source = fs.createReadStream(tempDbPath);
    const destination = fs.createWriteStream(destinationFile);
    const gzip = zlib.createGzip();
    await pipeline(source, gzip, destination);

    // Cleanup
    fs.unlinkSync(tempDbPath);

    const todayStr = new Date().toISOString().split('T')[0];
    configStore.set('lastBackupDate', todayStr);

    cleanupOldBackups(backupPath);

    logger.info(`[BackupManager] Backup completed successfully: ${destinationFile}`);
    showNotification('Backup Complete', 'Your database has been safely backed up.');
    
    return { success: true, message: 'Backup completed successfully', backupFile: destinationFile };
  } catch (error: any) {
    logger.error('[BackupManager] Backup failed:', error);
    return { success: false, message: error.message || 'Backup failed' };
  }
}

export function cleanupOldBackups(backupPath: string) {
  try {
    const files = fs.readdirSync(backupPath)
      .filter(f => f.startsWith('tijarat_backup_') && f.endsWith('.db.gz'))
      .map(f => ({ name: f, time: fs.statSync(path.join(backupPath, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time); // newest first

    if (files.length > 30) {
      const toDelete = files.slice(30);
      for (const file of toDelete) {
        fs.unlinkSync(path.join(backupPath, file.name));
      }
    }
  } catch (err) {
    logger.error('[BackupManager] Failed to cleanup old backups:', err);
  }
}

export function openBackupFolder() {
  const backupPath = configStore.get('backupPath');
  if (backupPath && fs.existsSync(backupPath)) {
    shell.openPath(backupPath);
  } else {
    logger.warn('[BackupManager] Backup folder not found or not configured.');
  }
}

// --------------------------------------------------------------------------
// Restore Operation
// --------------------------------------------------------------------------

export async function restoreDatabase(backupFilePath: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!fs.existsSync(backupFilePath)) {
      return { success: false, message: 'Backup file does not exist' };
    }

    const userDataPath = app.getPath('userData');
    const currentDbPath = path.join(userDataPath, 'tijarat_local.db');
    const preRestorePath = path.join(userDataPath, 'tijarat_local.db.pre-restore');
    const extractedTempPath = path.join(app.getPath('temp'), `restore_temp_${Date.now()}.db`);

    // Extract
    const source = fs.createReadStream(backupFilePath);
    const destination = fs.createWriteStream(extractedTempPath);
    const gunzip = zlib.createGunzip();
    await pipeline(source, gunzip, destination);

    const stat = fs.statSync(extractedTempPath);
    if (stat.size === 0) {
      fs.unlinkSync(extractedTempPath);
      throw new Error("Extracted database is empty or corrupted.");
    }

    // Close DB
    closeDb();

    // Create pre-restore safety copy
    if (fs.existsSync(currentDbPath)) {
      if (fs.existsSync(preRestorePath)) fs.unlinkSync(preRestorePath);
      fs.renameSync(currentDbPath, preRestorePath);
    }

    try {
      fs.copyFileSync(extractedTempPath, currentDbPath);
      fs.unlinkSync(extractedTempPath);
      
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 1000);

      return { success: true, message: 'Restore successful. Restarting application...' };
    } catch (restoreError: any) {
      logger.error('[BackupManager] Failed to copy restored DB, attempting rollback...', restoreError);
      if (fs.existsSync(preRestorePath)) {
        fs.renameSync(preRestorePath, currentDbPath);
      }
      return { success: false, message: 'Restore failed, rolled back to previous state. ' + restoreError.message };
    }
  } catch (error: any) {
    logger.error('[BackupManager] Restore sequence failed:', error);
    return { success: false, message: error.message || 'Restore sequence failed' };
  }
}

// --------------------------------------------------------------------------
// Startup Snapshot (From db/index.ts)
// --------------------------------------------------------------------------

export function createStartupSnapshot(dbPath: string) {
  if (fs.existsSync(dbPath)) {
    try {
      const backupDir = path.join(app.getPath('userData'), 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `tijarat_local_${timestamp}.db.backup`);
      fs.copyFileSync(dbPath, backupPath);
      logger.info(`[BackupManager] Startup snapshot created at ${backupPath}`);
      
      const backups = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('tijarat_local_') && f.endsWith('.db.backup'))
        .sort();
        
      if (backups.length > 5) {
        for (let i = 0; i < backups.length - 5; i++) {
          fs.unlinkSync(path.join(backupDir, backups[i]));
        }
      }
    } catch (err) {
      logger.error('[BackupManager] Failed to create database startup snapshot:', err);
    }
  }
}

// --------------------------------------------------------------------------
// Scheduler
// --------------------------------------------------------------------------

export function initBackupScheduler() {
  checkAndRunBackup();
  setInterval(() => {
    checkAndRunBackup();
  }, 60 * 60 * 1000);
}

async function checkAndRunBackup() {
  const autoBackupEnabled = configStore.get('autoBackupEnabled');
  const backupPath = configStore.get('backupPath');
  
  if (!autoBackupEnabled || !backupPath) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const lastBackupDate = configStore.get('lastBackupDate');

  if (lastBackupDate === todayStr) return;

  try {
    const stmt = getDb().prepare(`SELECT MAX(timestamp) as lastActivity FROM operation_log`);
    const result = stmt.get() as { lastActivity: number | null };
    
    if (!result || !result.lastActivity) return;

    if (net.isOnline()) {
      logger.info('[BackupManager] Conditions met, triggering auto-backup...');
      await createBackup();
    }
  } catch (err) {
    logger.error('[BackupManager] Scheduler failed to check DB:', err);
  }
}

export function getBackupStatus() {
  return {
    backupPath: configStore.get('backupPath'),
    lastBackupDate: configStore.get('lastBackupDate'),
    autoBackupEnabled: configStore.get('autoBackupEnabled')
  };
}
