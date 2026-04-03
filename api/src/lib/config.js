/**
 * Centralized configuration from environment variables.
 * All config access should go through this module.
 * 
 */

// Helper to get required env var (throws if missing)
function required(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Helper to get optional env var with default
function optional(key, defaultValue) {
  return process.env[key] || defaultValue;
}

export const config = {
  // Server
  port: parseInt(optional('PORT', '3001'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  
  // PostgreSQL
  database: {
    // Full connection string OR individual parts
    url: optional('DATABASE_URL', 'postgresql://evalx:evalx@localhost:5432/evalx'),
    
    // Pool settings
    poolMin: parseInt(optional('DB_POOL_MIN', '2'), 10),
    poolMax: parseInt(optional('DB_POOL_MAX', '10'), 10),
    idleTimeoutMs: parseInt(optional('DB_IDLE_TIMEOUT_MS', '30000'), 10),
    connectionTimeoutMs: parseInt(optional('DB_CONNECTION_TIMEOUT_MS', '5000'), 10),
  },
  
  // Redis
  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
    
    // Reconnect settings
    maxRetries: parseInt(optional('REDIS_MAX_RETRIES', '10'), 10),
    retryDelayMs: parseInt(optional('REDIS_RETRY_DELAY_MS', '1000'), 10),
  },
  
  // Kafka (Redpanda)
  kafka: {
    brokers: optional('KAFKA_BROKERS', 'localhost:19092').split(','),
    clientId: optional('KAFKA_CLIENT_ID', 'evalx-api'),
  },
};

// Validate config on import (fail fast)
export function validateConfig() {
  const errors = [];
  
  if (config.database.poolMin > config.database.poolMax) {
    errors.push('DB_POOL_MIN cannot be greater than DB_POOL_MAX');
  }
  
  if (config.port < 1 || config.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
  
  return true;
}
