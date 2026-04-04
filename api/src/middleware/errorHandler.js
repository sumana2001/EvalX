/**
 * Centralized error handling middleware.
 * 
 * Why centralized?
 * - Single place to format all error responses
 * - Catches async errors (with asyncHandler wrapper)
 * - Logs errors consistently
 * - Hides internal details in production
 * 
 * IMPORTANT: Must be registered LAST in middleware chain.
 */

import { AppError } from '../lib/errors.js';
import { config } from '../lib/config.js';

/**
 * Wraps async route handlers to catch rejected promises.
 * Without this, unhandled promise rejections crash the server.
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handler middleware.
 * Formats errors into consistent JSON responses.
 */
export function errorHandler(err, req, res, next) {
  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let details = err.details || null;
  let errorName = err.name || 'Error';
  
  // Log the error
  const logPayload = {
    requestId: req.id,
    method: req.method,
    path: req.path,
    statusCode,
    error: errorName,
    message,
    ...(details && { details }),
  };
  
  if (statusCode >= 500) {
    // Server errors: log full stack
    console.error('[ERROR]', logPayload, '\n', err.stack);
  } else {
    // Client errors: log without stack
    console.warn('[WARN]', logPayload);
  }
  
  // Handle specific error types
  if (err.name === 'SyntaxError' && err.type === 'entity.parse.failed') {
    // JSON parse error from body-parser
    statusCode = 400;
    message = 'Invalid JSON in request body';
    errorName = 'ValidationError';
  }
  
  if (err.code === '23505') {
    // PostgreSQL unique constraint violation
    statusCode = 409;
    message = 'Resource already exists';
    errorName = 'ConflictError';
  }
  
  if (err.code === '23503') {
    // PostgreSQL foreign key violation
    statusCode = 400;
    message = 'Referenced resource does not exist';
    errorName = 'ValidationError';
  }
  
  // Build response
  const response = {
    error: errorName,
    message,
    statusCode,
    requestId: req.id,
  };
  
  // Include details for operational errors
  if (err.isOperational && details) {
    response.details = details;
  }
  
  // Include stack trace in development for debugging
  if (config.nodeEnv === 'development' && statusCode >= 500) {
    response.stack = err.stack?.split('\n');
  }
  
  res.status(statusCode).json(response);
}
