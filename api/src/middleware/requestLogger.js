/**
 * Request logging middleware.
 * Logs incoming requests and outgoing responses with timing.
 * 
 * Features:
 * - Assigns unique request ID for tracing
 * - Logs method, path, status, and duration
 * - Structured JSON format for log aggregation
 */

import { randomUUID } from 'crypto';
import { config } from '../lib/config.js';

/**
 * Attaches a unique ID to each request and logs request/response.
 */
export function requestLogger(req, res, next) {
  // Generate or use existing request ID (for distributed tracing)
  req.id = req.headers['x-request-id'] || randomUUID();
  
  // Attach to response headers for client debugging
  res.setHeader('X-Request-ID', req.id);
  
  const startTime = Date.now();
  
  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    const logEntry = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    };
    
    // Add query params if present (but not in production for privacy)
    if (config.nodeEnv === 'development' && Object.keys(req.query).length > 0) {
      logEntry.query = req.query;
    }
    
    if (logLevel === 'warn') {
      console.warn('[HTTP]', logEntry);
    } else {
      console.log('[HTTP]', logEntry);
    }
  });
  
  next();
}
