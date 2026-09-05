const { AppError } = require("../utils/errors");

/**
 * Middleware to restrict access based on Organization accountType
 * @param {string[]} allowedTypes - Array of allowed account types, e.g. ['ORGANIZATION']
 */
const requireAccountType = (allowedTypes) => {
  return (req, res, next) => {
    // Super admins can bypass account type restrictions
    if (req.user && req.user.isSuperAdmin) {
      return next();
    }

    if (!req.accountType) {
      return next(new AppError("Organization account type is not defined in context", 403));
    }

    if (!allowedTypes.includes(req.accountType)) {
      return next(new AppError(`Access denied for ${req.accountType} account type`, 403));
    }

    next();
  };
};

module.exports = requireAccountType;
