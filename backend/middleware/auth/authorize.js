/**
 * authorize middleware
 * Restricts access to a route based on user roles.
 * Must be used AFTER authenticate middleware.
 * 
 * @param {string[]} allowedRoles - Array of allowed role names (e.g., ["SUPER_ADMIN", "ORGANIZATION_OWNER"])
 */
const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required before authorization",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Requires one of these roles: [${allowedRoles.join(", ")}]`,
        error: "INSUFFICIENT_ROLE"
      });
    }

    next();
  };
};

module.exports = authorize;
