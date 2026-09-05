// jobs/subscriptionExpiry.job.js
// Runs daily at 1 AM — expires subscriptions + suspends tenants

const Tenant = require("../models/Tenant");
const User = require("../models/User");
const logger = require("../utils/logger");
const { runAsOrganization } = require("../middleware/context/asyncContext");
const crypto = require("crypto");

module.exports = async () => {
  const jobId = crypto.randomUUID();
  logger.info("[CRON] subscriptionExpiry — started", { jobId });

  try {
    const now = new Date();

    // Find all active tenants whose subscriptionEnd has passed
    const expiredTenants = await Tenant.find({
      status: "active",
      subscriptionEnd: { $lt: now },
    }).lean(); // Tenant is on whitelist, so this is fine

    if (expiredTenants.length === 0) {
      logger.info("[CRON] subscriptionExpiry — no expired subscriptions found");
      return;
    }

    let suspendedCount = 0;

    for (const tenant of expiredTenants) {
      try {
        await runAsOrganization(tenant._id, { jobName: "subscriptionExpiry", requestId: jobId }, async () => {
          // Suspend the tenant document itself
          await Tenant.updateOne(
            { _id: tenant._id },
            { $set: { status: "suspended" } }
          );

          // Suspend all associated users
          await User.updateMany(
            { tenantId: tenant._id },
            { status: "suspended" }
          );

          suspendedCount++;
          logger.warn("[CRON] subscriptionExpiry — tenant suspended", {
            tenantId: tenant._id,
            expiredOn: tenant.subscriptionEnd,
          });
        });
      } catch (orgError) {
        logger.error(`[CRON] subscriptionExpiry — failed for tenant ${tenant._id}`, { error: orgError.message });
        continue;
      }
    }

    logger.info("[CRON] subscriptionExpiry — completed", {
      jobId,
      tenantsSuspended: suspendedCount,
    });
  } catch (error) {
    logger.error("[CRON] subscriptionExpiry — failed globally", { error: error.message, jobId });
  }
};
