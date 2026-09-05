const AuditLog = require('../models/AuditLog');

/**
 * Log an action to the audit trail
 * @param {Object} params - Audit parameters
 * @param {string} params.userId - ID of the user performing the action
 * @param {string} params.tenantId - ID of the tenant
 * @param {string} params.action - Action performed (e.g., 'CREATE', 'UPDATE', 'DELETE')
 * @param {string} params.resource - Resource affected (e.g., 'ORDER', 'PRODUCT')
 * @param {string} [params.resourceId] - ID of the specific resource instance
 * @param {Object} [params.changes] - Before and after state
 * @param {Object} [params.metadata] - Additional info (e.g., ip, userAgent)
 * @param {Object} [session] - Mongoose session for transaction
 */
exports.logAction = async (params, session = null) => {
  try {
    const log = new AuditLog({
      userId: params.userId,
      tenantId: params.tenantId,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      changes: params.changes || {},
      metadata: params.metadata || {},
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    if (session) {
      return await log.save({ session });
    }
    return await log.save();
  } catch (error) {
    console.error('Audit Logging Error:', error);
    // We don't want to crash the main process if logging fails, 
    // but in a strict ERP, we might want to.
  }
};
