// middleware/role.js
// Role-Based Access Control (RBAC)
// Usage: router.get("/admin", auth, role("superadmin"), handler)
//        router.get("/staff", auth, role("superadmin", "admin", "staff"), handler)

/**
 * @param  {...string} allowedRoles - roles permitted to access the route
 * @returns Express middleware
 *
 * Role hierarchy reference:
 *   SUPER_ADMIN       → full system access (all shops, billing, plans)
 *   ADMIN             → shop owner / admin (manages their shop)
 *   MANAGER           → store manager
 *   CASHIER           → POS operator
 *   STAFF             → general staff member
 */
module.exports = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: authentication required",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied: requires one of [${allowedRoles.join(", ")}]`,
      });
    }

    next();
  };
};
