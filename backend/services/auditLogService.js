const { getTenantStore } = require('../middleware/context/asyncContext');

class AuditLogService {
  constructor(auditLogRepository) {
    this.auditLogRepository = auditLogRepository;
  }

  /**
   * Create an audit log entry.
   * Prefers explicit organizationId and shopId. Falls back to asyncContext for background jobs.
   */
  async log(data) {
    try {
      let { organizationId, shopId, userId, sessionId, requestId, ...rest } = data;
      
      const store = getTenantStore();
      if (store) {
        if (!organizationId) organizationId = store.organizationId || null;
        if (!shopId) shopId = store.shopId || null;
        if (!userId) userId = store.userId || null;
        if (!sessionId) sessionId = store.sessionId || null;
        if (!requestId) requestId = store.requestId || null;
      }
      
      const logEntry = await this.auditLogRepository.create({
        ...rest,
        organizationId,
        shopId,
        userId,
        sessionId,
        requestId
      });

      return logEntry;
    } catch (error) {
      console.error('AuditLogService - Failed to create audit log:', error);
      // We usually don't want audit logging failures to break the main application flow
    }
  }

  async getLogs(query, pagination = { page: 1, limit: 50 }) {
    try {
      const options = {
        ...pagination,
        sort: { createdAt: -1 },
        populate: { path: 'userId', select: 'name email' }
      };

      const result = await this.auditLogRepository.paginate(query, options);
      
      return {
        data: result.data,
        pagination: result.metadata
      };
    } catch (error) {
      console.error('AuditLogService - Failed to fetch logs:', error);
      throw error;
    }
  }
}

module.exports = AuditLogService;
