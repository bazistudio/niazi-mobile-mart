const cron = require("node-cron");
const mainQueue = require("../queues/mainQueue");
const logger = require("../utils/logger");

/**
 * Backup Cron Jobs
 * Schedules background backup tasks via BullMQ.
 */

const initBackupCron = () => {
  // ── Daily Backup at 4:00 AM PKT ─────────────────────────────────────────────
  cron.schedule("0 4 * * *", async () => {
    logger.info("[CRON] Triggering Daily Backup...");
    await mainQueue.addJob('backup-db', { type: 'daily' });
  }, { timezone: "Asia/Karachi" });

  // ── Weekly Backup at 5:00 AM PKT on Sundays ─────────────────────────────────
  cron.schedule("0 5 * * 0", async () => {
    logger.info("[CRON] Triggering Weekly Backup...");
    await mainQueue.addJob('backup-db', { type: 'weekly' });
  }, { timezone: "Asia/Karachi" });

  // ── Monthly Backup at 6:00 AM PKT on 1st ────────────────────────────────────
  cron.schedule("0 6 1 * *", async () => {
    logger.info("[CRON] Triggering Monthly Backup...");
    await mainQueue.addJob('backup-db', { type: 'monthly' });
  }, { timezone: "Asia/Karachi" });

  console.log("Backup Automation cron jobs scheduled");
};

module.exports = initBackupCron;
