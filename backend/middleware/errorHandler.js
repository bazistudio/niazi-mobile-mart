/**
 * @desc    Global Centralized Error Handler
 * @usage   Registered as the last middleware in server.js
 */
const { errorResponse } = require('../utils/apiResponse');
const { ZodError } = require('zod');
const { AppError } = require('../utils/errors');

module.exports = (err, req, res, next) => {
  // Log error for developers
  console.error(`[SERVER_ERROR] ${req.method} ${req.originalUrl}:`, {
    message: err.message,
    name: err.name,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // Handle specific known error types
  
  if (err instanceof AppError) {
    return errorResponse(res, err.message, [], err.statusCode);
  }

  if (err instanceof ZodError) {
    const formattedErrors = (err.issues || err.errors || []).map(e => ({ path: e.path.join('.'), message: e.message }));
    return errorResponse(res, 'Validation failed', formattedErrors, 400);
  }

  if (err.name === 'ValidationError') {
    // Mongoose validation error
    const formattedErrors = Object.values(err.errors || {}).map(e => ({ path: e.path, message: e.message }));
    return errorResponse(res, 'Validation Error', formattedErrors, 400);
  }

  if (err.name === 'CastError') {
    // Mongoose cast error (e.g. invalid ObjectId)
    return errorResponse(res, `Invalid format for ${err.path}`, [], 400);
  }

  if (err.code === 11000) {
    // Mongoose duplicate key error
    const field = Object.keys(err.keyValue || {})[0];
    return errorResponse(res, `Duplicate field value entered for ${field}. Please use another value.`, [], 409);
  }

  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 'Invalid token. Please log in again.', [], 401);
  }

  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 'Your token has expired. Please log in again.', [], 401);
  }

  // Fallback for unknown errors
  const statusCode = err.status || res.statusCode === 200 ? 500 : res.statusCode;
  const message = process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error';
  
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    meta: null,
    errors: null,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
