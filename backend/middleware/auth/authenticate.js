const jwt = require("jsonwebtoken");
const User = require("../../models/User");

/**
 * Validates JWT, extracts user, and attaches to req.user.
 * Does not restrict routes by role or tenant.
 */
const authenticate = async (req, res, next) => {
  try {
    let token = null;
    const header = req.headers.authorization;

    if (header && header.startsWith("Bearer ")) {
      token = header.split(" ")[1];
    } else if (req.cookies && req.cookies.tp_token) {
      token = req.cookies.tp_token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: no token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded._id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: user not found",
      });
    }

    // Attach structured user context
    const contextId = user.organizationId || user.tenantId;
    
    req.user = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      shopId: user.shopId, // May be null for SUPER_ADMIN or ORGANIZATION_OWNER without specific shop focus
      tenantId: contextId, // Legacy backward compatibility
      organizationId: contextId // New SaaS structure
    };

    req.tenantId = contextId;
    req.organizationId = contextId;

    const { tenantContext } = require('../../middleware/context/asyncContext');
    const store = {
      organizationId: contextId,
      userId: user._id
    };

    tenantContext.run(store, () => {
      next();
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Unauthorized: invalid token",
    });
  }
};

module.exports = authenticate;
