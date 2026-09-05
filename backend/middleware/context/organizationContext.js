const Branch = require('../../models/Branch');
const Organization = require("../../models/Organization");

/**
 * Resolves the active organization and shop context for the request.
 * Falls back to legacy tenantId for backward compatibility.
 * Validates that the requested shop belongs to the organization.
 */
const organizationContext = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    let organizationId = req.user.organizationId || req.user.tenantId; // Fallback to tenantId
    let activeShopId = req.headers["x-shop-id"] || req.user.shopId;
    let industryType = "GENERAL_STORE";

    // 1. Resolve Organization
    if (organizationId) {
      const org = await Organization.findById(organizationId).select("industryType status");
      if (org) {
        industryType = org.industryType;
      }
    } else if (req.user.tenantId) {
       // Legacy fallback: if User has tenantId but no organizationId yet.
       organizationId = req.user.tenantId;
    }

    // 2. Validate Branch context if provided
    if (activeShopId) {
      const shop = await Branch.findById(activeShopId).select("organizationId tenantId");
      
      if (!shop) {
        return res.status(404).json({ success: false, message: "Branch context not found" });
      }

      // Ensure the shop actually belongs to the user's organization/tenant
      const shopOrgId = shop.organizationId ? shop.organizationId.toString() : null;
      const shopTenantId = shop.tenantId ? shop.tenantId.toString() : null;
      const userOrgIdStr = organizationId ? organizationId.toString() : null;

      if (shopOrgId !== userOrgIdStr && shopTenantId !== userOrgIdStr && req.user.role !== "SUPER_ADMIN") {
        return res.status(403).json({ 
          success: false, 
          message: "Forbidden: Branch does not belong to your organization" 
        });
      }
    }

    // 3. Attach safe context
    req.context = {
      organizationId,
      activeShopId,
      industryType
    };

    next();
  } catch (error) {
    console.error("Organization Context Error:", error);
    res.status(500).json({ success: false, message: "Failed to resolve organization context" });
  }
};

module.exports = organizationContext;
