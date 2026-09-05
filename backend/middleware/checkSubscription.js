// middleware/checkSubscription.js
// Fix 4 — Block expired/suspended shops from accessing protected routes

const Subscription = require("../models/Subscription");

module.exports = async (req, res, next) => {
  try {
    const shopId = req.user?.shopId;

    if (!shopId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: no shop context",
      });
    }

    const subscription = await Subscription.findOne({
      shopId,
      status: "active",
    });

    if (!subscription) {
      return res.status(403).json({
        success: false,
        message: "Subscription expired or not found. Please renew your plan.",
      });
    }

    // Check if subscription has passed its endDate (double-guard before cron runs)
    if (subscription.endDate < new Date()) {
      subscription.status = "expired";
      await subscription.save();

      return res.status(403).json({
        success: false,
        message: "Subscription has expired. Please renew your plan.",
      });
    }

    // Attach subscription to req for downstream use if needed
    req.subscription = subscription;

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Subscription check failed",
      error: error.message,
    });
  }
};
