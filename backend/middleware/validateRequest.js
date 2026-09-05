const { ZodError } = require('zod');

/**
 * Middleware to validate incoming request data using Zod.
 * 
 * @param {Object} schema - Object containing Zod schemas for body, query, and/or params
 */
const validateRequest = (schema) => async (req, res, next) => {
  try {
    if (schema.body) {
      req.body = await schema.body.parseAsync(req.body);
    }
    if (schema.query) {
      req.query = await schema.query.parseAsync(req.query);
    }
    if (schema.params) {
      req.params = await schema.params.parseAsync(req.params);
    }
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        data: null,
        errors: (error.issues || error.errors || []).map(e => ({ path: e.path.join('.'), message: e.message })),
        meta: null
      });
    }
    next(error);
  }
};

module.exports = validateRequest;
