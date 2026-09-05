// validators/shop.validator.js

const { body, query } = require("express-validator");

exports.createShopRules = [
  body("name")
    .trim()
    .notEmpty().withMessage("Shop name is required"),

  body("ownerName")
    .optional()
    .trim(),

  body("phone")
    .optional()
    .trim(),

  body("email")
    .optional()
    .trim()
    .isEmail().withMessage("Enter a valid email address")
    .normalizeEmail(),

  body("address")
    .optional()
    .trim()
    .isString().withMessage("Address must be a string"),

  body("city")
    .optional()
    .trim()
    .isString().withMessage("City must be a string"),

  body("planId")
    .optional()
    .isString().trim().notEmpty().withMessage("planId must be a valid ID"),
];

exports.updateShopRules = [
  body("name")
    .optional()
    .trim()
    .notEmpty().withMessage("Shop name cannot be empty"),

  body("ownerName")
    .optional()
    .trim()
    .notEmpty().withMessage("Owner name cannot be empty"),

  body("phone")
    .optional()
    .trim()
    .matches(/^[0-9+\-\s]{7,15}$/).withMessage("Enter a valid phone number"),

  body("email")
    .optional()
    .trim()
    .isEmail().withMessage("Enter a valid email address")
    .normalizeEmail(),

  body("planId")
    .optional()
    .isString().trim().notEmpty().withMessage("planId must be a valid ID"),

  body("ownerId")
    .optional()
    .isString().trim().notEmpty().withMessage("ownerId must be a valid ID"),
];

exports.statusFilterRules = [
  query("status")
    .optional()
    .isIn(["active", "suspended", "inactive"])
    .withMessage("status filter must be: active | suspended | inactive"),
];
