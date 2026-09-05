// validators/billing.validator.js

const { body, query } = require("express-validator");

exports.recordPaymentRules = [
  body("invoiceId")
    .trim()
    .notEmpty().withMessage("invoiceId is required")
    .isString().trim().notEmpty().withMessage("invoiceId must be a valid ID"),

  body("amount")
    .notEmpty().withMessage("amount is required")
    .isFloat({ min: 0.01 }).withMessage("amount must be greater than 0"),

  body("method")
    .trim()
    .notEmpty().withMessage("Payment method is required")
    .isIn(["cash", "easypaisa", "jazzcash", "bank"])
    .withMessage("method must be one of: cash, easypaisa, jazzcash, bank"),

  body("reference")
    .optional()
    .trim()
    .isString().withMessage("reference must be a string"),
];

exports.logUsageRules = [
  body("service")
    .trim()
    .notEmpty().withMessage("service is required")
    .isIn(["sms", "whatsapp", "ai", "maps"])
    .withMessage("service must be one of: sms, whatsapp, ai, maps"),

  body("usageCount")
    .notEmpty().withMessage("usageCount is required")
    .isInt({ min: 1 }).withMessage("usageCount must be at least 1"),

  body("pricePerUnit")
    .notEmpty().withMessage("pricePerUnit is required")
    .isFloat({ min: 0 }).withMessage("pricePerUnit must be a positive number"),
];

exports.getUsageLogsRules = [
  query("service")
    .optional()
    .isIn(["sms", "whatsapp", "ai", "maps"])
    .withMessage("service filter must be one of: sms, whatsapp, ai, maps"),
];
