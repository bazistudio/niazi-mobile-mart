// middleware/validate.js
// Generic validation middleware factory using express-validator

const { validationResult } = require("express-validator");

/**
 * Run after express-validator check() chains.
 * Returns 400 with all field errors if validation fails.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map((e) => ({
        field: e.path,
        message: e.msg,
      })),
    });
  }

  next();
};

module.exports = validate;
