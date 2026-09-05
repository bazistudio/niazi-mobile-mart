// jobs/invoiceOverdue.job.js
// Runs daily at 2 AM — marks unpaid invoices overdue + suspends shops

const Invoice = require("../models/Invoice");
const Branch = require("../models/Branch");
const Organization = require("../models/Organization");
const logger = require("../utils/logger");
const { runAsOrganization } = require("../middleware/context/asyncContext");
const crypto = require("crypto");

module.exports = async () => {
  const jobId = crypto.randomUUID();
  logger.info("[CRON] invoiceOverdue — started", { jobId });

  try {
    const now = new Date();
    
    // Fetch all organizations bypassing tenantGuard just for this meta-query
    const organizations = await Organization.find({ status: { $ne: "suspended" } }).select("_id").setOptions({ skipTenantGuard: true }).lean();
    
    if (organizations.length === 0) {
      logger.info("[CRON] invoiceOverdue — no active organizations found");
      return;
    }

    let totalOverdueCount = 0;
    let totalSuspendedCount = 0;

    for (const org of organizations) {
      try {
        await runAsOrganization(org._id, { jobName: "invoiceOverdue", requestId: jobId }, async () => {
          // Find all pending invoices past their due date for THIS organization
          const overdueInvoices = await Invoice.find({
            status: "pending",
            dueDate: { $lt: now },
          });

          for (const invoice of overdueInvoices) {
            // Mark invoice as overdue
            invoice.status = "overdue";
            await invoice.save();
            totalOverdueCount++;

            // Suspend the branch for non-payment
            const updated = await Branch.findOneAndUpdate(
              { _id: invoice.branchId, status: "active", isDeleted: false },
              { status: "suspended" },
              { new: true }
            );

            if (updated) {
              totalSuspendedCount++;
              logger.warn("[CRON] invoiceOverdue — branch suspended for non-payment", {
                branchId: invoice.branchId,
                invoiceId: invoice._id,
                invoiceNumber: invoice.invoiceNumber,
                overdueSince: invoice.dueDate,
              });
            }
          }
        });
      } catch (orgError) {
        logger.error(`[CRON] invoiceOverdue — failed for organization ${org._id}`, { error: orgError.message });
        continue;
      }
    }

    logger.info("[CRON] invoiceOverdue — completed", {
      jobId,
      invoicesMarkedOverdue: totalOverdueCount,
      branchesSuspended: totalSuspendedCount,
    });
  } catch (error) {
    logger.error("[CRON] invoiceOverdue — failed globally", { error: error.message, jobId });
  }
};
