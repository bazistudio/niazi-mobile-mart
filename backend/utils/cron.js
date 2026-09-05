// utils/cron.js
// Automation controller — registers all scheduled jobs
// Called once on server start: require("./utils/cron")()

const cron = require("node-cron");
const logger = require("./logger");

const invoiceOverdueJob = require("../jobs/invoiceOverdue.job");
const usageResetJob = require("../jobs/usageReset.job");
const initBackupCron = require("../cron/backup.cron");
const initSubscriptionCron = require("../cron/subscriptionCron");
const { reconcileCustomerBalances } = require('../services/ledgerReconciliationService');

module.exports = () => {
  // Initialize new Subscription Domain Cron
  initSubscriptionCron();

  // ── Daily at 2:00 AM — mark overdue invoices + suspend shops ───────────────
  cron.schedule("0 2 * * *", async () => {
    await invoiceOverdueJob();
  }, { timezone: "Asia/Karachi" });

  // ── 1st of every month at 3:00 AM — archive usage logs ────────────────────
  cron.schedule("0 3 1 * *", async () => {
    await usageResetJob();
  }, { timezone: "Asia/Karachi" });

  // ── Daily at 4:00 AM — mathematical ledger reconciliation ──────────────────
  cron.schedule("0 4 * * *", async () => {
    try {
      await reconcileCustomerBalances();
      const { reconcileInventory, tripleMatchOrders } = require('../services/ledgerReconciliationService');
      await reconcileInventory();
      await tripleMatchOrders();
    } catch (error) {
      logger.error('Scheduled Task Failed: Ledger Reconciliation', { error: error.message });
    }
  }, { timezone: "Asia/Karachi" });

  // ── Backup Automation ──────────────────────────────────────────────────────
  initBackupCron();

  logger.info("[CRON] All scheduled jobs registered", {
    subscriptionExpiry: "0 1 * * * (daily @ 1 AM PKT)",
    invoiceOverdue:     "0 2 * * * (daily @ 2 AM PKT)",
    usageReset:         "0 3 1 * * (monthly @ 3 AM PKT on 1st)",
  });
};
