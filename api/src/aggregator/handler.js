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

  // Build payload matching EvaluationRequest model
  const evaluatorPayload = {
    job_id: result.job_id || 'unknown',
    run_id: result.run_id || 'unknown',
    task_item_id: result.task_item_id || 'unknown',
    prompt_variant_id: result.prompt_variant_id || 'unknown',
    model: result.model || 'unknown',
    repetition_index: result.repetition_index || 1,
    raw_output: result.raw_output || '',
    expected_schema: result.expected_schema || null,
    ground_truth: result.ground_truth || null,
    context: result.context || null,
    input: result.input || null,
  };

  console.log(`[Aggregator] Calling evaluator with payload for job ${result.job_id}`);

  try {
    const response = await fetch(`${EVALUATOR_URL}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(evaluatorPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Aggregator] Evaluator response: ${response.status} - ${errorText}`);
      throw new Error(`Evaluator HTTP ${response.status}: ${errorText}`);
    }

    const evaluation = await response.json();

    console.log(`[Aggregator] Evaluator returned for ${result.job_id}:`, JSON.stringify(evaluation, null, 2));

    // Extract metrics from the nested structure
    // The evaluator should always return metrics now, but handle null case
    const evalMetrics = evaluation.metrics || {};
    
    // Log if metrics are missing (shouldn't happen after evaluator fix)
    if (!evaluation.metrics) {
      console.warn(`[Aggregator] Warning: evaluator returned null metrics for ${result.job_id}, status=${evaluation.status}`);
    }

    // Merge evaluation metrics into result
    return {
      ...result,
      metrics: {
        schema_valid: evalMetrics.schema_valid ?? null,
        completeness: evalMetrics.completeness ?? null,
        context_relevance: evalMetrics.context_relevance ?? null,
        faithfulness: evalMetrics.faithfulness ?? null,
        judge_score: evalMetrics.judge_score ?? null,
        judge_reasoning: evalMetrics.judge_reasoning ?? null,
        overall_score: evaluation.overall_score ?? null,
        flags: evaluation.flags ?? null,
      },
    };
  } catch (error) {
    console.error(`[Aggregator] Evaluator call failed:`, error.message);
    
    // Mark as evaluation failure but don't crash - still count as failed
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

  let evaluatedResult;

  try {
    // 1. Call evaluator to score the output (for successful LLM calls)
    evaluatedResult = await callEvaluator(result);
    console.log(`[Aggregator] Evaluated: ${evaluatedResult.status}${evaluatedResult.metrics ? `, score: ${evaluatedResult.metrics.overall_score?.toFixed(2)}` : ''}`);
  } catch (error) {
    console.error(`[Aggregator] Evaluator error for ${job_id}:`, error.message);
    evaluatedResult = {
      ...result,
      status: 'failed',
      failure_type: 'EVALUATOR_ERROR',
      error_message: error.message,
    };
  }

  try {
    // 2. Persist to database
    const persistence = await persistResult(evaluatedResult);
    console.log(`[Aggregator] Persisted to ${persistence.table}: ${persistence.id}`);
  } catch (error) {
    console.error(`[Aggregator] Persistence error for ${job_id}:`, error.message);
    // Continue anyway - we need to update progress even if persistence fails
  }

  try {
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
    console.error(`[Aggregator] Progress/Socket error for ${job_id}:`, error.message);
    // Don't re-throw - the result was processed, just tracking failed
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

  // Update run status and final job counts in database
  const updateSql = `
    UPDATE evaluation_runs
    SET status = $1, completed_at = NOW(), completed_jobs = $3, failed_jobs = $4
    WHERE id = $2
  `;
  
  await query(updateSql, [finalStatus, runId, progress.completed, progress.failed]);
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
