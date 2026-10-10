/**
 * utils/ApiError.js
 *
 * Custom error class that extends the built-in Error.
 * Carries an HTTP status code so the global error middleware can
 * send the correct response without any extra logic in controllers.
 *
 * Usage:
 *   throw new ApiError(404, 'Device not found');
 *   throw new ApiError(400, 'Invalid payload', ['field: required']);
 */

class ApiError extends Error {
  constructor(
    statusCode,
    message = 'Something went wrong',
    errors = [],
    stack = ''
  ) {
    super(message);
    this.statusCode = statusCode;
    this.data = null;
    this.message = message;
    this.success = false;
    this.errors = errors;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export { ApiError };
