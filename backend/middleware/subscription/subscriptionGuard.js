const Organization = require("../../models/Organization");
const Subscription = require("../../models/Subscription");

/**
 * Checks if the organization has an active or trial subscription.
 * Blocks requests if expired or suspended.
 * Should ONLY be applied to new (SaaS) routes initially.
 */
const subscriptionGuard = async (req, res, next) => {
  try {
    // 1. SUPER_ADMIN bypass
    if (req.user && req.user.role === "SUPER_ADMIN") {
      return next(); 
    }

    const orgId = req.context?.organizationId;
    
    if (!orgId) {
      return res.status(400).json({ 
        success: false, 
        message: "Organization context missing for subscription check" 
      });
    }

    // 2. Org exists? (Optimized query without populate)
    const org = await Organization.findById(orgId).select("currentSubscriptionId");

    // 3. Secure legacy bypass
    if (!org) {
       // Only allow bypass for legacy API routes if the organization doesn't exist
       // Adjust the route check based on actual legacy API patterns
       const isLegacyRoute = req.originalUrl.includes("/api/") && !req.originalUrl.includes("/organization/") && !req.originalUrl.includes("/super-admin/");
       if (isLegacyRoute) {
          return next();
       }
       return res.status(403).json({
          success: false,
          message: "Organization not found."
       });
    }

    if (!org.currentSubscriptionId) {
      return res.status(403).json({
        success: false,
        message: "No active subscription found for this organization.",
        error: "NO_SUBSCRIPTION"
      });
    }

    // 4. Subscription exists?
    const subscription = await Subscription.findById(org.currentSubscriptionId).select("status expiresAt plan");

    if (!subscription) {
      return res.status(403).json({
        success: false,
        message: "Subscription record missing.",
        error: "NO_SUBSCRIPTION"
      });
    }

    // 5. Expired by DATE? (Date always beats status)
    if (subscription.expiresAt) {
      const now = new Date();
      const graceDays = 3;
      const graceDate = new Date(subscription.expiresAt);
      graceDate.setDate(graceDate.getDate() + graceDays);

      if (now > graceDate) {
        // Automatically update status to EXPIRED if it isn't already
        if (subscription.status !== "EXPIRED") {
          await Subscription.findByIdAndUpdate(subscription._id, { status: "EXPIRED" });
        }
        return res.status(403).json({
          success: false,
          message: "Subscription expired. Grace period ended.",
          error: "SUBSCRIPTION_EXPIRED"
        });
      }
    }

    // 6. Status valid? (Strict uppercase check)
    if (subscription.status === "SUSPENDED") {
      return res.status(403).json({
        success: false,
        message: "Your organization account has been suspended.",
        error: "ACCOUNT_SUSPENDED"
      });
    }

    if (subscription.status === "EXPIRED") {
      return res.status(403).json({
        success: false,
        message: "Your subscription has expired. Please renew to continue.",
        error: "SUBSCRIPTION_EXPIRED"
      });
    }

    // Allow ACTIVE, TRIAL, PENDING (e.g. pending manual payment verification but within grace)
    if (["ACTIVE", "TRIAL", "PENDING"].includes(subscription.status)) {
       return next();
    }

    return res.status(403).json({
      success: false,
      message: "Invalid subscription status.",
      error: "INVALID_SUBSCRIPTION"
    });

  } catch (error) {
    console.error("Subscription Guard Error:", error);
    res.status(500).json({ success: false, message: "Subscription validation failed" });
  }
};

module.exports = subscriptionGuard;
