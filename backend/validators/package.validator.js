const { body } = require("express-validator");

exports.createPackageRules = [
  body("name").trim().notEmpty().withMessage("Package name is required"),
  body("code").trim().notEmpty().withMessage("Code is required").isUppercase().withMessage("Code must be uppercase"),
  body("durationType").isIn(["DAYS", "MONTHS", "YEARS"]).withMessage("Invalid durationType"),
  body("durationValue").isInt({ min: 1 }).withMessage("durationValue must be at least 1"),
  body("maxBranches").optional().isInt({ min: 0 }),
  body("maxUsers").optional().isInt({ min: 0 }),
  body("maxProducts").optional().isInt({ min: 0 }),
  body("storageLimit").optional().isInt({ min: 0 }),
  body("price").optional().isNumeric(),
  body("trialEnabled").optional().isBoolean(),
  body("trialDays").optional().isInt({ min: 0 }),
  body("enabledModules").optional().isArray(),
  body("description").optional().isString(),
  body("status").optional().isIn(["ACTIVE", "INACTIVE"])
];

exports.updatePackageRules = [
  body("name").optional().trim().notEmpty(),
  body("durationType").optional().isIn(["DAYS", "MONTHS", "YEARS"]),
  body("durationValue").optional().isInt({ min: 1 }),
  body("status").optional().isIn(["ACTIVE", "INACTIVE"]),
  body("maxBranches").optional().isInt({ min: 0 }),
  body("maxUsers").optional().isInt({ min: 0 }),
  body("maxProducts").optional().isInt({ min: 0 }),
  body("storageLimit").optional().isInt({ min: 0 }),
  body("price").optional().isNumeric(),
  body("trialEnabled").optional().isBoolean(),
  body("trialDays").optional().isInt({ min: 0 }),
  body("enabledModules").optional().isArray(),
  body("description").optional().isString()
];
