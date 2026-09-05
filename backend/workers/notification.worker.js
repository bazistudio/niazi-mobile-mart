const eventBus = require("../core/events/eventBus");
const EVENTS = require("../core/events/eventTypes");
const notificationSocket = require("../sockets/notification.socket");

/**
 * Notification Worker
 * Listens to the Event Bus and triggers real-time WebSocket notifications.
 */

// Handle new orders
eventBus.subscribe(EVENTS.ORDER_CREATED, (payload) => {
  console.log(`[NOTIF] Triggering real-time update for NEW_ORDER in tenant: ${payload.tenantId}`);
  notificationSocket.notifyNewOrder(payload.tenantId, payload);
});

// Handle payments
eventBus.subscribe(EVENTS.PAYMENT_COMPLETED, (payload) => {
  console.log(`[NOTIF] Triggering real-time update for PAYMENT_SUCCESS in tenant: ${payload.tenantId}`);
  notificationSocket.notifyPaymentSuccess(payload.tenantId, payload);
});

// Handle low stock (example - would be triggered by inventory service)
// eventBus.subscribe(EVENTS.LOW_STOCK_DETECTED, (payload) => {
//   notificationSocket.notifyLowStock(payload.tenantId, payload);
// });

// Handle new user registrations (optional - notify admins)
eventBus.subscribe(EVENTS.USER_REGISTERED, (payload) => {
  notificationSocket.notifySystemAlert(`New user registered: ${payload.email}`);
});
