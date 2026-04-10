/**
 * Socket.io client for real-time updates.
 */

import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Singleton socket instance
let socket = null;

/**
 * Get or create the socket connection.
 */
export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });
  }

  return socket;
}

/**
 * Connect to the socket server.
 */
export function connectSocket() {
  const sock = getSocket();
  if (!sock.connected) {
    sock.connect();
  }
  return sock;
}

/**
 * Disconnect from the socket server.
 */
export function disconnectSocket() {
  if (socket && socket.connected) {
    socket.disconnect();
  }
}

/**
 * Subscribe to a run's progress updates.
 */
export function subscribeToRun(runId) {
  const sock = getSocket();
  sock.emit('subscribe:run', runId);
  console.log('[Socket] Subscribed to run:', runId);
}

/**
 * Unsubscribe from a run's progress updates.
 */
export function unsubscribeFromRun(runId) {
  const sock = getSocket();
  sock.emit('unsubscribe:run', runId);
  console.log('[Socket] Unsubscribed from run:', runId);
}
