import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { app } from 'electron';
import { db } from '../db/index';

export async function restoreDatabase(backupFilePath: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!fs.existsSync(backupFilePath)) {
      return { success: false, message: 'Backup file does not exist' };
    }

    const userDataPath = app.getPath('userData');
    const currentDbPath = path.join(userDataPath, 'tijarat_local.db');
    const preRestorePath = path.join(userDataPath, 'tijarat_local.db.pre-restore');
    const extractedTempPath = path.join(app.getPath('temp'), `restore_temp_${Date.now()}.db`);

    // 1. Extract the gzip backup to a temp file
    const source = fs.createReadStream(backupFilePath);
    const destination = fs.createWriteStream(extractedTempPath);
    const gunzip = zlib.createGunzip();
    await pipeline(source, gunzip, destination);

    // 2. Validate the extracted file is a valid sqlite db (optional simple check: size > 0)
    const stat = fs.statSync(extractedTempPath);
    if (stat.size === 0) {
      fs.unlinkSync(extractedTempPath);
      throw new Error("Extracted database is empty or corrupted.");
    }

    // 3. Close current DB connection safely
    try {
      db.close();
    } catch (e) {
      console.warn("Error closing DB during restore:", e);
    }

    // 4. Create pre-restore safety copy
    if (fs.existsSync(currentDbPath)) {
      if (fs.existsSync(preRestorePath)) {
        fs.unlinkSync(preRestorePath);
      }
      fs.renameSync(currentDbPath, preRestorePath);
    }

    // 5. Move the extracted db into place
    try {
      fs.copyFileSync(extractedTempPath, currentDbPath);
      // Cleanup temp
      fs.unlinkSync(extractedTempPath);
      
      // Request an app restart so the DB is reopened cleanly
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 1000);

      return { success: true, message: 'Restore successful. Restarting application...' };
    } catch (restoreError: any) {
      console.error('Failed to copy restored DB, attempting rollback...', restoreError);
      // Rollback
      if (fs.existsSync(preRestorePath)) {
        fs.renameSync(preRestorePath, currentDbPath);
      }
      return { success: false, message: 'Restore failed, rolled back to previous state. ' + restoreError.message };
    }
  } catch (error: any) {
    console.error('Restore sequence failed:', error);
    return { success: false, message: error.message || 'Restore sequence failed' };
  }
}
