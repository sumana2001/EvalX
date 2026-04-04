/**
 * 404 Not Found handler.
 * Catches requests that don't match any route.
 * 
 * IMPORTANT: Must be registered AFTER all routes but BEFORE errorHandler.
 */

export function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: 'NotFoundError',
    message: `Route not found: ${req.method} ${req.path}`,
    statusCode: 404,
    requestId: req.id,
  });
}
