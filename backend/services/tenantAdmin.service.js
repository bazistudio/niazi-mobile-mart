const Tenant = require("../models/Tenant");
const User = require("../models/User");

/**
 * Approve tenant
 */
exports.approveTenant = async ({ tenantId, adminId }) => {
  const tenant = await Tenant.findById(tenantId);

  if (!tenant) throw new Error("Tenant not found");

  tenant.status = "active";
  tenant.approvedBy = adminId;
  tenant.approvedAt = new Date();

  await tenant.save();

  return tenant;
};

/**
 * Suspend tenant
 */
exports.suspendTenant = async ({ tenantId }) => {
  const tenant = await Tenant.findById(tenantId);

  if (!tenant) throw new Error("Tenant not found");

  tenant.status = "suspended";
  await tenant.save();

  // also suspend all users under tenant
  await User.updateMany(
    { tenantId },
    { status: "suspended" }
  );

  return tenant;
};