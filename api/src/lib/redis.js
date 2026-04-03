/**
 * Redis client with automatic reconnection.
 * 
 * Why Redis in EvalX?
 * 1. Real-time counters: Track run progress (completed/failed jobs) with HINCRBY
 * 2. Socket.io adapter: Pub/sub for multi-instance WebSocket scaling
 * 3. Caching: Optional response caching for repeated evaluations
 * 
 */

import { createClient } from 'redis';
import { config } from './config.js';

// Main client for commands (GET, SET, HINCRBY, etc.)
const redis = createClient({
  url: config.redis.url,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > config.redis.maxRetries) {
        console.error(`[Redis] Max retries (${config.redis.maxRetries}) exceeded. Giving up.`);
        return new Error('Redis max retries exceeded');
      }
      const delay = Math.min(retries * config.redis.retryDelayMs, 5000);
      console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${retries})`);
      return delay;
    },
  },
});

// Separate client for Pub/Sub (Redis requires dedicated connection for subscriptions)
const redisPubSub = redis.duplicate();

// Event handlers
redis.on('connect', () => {
  console.log('[Redis] Connected');
});

redis.on('ready', () => {
  console.log('[Redis] Ready to accept commands');
});

redis.on('error', (err) => {
  console.error('[Redis] Error:', err.message);
});

redis.on('reconnecting', () => {
  console.log('[Redis] Reconnecting...');
});

redisPubSub.on('error', (err) => {
  console.error('[Redis PubSub] Error:', err.message);
});

/**
 * Connect both Redis clients.
 * Call this during application startup.
 */
export async function connectRedis() {
  await redis.connect();
  await redisPubSub.connect();
  console.log('[Redis] Both clients connected');
}

/**
 * Check Redis connectivity.
 * Used for health checks.
 * 
 * @returns {Promise<boolean>}
 */
export async function healthCheck() {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (err) {
    console.error('[Redis] Health check failed:', err.message);
    return false;
  }
}

/**
 * Gracefully disconnect both clients.
 * Call this on process shutdown.
 */
export async function disconnectRedis() {
  console.log('[Redis] Disconnecting...');
  await redis.quit();
  await redisPubSub.quit();
  console.log('[Redis] Disconnected');
}

// ============================================================
// Run Progress Helpers (atomic operations for tracking)
// ============================================================

/**
 * Initialize progress counters for a run.
 * 
 * @param {string} runId - UUID of the run
 * @param {number} totalJobs - Total number of jobs to process
 */
export async function initRunProgress(runId, totalJobs) {
  const key = `run:${runId}:progress`;
  await redis.hSet(key, {
    total: totalJobs.toString(),
    completed: '0',
    failed: '0',
    startedAt: Date.now().toString(),
  });
  // Auto-expire after 24 hours (cleanup stale runs)
  await redis.expire(key, 86400);
}

/**
 * Increment completed or failed counter atomically.
 * 
 * @param {string} runId - UUID of the run
 * @param {'completed' | 'failed'} field - Which counter to increment
 * @returns {Promise<number>} - New value after increment
 */
export async function incrementRunProgress(runId, field) {
  const key = `run:${runId}:progress`;
  return redis.hIncrBy(key, field, 1);
}

/**
 * Get current progress for a run.
 * 
 * @param {string} runId - UUID of the run
 * @returns {Promise<{total: number, completed: number, failed: number, startedAt: number} | null>}
 */
export async function getRunProgress(runId) {
  const key = `run:${runId}:progress`;
  const data = await redis.hGetAll(key);
  
  if (!data || Object.keys(data).length === 0) {
    return null;
  }
  
  return {
    total: parseInt(data.total, 10),
    completed: parseInt(data.completed, 10),
    failed: parseInt(data.failed, 10),
    startedAt: parseInt(data.startedAt, 10),
  };
}

export { redis, redisPubSub };
