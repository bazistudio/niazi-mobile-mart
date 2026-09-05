const { body } = require("express-validator");

exports.createSubscriptionRules = [
  body("ownerType").isIn(["ORGANIZATION", "SHOP"]).withMessage("Invalid ownerType"),
  body("ownerId").isString().trim().notEmpty().withMessage("ownerId must be a valid ID"),
  body("packageId").isString().trim().notEmpty().withMessage("packageId must be a valid ID"),
  body("subscriptionPrice").isFloat({ min: 0 }).withMessage("subscriptionPrice must be a positive number"),
];

exports.renewSubscriptionRules = [
  body("packageId").isString().trim().notEmpty().withMessage("packageId must be a valid ID"),
  body("discountType").optional().isIn(["FIXED", "PERCENTAGE"]).withMessage("Invalid discountType"),
  body("discountValue").optional().isFloat({ min: 0 }).withMessage("discountValue must be a positive number"),
  body("notes").optional().isString()
];

exports.suspendSubscriptionRules = [
  body("reason").trim().notEmpty().withMessage("Reason for suspension is required"),
];

exports.paymentRequestRules = [
  body("ownerType").isIn(["ORGANIZATION", "SHOP"]).withMessage("Invalid ownerType"),
  body("ownerId").isString().trim().notEmpty().withMessage("ownerId must be a valid ID"),
  body("packageId").isString().trim().notEmpty().withMessage("packageId must be a valid ID"),
  body("amount").isFloat({ min: 0 }).withMessage("amount must be a positive number"),
  body("paymentMethod").notEmpty().withMessage("paymentMethod is required"),
  body("transactionId").notEmpty().withMessage("transactionId is required"),
];

exports.customizeSubscriptionRules = [
  body("subscriptionPrice").optional().isFloat({ min: 0 }).withMessage("subscriptionPrice must be a positive number"),
  body("durationType").optional().isIn(["DAYS", "MONTHS", "YEARS"]).withMessage("Invalid durationType"),
  body("durationValue").optional().isInt({ min: 1 }).withMessage("durationValue must be a positive integer"),
  body("limits.maxBranches").optional().isInt({ min: 0 }),
  body("limits.maxUsers").optional().isInt({ min: 0 }),
  body("limits.maxProducts").optional().isInt({ min: 0 }),
  body("limits.storageLimit").optional().isInt({ min: 0 }),
  body("enabledModules").optional().isArray().withMessage("enabledModules must be an array"),
  body("enabledModules.*").optional().isString()
];
