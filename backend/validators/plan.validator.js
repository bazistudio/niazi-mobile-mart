// validators/plan.validator.js

const { body } = require("express-validator");

exports.createPlanRules = [
  body("name")
    .trim()
    .notEmpty().withMessage("Plan name is required"),

  body("price")
    .notEmpty().withMessage("Price is required")
    .isFloat({ min: 0 }).withMessage("Price must be a positive number"),

  body("durationDays")
    .optional()
    .isInt({ min: 1 }).withMessage("durationDays must be a positive integer"),

  body("maxUsers")
    .optional()
    .isInt({ min: 1 }).withMessage("maxUsers must be at least 1"),

  body("features")
    .optional()
    .isArray().withMessage("features must be an array of strings"),

  body("code")
    .optional()
    .trim()
    .isAlphanumeric("en-US", { ignore: "_" })
    .withMessage("code must contain only letters, numbers, or underscores"),
];

exports.updatePlanRules = [
  body("name")
    .optional()
    .trim()
    .notEmpty().withMessage("Plan name cannot be empty"),

  body("price")
    .optional()
    .isFloat({ min: 0 }).withMessage("Price must be a positive number"),

  body("durationDays")
    .optional()
    .isInt({ min: 1 }).withMessage("durationDays must be a positive integer"),

  body("maxUsers")
    .optional()
    .isInt({ min: 1 }).withMessage("maxUsers must be at least 1"),

  body("features")
    .optional()
    .isArray().withMessage("features must be an array of strings"),
];
