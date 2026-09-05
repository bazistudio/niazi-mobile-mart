// middleware/requireAuth.js
// Thin re-export so routes can import from a consistent path

const requireAuth = require("./auth");

module.exports = requireAuth;
