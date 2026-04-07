/**
 * Shared validation utilities for API routes.
 */

import { ValidationError } from './errors.js';

// UUID regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate request body against a Zod schema.
 * Throws ValidationError with detailed field errors if invalid.
 * 
 * @param {import('zod').ZodSchema} schema - Zod schema
 * @param {object} body - Request body to validate
 * @returns {object} Validated and parsed data
 * @throws {ValidationError} If validation fails
 */
export function validateBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ValidationError('Invalid request body', { errors });
  }
  return result.data;
}

/**
 * Validate a string is a valid UUID format.
 * 
 * @param {string} id - String to validate
 * @param {string} field - Field name for error message
 * @throws {ValidationError} If not a valid UUID
 */
export function validateUuid(id, field = 'id') {
  if (!UUID_REGEX.test(id)) {
    throw new ValidationError(`Invalid ${field} format`, { [field]: id });
  }
}

/**
 * Check if a string is a valid UUID (non-throwing).
 * 
 * @param {string} id - String to check
 * @returns {boolean} True if valid UUID
 */
export function isValidUuid(id) {
  return UUID_REGEX.test(id);
}
