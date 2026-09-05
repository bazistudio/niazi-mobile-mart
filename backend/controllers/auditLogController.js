const AuditLogService = require('../services/auditLogService');

exports.getAuditLogs = async (req, res) => {
  try {
    const { action, entityType, page = 1, limit = 50 } = req.query;
    const query = {};

    if (action) query.action = action;
    if (entityType) query.entityType = entityType;
    
    // organizationId is automatically filtered by tenantIsolation middleware 
    // because req.orgContext injected the tenant context.

    const logs = await AuditLogService.getLogs(query, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.status(200).json({ success: true, ...logs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error fetching audit logs', error: error.message });
  }
};
