const Notification = require('../models/Notification');
const stockUtils = require('../utils/stockUtils');

exports.checkAndNotifyLowStock = async (product, shopId) => {
  const threshold = product.lowStockThreshold !== undefined ? product.lowStockThreshold : 5;

  if (stockUtils.isLowStock(product.quantity, threshold)) {
    const existing = await Notification.findOne({
      tenantId: product.tenantId,
      productId: product._id,
      type: "LOW_STOCK",
      isRead: false
    });

    if (!existing) {
      await Notification.create({
        type: "LOW_STOCK",
        message: `${product.name} stock is low`,
        shopId,
        tenantId: product.tenantId,
        productId: product._id
      });
    }
  }
};

exports.createSystemNotification = async ({ type, message, metadata = {} }) => {
  // System-level notifications (e.g. Super Admin dashboard)
  // These don't belong to a specific tenant/shop, or they belong to the central system
  await Notification.create({
    type,
    message,
    isSystem: true, // Assuming the model can handle this or just uses missing tenantId
    ...metadata
  });
};
