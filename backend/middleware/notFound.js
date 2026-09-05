/**
 * @desc    404 Not Found Handler
 * @usage   Catches any request that didn't match a registered route.
 *          Registered after all routes, before the error handler.
 */
module.exports = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`,
    data: null
  });
};
