/**
 * Custom error classes for consistent API error responses.
 * 
 * Why custom errors?
 * - Consistent structure across all endpoints
 * - HTTP status codes attached to errors
 * - Easy to distinguish operational errors from programmer bugs
 * - Serializable to JSON for API responses
 * 
 * Usage:
 *   throw new ValidationError('Invalid JSON schema', { field: 'expected_schema' });
 *   throw new NotFoundError('Task', taskId);
 */
/**
 * Base application error.
 * All custom errors extend this.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // Distinguishes from programmer errors
    
    // Capture stack trace (excludes constructor from trace)
    Error.captureStackTrace(this, this.constructor);
  }
  
  toJSON() {
    return {
      error: this.name,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * 400 Bad Request - Invalid input data
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, details);
  }
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(resource, identifier) {
    super(`${resource} not found: ${identifier}`, 404, { resource, identifier });
  }
}

/**
 * 409 Conflict - Resource state conflict
 */
export class ConflictError extends AppError {
  constructor(message, details = null) {
    super(message, 409, details);
  }
}

/**
 * 422 Unprocessable Entity - Valid syntax but semantic error
 */
export class UnprocessableError extends AppError {
  constructor(message, details = null) {
    super(message, 422, details);
  }
}

/**
 * 503 Service Unavailable - Dependency failure
 */
export class ServiceUnavailableError extends AppError {
  constructor(service, details = null) {
    super(`Service unavailable: ${service}`, 503, { service, ...details });
  }
}
