/**
 * Aggregator Handler - Orchestrates result processing.
 * 
 * Wires together:
 * - Kafka consumer (receives results)
 * - Persistence (saves to DB)
 * - Progress tracking (Redis counters)
 * - Socket.io (real-time UI updates)
 * 
 * Flow:
 * 1. Receive result from Kafka
 * 2. Persist to PostgreSQL
 * 3. Update Redis progress counters
 * 4. Emit Socket.io event
 * 5. Check if run complete → update run status
 */

import { persistResult } from './persistence.js';
import { updateProgress, isRunComplete } from './progress.js';
import { emitRunProgress, emitRunComplete } from './socket.js';
import { query } from '../lib/db.js';

/**
 * Process a single evaluation result.
 * 
 * @param {Object} result - Evaluation result from Kafka
 */
export async function handleResult(result) {
  const { run_id, job_id, status } = result;
  
  console.log(`[Aggregator] Processing ${job_id} (${status})`);

  try {
    // 1. Persist to database
    const persistence = await persistResult(result);
    console.log(`[Aggregator] Persisted to ${persistence.table}: ${persistence.id}`);

    // 2. Update Redis progress
    const progress = await updateProgress(run_id, status === 'success');
    console.log(`[Aggregator] Progress: ${progress.completed + progress.failed}/${progress.total} (${progress.percentComplete}%)`);

    // 3. Emit Socket.io event
    emitRunProgress(run_id, progress);

    // 4. Check if run is complete
    if (progress.isComplete) {
      await handleRunComplete(run_id, progress);
    }

  } catch (error) {
    console.error(`[Aggregator] Error processing ${job_id}:`, error.message);
    throw error; // Re-throw to prevent Kafka commit
  }
}

/**
 * Handle run completion - update DB status, emit event.
 * 
 * @param {string} runId - Run UUID
 * @param {Object} progress - Final progress data
 */
async function handleRunComplete(runId, progress) {
  console.log(`[Aggregator] Run ${runId} complete!`);

  // Determine final status based on failures
  const finalStatus = progress.failed === progress.total ? 'failed' : 'completed';

  // Update run status in database
  const updateSql = `
    UPDATE evaluation_runs
    SET status = $1, completed_at = NOW()
    WHERE id = $2
  `;
  
  await query(updateSql, [finalStatus, runId]);
  console.log(`[Aggregator] Run ${runId} status updated to: ${finalStatus}`);

  // Calculate duration
  const durationMs = progress.startedAt 
    ? Date.now() - progress.startedAt.getTime()
    : null;

  // Emit completion event
  emitRunComplete(runId, {
    status: finalStatus,
    total: progress.total,
    completed: progress.completed,
    failed: progress.failed,
    durationMs,
  });
}

/**
 * Process a batch of results (for higher throughput).
 * 
 * @param {Array<Object>} results - Array of evaluation results
 */
export async function handleResultsBatch(results) {
  for (const result of results) {
    await handleResult(result);
  }
}
