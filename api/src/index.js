import express from 'express';
import dotenv from 'dotenv';
import { config, validateConfig } from './lib/config.js';
import { query, healthCheck as dbHealthCheck, closePool } from './lib/db.js';
import { 
  connectRedis, 
  healthCheck as redisHealthCheck, 
  disconnectRedis 
} from './lib/redis.js';

dotenv.config();
validateConfig();

const app = express();

app.use(express.json());

// Health check - returns status of all dependencies
app.get('/health', async (req, res) => {
  const [dbOk, redisOk] = await Promise.all([
    dbHealthCheck(),
    redisHealthCheck(),
  ]);
  
  const healthy = dbOk && redisOk;
  
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    service: 'evalx-api',
    dependencies: {
      postgres: dbOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
    },
  });
});

// Test endpoint to verify DB connection
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await query('SELECT NOW() as time, version() as version');
    res.json({
      connected: true,
      serverTime: result.rows[0].time,
      version: result.rows[0].version,
    });
  } catch (err) {
    res.status(500).json({
      connected: false,
      error: err.message,
    });
  }
});

// Graceful shutdown handler
async function shutdown(signal) {
  console.log(`\n[API] Received ${signal}. Shutting down gracefully...`);
  
  try {
    await closePool();
    await disconnectRedis();
    console.log('[API] Cleanup complete. Exiting.');
    process.exit(0);
  } catch (err) {
    console.error('[API] Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
async function start() {
  try {
    // Connect to Redis first (DB pool connects lazily on first query)
    await connectRedis();
    
    // Verify DB connection
    const dbOk = await dbHealthCheck();
    if (!dbOk) {
      throw new Error('Database connection failed');
    }
    console.log('[API] Database connection verified');
    
    app.listen(config.port, () => {
      console.log(`[API] EvalX API Gateway listening on port ${config.port}`);
      console.log(`[API] Health check: http://localhost:${config.port}/health`);
    });
  } catch (err) {
    console.error('[API] Failed to start:', err.message);
    process.exit(1);
  }
}

start();
