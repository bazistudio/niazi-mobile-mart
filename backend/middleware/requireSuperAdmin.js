// middleware/requireSuperAdmin.js
// Must be used AFTER requireAuth (req.user already populated)

module.exports = (req, res, next) => {
  if (req.user?.role !== "superadmin") {
    return res.status(403).json({
      success: false,
      message: "Access denied: SuperAdmin only",
    });
  }
  next();
};
