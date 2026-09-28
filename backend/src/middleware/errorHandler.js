/**
 * Global error handling middleware.
 *
 * Catches any unhandled errors thrown in route handlers and returns
 * a consistent JSON error response.
 */

export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  /* Log full stack in development for debugging */
  if (process.env.LOG_LEVEL === 'debug') {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err);
  } else {
    console.error(`[ERROR] ${req.method} ${req.path}: ${message}`);
  }

  res.status(status).json({
    error: message,
    ...(process.env.LOG_LEVEL === 'debug' && { stack: err.stack }),
  });
}

/**
 * Wraps an async route handler so thrown errors are forwarded to
 * the Express error handler instead of crashing the process.
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
