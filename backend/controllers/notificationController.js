const Notification = require("../models/Notification");

// @desc    Get active unread notifications natively
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const limit = parseInt(req.query.limit) || 10;

    const notifications = await Notification.find({ tenantId: req.tenantId, isRead: false })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Map output gracefully to V1 Dashboard constraints
    const output = notifications.map(n => ({
      id: n._id,
      type: n.type,
      message: n.message,
      read: n.isRead,
      productId: n.productId,
      createdAt: n.createdAt
    }));

    res.status(200).json(output);
  } catch (error) {
    console.error("Notifications Fetch Error:", error);
    res.status(500).json({ message: "Error fetching notifications" });
  }
};
