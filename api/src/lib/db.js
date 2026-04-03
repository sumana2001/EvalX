// PostgreSQL connection pool using node-postgres (pg).
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

// Create the pool (does not connect until first query)
const pool = new Pool({
  connectionString: config.database.url,
  min: config.database.poolMin,
  max: config.database.poolMax,
  idleTimeoutMillis: config.database.idleTimeoutMs,
  connectionTimeoutMillis: config.database.connectionTimeoutMs,
});

// Log pool events in development
if (config.nodeEnv === 'development') {
  pool.on('connect', () => {
    console.log('[DB] New client connected to pool');
  });
  
  pool.on('remove', () => {
    console.log('[DB] Client removed from pool');
  });
}

// Log errors (important: unhandled pool errors crash the process)
pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
  // Don't exit - the pool will attempt to reconnect
});

/**
 * Execute a query using the pool.
 * Connection is automatically acquired and released.
 * 
 * @param {string} text - SQL query with $1, $2... placeholders
 * @param {Array} params - Parameter values
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  
  if (config.nodeEnv === 'development') {
    console.log('[DB] Query executed', {
      text: text.substring(0, 80) + (text.length > 80 ? '...' : ''),
      duration: `${duration}ms`,
      rows: result.rowCount,
    });
  }
  
  return result;
}

/**
 * Get a client from the pool for transactions.
 * 
 * @returns {Promise<pg.PoolClient>}
 */
export async function getClient() {
  return pool.connect();
}

/**
 * Check database connectivity.
 * Used for health checks.
 * 
 * @returns {Promise<boolean>}
 */
export async function healthCheck() {
  try {
    const result = await query('SELECT 1 as ok');
    return result.rows[0]?.ok === 1;
  } catch (err) {
    console.error('[DB] Health check failed:', err.message);
    return false;
  }
}

/**
 * Gracefully close all pool connections.
 */
export async function closePool() {
  console.log('[DB] Closing connection pool...');
  await pool.end();
  console.log('[DB] Pool closed');
}

export { pool };
