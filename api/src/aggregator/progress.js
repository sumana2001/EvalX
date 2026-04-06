/**
 * Run Progress Tracking - Redis atomic counters.
 * 
 * Tracks evaluation run progress in real-time using Redis hashes.
 * 
 * Key structure: `run:{runId}:progress`
 * Hash fields:
 *   - total: Total jobs in the run
 *   - completed: Successfully completed jobs
 *   - failed: Failed jobs
 *   - pending: Jobs still processing (total - completed - failed)
 * 
 * Auto-expires after 24 hours to prevent stale data buildup.
 */

import { 
  redis,
  initRunProgress as initProgress,
  incrementRunProgress,
  getRunProgress as getRawProgress,
} from '../lib/redis.js';

// Re-export initRunProgress
export { initProgress as initRunProgress };

/**
 * Increment the completed counter (atomic).
 * 
 * @param {string} runId - Run UUID
 * @returns {Promise<number>} New completed count
 */
export async function incrementCompleted(runId) {
  return incrementRunProgress(runId, 'completed');
}

/**
 * Increment the failed counter (atomic).
 * 
 * @param {string} runId - Run UUID
 * @returns {Promise<number>} New failed count
 */
export async function incrementFailed(runId) {
  return incrementRunProgress(runId, 'failed');
}

/**
 * Get current progress for a run (enhanced).
 * 
 * @param {string} runId - Run UUID
 * @returns {Promise<Object>} Progress object with computed fields
 */
export async function getRunProgress(runId) {
  const data = await getRawProgress(runId);
  
  if (!data) {
    return null;
  }
  
  const { total, completed, failed, startedAt } = data;
  const pending = total - completed - failed;
  
  return {
    runId,
    total,
    completed,
    failed,
    pending,
    percentComplete: total > 0 ? Math.round((completed + failed) / total * 100) : 0,
    isComplete: pending === 0,
    startedAt: startedAt ? new Date(startedAt) : null,
  };
}

/**
 * Update progress after processing a result.
 * Returns the updated progress for broadcasting.
 * 
 * @param {string} runId - Run UUID
 * @param {boolean} success - Whether the result was successful
 * @returns {Promise<Object>} Updated progress
 */
export async function updateProgress(runId, success) {
  if (success) {
    await incrementCompleted(runId);
  } else {
    await incrementFailed(runId);
  }
  
  return await getRunProgress(runId);
}

/**
 * Check if a run is complete (all jobs processed).
 * 
 * @param {string} runId - Run UUID
 * @returns {Promise<boolean>}
 */
export async function isRunComplete(runId) {
  const progress = await getRunProgress(runId);
  return progress ? progress.isComplete : false;
}

/**
 * Delete progress data for a run (cleanup).
 * 
 * @param {string} runId - Run UUID
 */
export async function deleteRunProgress(runId) {
  const key = `run:${runId}:progress`;
  await redis.del(key);
}

/**
 * Extend the TTL for a run's progress (keep alive).
 * 
 * @param {string} runId - Run UUID
 */
export async function extendProgressTTL(runId) {
  const key = `run:${runId}:progress`;
  await redis.expire(key, 86400); // 24 hours
}
