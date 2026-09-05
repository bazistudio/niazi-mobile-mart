import { net } from 'electron';
import { createBackup } from './backupEngine';
import { configStore } from './config';
import { db } from '../db/index';

export function initBackupScheduler() {
  // 1. Run on boot
  checkAndRunBackup();

  // 2. We can poll for online status or just rely on a timer every few hours to check if conditions are met
  // Since we don't have a reliable cross-platform 'online' event in main process without polling,
  // we can use a 1-hour interval to check conditions.
  setInterval(() => {
    checkAndRunBackup();
  }, 60 * 60 * 1000); // Check every hour
}

async function checkAndRunBackup() {
  const autoBackupEnabled = configStore.get('autoBackupEnabled');
  const backupPath = configStore.get('backupPath');
  
  if (!autoBackupEnabled || !backupPath) {
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const lastBackupDate = configStore.get('lastBackupDate');

  if (lastBackupDate === todayStr) {
    // Backup already created today
    return;
  }

  // Detect data changes: 
  // We can check if any operations happened today.
  // We'll query operation_log for the most recent timestamp.
  const stmt = db.prepare(`SELECT MAX(timestamp) as lastActivity FROM operation_log`);
  const result = stmt.get() as { lastActivity: number | null };
  
  if (!result.lastActivity) {
    // DB is empty, no changes
    return;
  }

  // Determine if lastActivity is after the start of today (or roughly since last backup)
  // For safety, we'll just check if lastActivity is not null and we haven't backed up today.
  // This guarantees we only backup if there's actual data.
  // In a more sophisticated setup, we could store `lastBackupTimestamp` and compare it to `lastActivity`.
  
  if (net.isOnline()) {
    console.log('[BackupScheduler] Conditions met, triggering auto-backup...');
    await createBackup();
  }
}
