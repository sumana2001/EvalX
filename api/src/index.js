import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { config, validateConfig } from './lib/config.js';
import { query, healthCheck as dbHealthCheck, closePool } from './lib/db.js';
import {
  connectRedis,
  healthCheck as redisHealthCheck,
  disconnectRedis,
} from './lib/redis.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, asyncHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { ValidationError } from './lib/errors.js';
import tasksRouter from './routes/tasks.js';
import promptsRouter from './routes/prompts.js';
import runsRouter from './routes/runs.js';

dotenv.config();
validateConfig();

const app = express();

// ============================================================
// Middleware Stack (ORDER MATTERS)
// ============================================================

// 1. Request logging (first - captures all requests)
app.use(requestLogger);

// 2. CORS (before routes - allows frontend to make requests)
app.use(cors({
  origin: config.nodeEnv === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',')
    : '*', // Allow all in development
  credentials: true,
}));

// 3. Body parsing
app.use(express.json({ limit: '10mb' })); // Large limit for dataset uploads

// ============================================================
// Routes
// ============================================================

// Health check - returns status of all dependencies
app.get('/health', asyncHandler(async (req, res) => {
  const [dbOk, redisOk] = await Promise.all([
    dbHealthCheck(),
    redisHealthCheck(),
  ]);

  const healthy = dbOk && redisOk;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    service: 'evalx-api',
    requestId: req.id,
    dependencies: {
      postgres: dbOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
    },
  });
}));

// Test endpoint to verify DB connection
app.get('/api/test-db', asyncHandler(async (req, res) => {
  const result = await query('SELECT NOW() as time, version() as version');
  res.json({
    connected: true,
    serverTime: result.rows[0].time,
    version: result.rows[0].version,
  });
}));

// Test endpoint to verify error handling
app.get('/api/test-error', asyncHandler(async (req, res) => {
  const { type } = req.query;

  if (type === 'validation') {
    throw new ValidationError('This is a test validation error', { field: 'test' });
  }
  if (type === 'async') {
    // Simulates an async error (e.g., DB failure)
    await Promise.reject(new Error('Simulated async failure'));
  }
  if (type === 'sync') {
    throw new Error('Simulated sync failure');
  }

  res.json({ message: 'No error triggered. Use ?type=validation|async|sync' });
}));

// API Routes
app.use('/api/tasks', tasksRouter);
app.use('/api/prompts', promptsRouter);
app.use('/api/runs', runsRouter);

// ============================================================
// Error Handling (MUST be last)
// ============================================================

// 404 handler (after all routes)
app.use(notFoundHandler);

// Global error handler (always last)
app.use(errorHandler);

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
