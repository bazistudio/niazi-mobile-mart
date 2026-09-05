/**
 * Niazi Mobile Mart - Business Management Authorization
 * Grants access to top-level business management roles.
 */
module.exports = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: No user context found",
    });
  }

  const managementRoles = ["SUPER_ADMIN", "OWNER", "MULTI_ADMIN", "ADMIN"];
  if (!managementRoles.includes(req.user.role) && !req.user.isSuperAdmin) {
    return res.status(403).json({
      success: false,
      message: "Forbidden: Management access required",
    });
  }

  next();
};