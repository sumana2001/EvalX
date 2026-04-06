/**
 * React hook for real-time run progress.
 */

import { useState, useEffect, useCallback } from 'react';
import { getSocket, connectSocket, subscribeToRun, unsubscribeFromRun } from '../lib/socket';

/**
 * Hook to subscribe to real-time progress updates for a run.
 * 
 * @param {string} runId - Run UUID to subscribe to
 * @returns {{ progress, isConnected }}
 */
export function useRunProgress(runId) {
  const [progress, setProgress] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!runId) return;

    const socket = connectSocket();

    // Connection handlers
    const handleConnect = () => {
      setIsConnected(true);
      subscribeToRun(runId);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    // Progress event handlers
    const handleProgress = (data) => {
      if (data.runId === runId) {
        setProgress(data);
      }
    };

    const handleComplete = (data) => {
      if (data.runId === runId) {
        setProgress(prev => ({
          ...prev,
          ...data,
          isComplete: true,
        }));
      }
    };

    // Register listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('run:progress', handleProgress);
    socket.on('run:complete', handleComplete);

    // Subscribe if already connected
    if (socket.connected) {
      setIsConnected(true);
      subscribeToRun(runId);
    }

    // Cleanup
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('run:progress', handleProgress);
      socket.off('run:complete', handleComplete);
      unsubscribeFromRun(runId);
    };
  }, [runId]);

  return { progress, isConnected };
}

/**
 * Hook to manage multiple run progress subscriptions.
 * 
 * @param {string[]} runIds - Array of run UUIDs
 * @returns {{ progressMap, isConnected }}
 */
export function useMultiRunProgress(runIds) {
  const [progressMap, setProgressMap] = useState({});
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!runIds || runIds.length === 0) return;

    const socket = connectSocket();

    const handleConnect = () => {
      setIsConnected(true);
      runIds.forEach(id => subscribeToRun(id));
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleProgress = (data) => {
      if (runIds.includes(data.runId)) {
        setProgressMap(prev => ({
          ...prev,
          [data.runId]: data,
        }));
      }
    };

    const handleComplete = (data) => {
      if (runIds.includes(data.runId)) {
        setProgressMap(prev => ({
          ...prev,
          [data.runId]: { ...prev[data.runId], ...data, isComplete: true },
        }));
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('run:progress', handleProgress);
    socket.on('run:complete', handleComplete);

    if (socket.connected) {
      setIsConnected(true);
      runIds.forEach(id => subscribeToRun(id));
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('run:progress', handleProgress);
      socket.off('run:complete', handleComplete);
      runIds.forEach(id => unsubscribeFromRun(id));
    };
  }, [runIds.join(',')]);

  return { progressMap, isConnected };
}
