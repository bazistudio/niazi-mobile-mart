// jobs/usageReset.job.js
// Runs 1st of every month at 3 AM — resets per-service usage counters

const UsageLog = require("../models/UsageLog");
const Organization = require("../models/Organization");
const logger = require("../utils/logger");
const { runAsOrganization } = require("../middleware/context/asyncContext");
const crypto = require("crypto");

module.exports = async () => {
  const jobId = crypto.randomUUID();
  logger.info("[CRON] usageReset — started", { jobId });

  try {
    // Get start of current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const organizations = await Organization.find({ status: { $ne: "suspended" } }).select("_id").setOptions({ skipTenantGuard: true }).lean();

    if (organizations.length === 0) {
      logger.info("[CRON] usageReset — no active organizations found");
      return;
    }

    let totalArchivedLogs = 0;
    let totalActiveLogsThisCycle = 0;

    for (const org of organizations) {
      try {
        await runAsOrganization(org._id, { jobName: "usageReset", requestId: jobId }, async () => {
          // Count logs from the current billing cycle
          const logsThisCycle = await UsageLog.countDocuments({
            billingDate: { $gte: startOfMonth },
          });

          // Mark all usage logs before this month as archived (preserves history)
          const result = await UsageLog.updateMany(
            {
              billingDate: { $lt: startOfMonth },
              archived: { $ne: true },
            },
            { $set: { archived: true } }
          );

          totalActiveLogsThisCycle += logsThisCycle;
          totalArchivedLogs += result.modifiedCount;
        });
      } catch (orgError) {
        logger.error(`[CRON] usageReset — failed for organization ${org._id}`, { error: orgError.message });
        continue;
      }
    }

    logger.info("[CRON] usageReset — completed", {
      jobId,
      archivedLogs: totalArchivedLogs,
      activeLogsThisCycle: totalActiveLogsThisCycle,
      resetMonth: startOfMonth.toISOString().slice(0, 7),
    });
  } catch (error) {
    logger.error("[CRON] usageReset — failed globally", { error: error.message, jobId });
  }
};
