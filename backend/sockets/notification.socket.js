const socketManager = require("./socketManager");

/**
 * Notification Socket Helper
 * Provides high-level methods for sending real-time updates.
 */

exports.notifyNewOrder = (tenantId, orderData) => {
  socketManager.toTenant(tenantId, "NEW_ORDER", {
    message: `New order received! Total: ${orderData.totalAmount}`,
    orderId: orderData._id,
    timestamp: new Date()
  });
};

exports.notifyPaymentSuccess = (tenantId, paymentData) => {
  socketManager.toTenant(tenantId, "PAYMENT_SUCCESS", {
    message: `Payment of ${paymentData.amount} received successfully.`,
    paymentId: paymentData._id,
    timestamp: new Date()
  });
};

exports.notifyLowStock = (tenantId, productData) => {
  socketManager.toTenant(tenantId, "LOW_STOCK_ALERT", {
    message: `Low stock alert for ${productData.name}! Only ${productData.stock} left.`,
    productId: productData._id,
    timestamp: new Date()
  });
};

exports.notifySystemAlert = (message) => {
  // Broadcast to all connected clients if necessary, or just superadmins
  socketManager.getIO().emit("SYSTEM_ALERT", { message, timestamp: new Date() });
};
