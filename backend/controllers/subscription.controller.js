// controllers/subscription.controller.js

const { subscriptionService } = require("../container");

// ─── @desc    Create / Subscribe to a plan
// ─── @route   POST /api/subscriptions/subscribe
// ─── @access  Private
exports.subscribe = async (req, res) => {
  try {
    const { planId } = req.body;
    const shopId = req.user.shopId;

    if (!planId) {
      return res.status(400).json({ success: false, message: "planId is required" });
    }

    const result = await subscriptionService.createSubscription({ shopId, planId });

    return res.status(201).json({
      success: true,
      message: "Subscription created successfully",
      data: result,
    });
  } catch (error) {
    const status = error.message === "Plan not found or inactive" ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

// ─── @desc    Renew current subscription
// ─── @route   POST /api/subscriptions/renew/:id
// ─── @access  Private
exports.renew = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await subscriptionService.renewSubscription(id);

    return res.status(200).json({
      success: true,
      message: "Subscription renewed successfully",
      data: result,
    });
  } catch (error) {
    const status = error.message === "Subscription not found" ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

// ─── @desc    Suspend a subscription
// ─── @route   PATCH /api/subscriptions/suspend/:id
// ─── @access  Private (superadmin)
exports.suspend = async (req, res) => {
  try {
    const { id } = req.params;

    const subscription = await subscriptionService.suspendSubscription(id);

    return res.status(200).json({
      success: true,
      message: "Subscription suspended",
      data: subscription,
    });
  } catch (error) {
    const status = error.message === "Subscription not found" ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

// ─── @desc    Get active subscription for the logged-in shop
// ─── @route   GET /api/subscriptions/active
// ─── @access  Private
exports.getActive = async (req, res) => {
  try {
    const shopId = req.user.shopId;

    const subscription = await subscriptionService.getActiveSubscription(shopId);

    if (!subscription) {
      return res.status(404).json({ success: false, message: "No active subscription found" });
    }

    return res.status(200).json({
      success: true,
      message: "Active subscription fetched",
      data: subscription,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── @desc    Get full subscription history for a shop
// ─── @route   GET /api/subscriptions/history
// ─── @access  Private
exports.getHistory = async (req, res) => {
  try {
    const shopId = req.user.shopId;

    const subscriptions = await subscriptionService.getSubscriptionHistory(shopId);

    return res.status(200).json({
      success: true,
      message: "Subscription history fetched",
      data: subscriptions,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── @desc    Run cron job to expire overdue subscriptions (internal/admin)
// ─── @route   POST /api/subscriptions/expire-overdue
// ─── @access  Private (superadmin)
exports.expireOverdue = async (req, res) => {
  try {
    const count = await subscriptionService.expireOverdueSubscriptions();

    return res.status(200).json({
      success: true,
      message: `${count} subscription(s) marked as expired`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
