/**
 * Wrapper for async route handlers to automatically catch errors
 * and forward them to the Express error handling middleware.
 * 
 * @param {Function} fn - The asynchronous Express route handler function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
