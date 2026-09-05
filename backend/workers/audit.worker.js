const eventBus = require("../core/events/eventBus");
const EVENTS = require("../core/events/eventTypes");
const mainQueue = require("../queues/mainQueue");

/**
 * Audit Worker
 * Listens for system events and dispatches them to the persistent background queue for logging.
 */

async function handleAuditAction(payload, action, resource) {
  try {
    await mainQueue.addJob('log-audit', {
      userId: payload.userId,
      tenantId: payload.tenantId,
      action: action,
      resource: resource,
      resourceId: payload.resourceId || payload.userId, // fallback
      changes: payload.changes || null,
      metadata: {
        ...payload.metadata,
        eventId: payload.eventId,
        timestamp: payload.timestamp
      }
    });
  } catch (error) {
    console.error(`Failed to queue audit log for ${action}:`, error);
  }
}

// Subscribe to events
eventBus.subscribe(EVENTS.USER_REGISTERED, (payload) => {
  handleAuditAction(payload, 'REGISTER', 'User');
});

eventBus.subscribe(EVENTS.USER_LOGGED_IN, (payload) => {
  handleAuditAction(payload, 'LOGIN', 'User');
});

eventBus.subscribe(EVENTS.PAYMENT_COMPLETED, (payload) => {
  handleAuditAction(payload, 'PAYMENT', 'Order');
});

eventBus.subscribe(EVENTS.DATA_DELETED, (payload) => {
  handleAuditAction(payload, 'DELETE', payload.resource);
});

eventBus.subscribe(EVENTS.SETTINGS_UPDATED, (payload) => {
  handleAuditAction(payload, 'UPDATE', 'Settings');
});
