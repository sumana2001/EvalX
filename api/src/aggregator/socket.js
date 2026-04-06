/**
 * Socket.io Server - Real-time progress broadcasting.
 * 
 * Broadcasts run progress updates to connected clients.
 * Uses Redis adapter for multi-instance scaling.
 * 
 * Events emitted:
 * - `run:progress` - Progress update for a specific run
 * - `run:complete` - Run has finished (all jobs processed)
 * - `run:started` - Run has started processing
 * 
 * Rooms:
 * - Clients join `run:{runId}` room to receive updates for that run
 */

import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis, redisPubSub } from '../lib/redis.js';

let io = null;

/**
 * Initialize Socket.io server with Redis adapter.
 * 
 * @param {http.Server} httpServer - HTTP server instance
 * @returns {Server} Socket.io server
 */
export function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
    // Optimize for real-time updates
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Use Redis adapter for multi-instance scaling
  // This allows emitting events from any API instance
  io.adapter(createAdapter(redis, redisPubSub));

  // Connection handling
  io.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // Join a run's room to receive progress updates
    socket.on('subscribe:run', (runId) => {
      if (!runId) return;
      
      const room = `run:${runId}`;
      socket.join(room);
      console.log(`[Socket.io] Client ${socket.id} subscribed to ${room}`);
    });

    // Leave a run's room
    socket.on('unsubscribe:run', (runId) => {
      if (!runId) return;
      
      const room = `run:${runId}`;
      socket.leave(room);
      console.log(`[Socket.io] Client ${socket.id} unsubscribed from ${room}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.io] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  console.log('[Socket.io] Server initialized with Redis adapter');
  return io;
}

/**
 * Get the initialized Socket.io server.
 */
export function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initSocketIO() first.');
  }
  return io;
}

/**
 * Emit a progress update to all clients subscribed to a run.
 * 
 * @param {string} runId - Run UUID
 * @param {Object} progress - Progress data
 */
export function emitRunProgress(runId, progress) {
  if (!io) return;
  
  const room = `run:${runId}`;
  io.to(room).emit('run:progress', {
    runId,
    ...progress,
    timestamp: Date.now(),
  });
}

/**
 * Emit a run started event.
 * 
 * @param {string} runId - Run UUID
 * @param {Object} data - Run data (total jobs, etc.)
 */
export function emitRunStarted(runId, data) {
  if (!io) return;
  
  const room = `run:${runId}`;
  io.to(room).emit('run:started', {
    runId,
    ...data,
    timestamp: Date.now(),
  });
}

/**
 * Emit a run complete event.
 * 
 * @param {string} runId - Run UUID
 * @param {Object} summary - Final summary (completed, failed, duration)
 */
export function emitRunComplete(runId, summary) {
  if (!io) return;
  
  const room = `run:${runId}`;
  io.to(room).emit('run:complete', {
    runId,
    ...summary,
    timestamp: Date.now(),
  });
}

/**
 * Get number of clients subscribed to a run.
 * 
 * @param {string} runId - Run UUID
 * @returns {Promise<number>}
 */
export async function getRunSubscriberCount(runId) {
  if (!io) return 0;
  
  const room = `run:${runId}`;
  const sockets = await io.in(room).fetchSockets();
  return sockets.length;
}
