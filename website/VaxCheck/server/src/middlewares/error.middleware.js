/**
 * middlewares/error.middleware.js
 *
 * Global Express error handler.
 * Catches all errors forwarded via next(err) — including ApiError instances
 * thrown from controllers wrapped with asyncHandler.
 *
 * Returns a consistent JSON error shape:
 *  {
 *    statusCode: number,
 *    message: string,
 *    errors: [],
 *    success: false
 *  }
 */

import { ApiError } from '../utils/ApiError.js';

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  // Handle known ApiError instances
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors,
      success: false,
    });
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      statusCode: 400,
      message: 'Validation failed',
      errors: messages,
      success: false,
    });
  }

  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      statusCode: 409,
      message: `Duplicate value for ${field}`,
      errors: [],
      success: false,
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      statusCode: 401,
      message: 'Invalid token',
      errors: [],
      success: false,
    });
  }

  // Fallback: unexpected server errors
  console.error('Unhandled server error:', err);
  return res.status(500).json({
    statusCode: 500,
    message: err.message || 'Internal Server Error',
    errors: [],
    success: false,
  });
};

export { errorHandler };
