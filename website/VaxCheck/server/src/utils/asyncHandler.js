/**
 * utils/asyncHandler.js
 *
 * Higher-order function that wraps async route handlers / controllers.
 * Any thrown error (including ApiError instances) is forwarded to
 * Express's next() so the global error middleware can handle it.
 *
 * Eliminates the need for try/catch blocks in every controller.
 *
 * Usage:
 *   router.get('/route', asyncHandler(async (req, res) => { ... }));
 */

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export { asyncHandler };
