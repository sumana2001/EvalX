/**
 * Aggregator Handler - Orchestrates result processing.
 * 
 * Wires together:
 * - Kafka consumer (receives results)
 * - Python Evaluator (scores the output)
 * - Persistence (saves to DB)
 * - Progress tracking (Redis counters)
 * - Socket.io (real-time UI updates)
 * 
 * Flow:
 * 1. Receive result from Kafka
 * 2. Call Python Evaluator to score (schema, RAG, judge)
 * 3. Persist to PostgreSQL
 * 4. Update Redis progress counters
 * 5. Emit Socket.io event
 * 6. Check if run complete → update run status
 */

import { persistResult } from './persistence.js';
import { updateProgress, isRunComplete } from './progress.js';
import { emitRunProgress, emitRunComplete } from './socket.js';
import { query } from '../lib/db.js';

// Evaluator service URL
const EVALUATOR_URL = process.env.EVALUATOR_URL || 'http://localhost:8000';

/**
 * Call the Python evaluator to score the LLM output.
 * 
 * @param {Object} result - Raw result from worker
 * @returns {Promise<Object>} Result with evaluation metrics added
 */
async function callEvaluator(result) {
  // Skip evaluation for failed jobs
  if (result.status === 'failed') {
    return result;
  }

  const evaluatorPayload = {
    raw_output: result.raw_output,
    expected_schema: result.expected_schema || {},
    ground_truth: result.ground_truth || null,
    context: result.context || null,
    input: result.input || null,
  };

  try {
    const response = await fetch(`${EVALUATOR_URL}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(evaluatorPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Evaluator HTTP ${response.status}: ${errorText}`);
    }

    const evaluation = await response.json();

    // Merge evaluation metrics into result
    return {
      ...result,
      metrics: {
        schema_valid: evaluation.schema_valid,
        completeness: evaluation.completeness,
        context_relevance: evaluation.context_relevance,
        faithfulness: evaluation.faithfulness,
        judge_score: evaluation.judge_score,
        judge_reasoning: evaluation.judge_reasoning,
        overall_score: evaluation.overall_score,
        flags: evaluation.flags,
      },
    };
  } catch (error) {
    console.error(`[Aggregator] Evaluator call failed:`, error.message);
    
    // Mark as evaluation failure but don't crash
    return {
      ...result,
      status: 'failed',
      failure_type: 'EVALUATOR_ERROR',
      error_message: error.message,
    };
  }
}

/**
 * Process a single evaluation result.
 * 
 * @param {Object} result - Evaluation result from Kafka
 */
export async function handleResult(result) {
  const { run_id, job_id, status } = result;
  
  console.log(`[Aggregator] Processing ${job_id} (${status})`);

  try {
    // 1. Call evaluator to score the output (for successful LLM calls)
    const evaluatedResult = await callEvaluator(result);
    console.log(`[Aggregator] Evaluated: ${evaluatedResult.status}${evaluatedResult.metrics ? `, score: ${evaluatedResult.metrics.overall_score?.toFixed(2)}` : ''}`);

    // 2. Persist to database
    const persistence = await persistResult(evaluatedResult);
    console.log(`[Aggregator] Persisted to ${persistence.table}: ${persistence.id}`);

    // 3. Update Redis progress (use evaluated status)
    const progress = await updateProgress(run_id, evaluatedResult.status === 'success');
    console.log(`[Aggregator] Progress: ${progress.completed + progress.failed}/${progress.total} (${progress.percentComplete}%)`);

    // 4. Emit Socket.io event
    emitRunProgress(run_id, progress);

    // 5. Check if run is complete
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
