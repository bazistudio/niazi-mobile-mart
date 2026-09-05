/**
 * Standardize API successful responses.
 * 
 * @param {Object} res - Express response object
 * @param {Object} data - The primary payload
 * @param {string} message - A user-friendly message
 * @param {Object} meta - Additional metadata like pagination (optional)
 * @param {number} statusCode - HTTP status code (default 200)
 */
exports.successResponse = (res, data = {}, message = "Success", meta = null, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    meta,
    errors: null
  });
};

/**
 * Standardize API error responses.
 * 
 * @param {Object} res - Express response object
 * @param {string} message - A user-friendly error message
 * @param {Array} errors - Detailed validation or field errors
 * @param {number} statusCode - HTTP status code (default 400)
 */
exports.errorResponse = (res, message = "Error", errors = [], statusCode = 400) => {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    meta: null,
    errors: errors.length > 0 ? errors : null
  });
};
