/**
 * Result Persistence - Insert evaluation results into PostgreSQL.
 * 
 * Handles both:
 * - Successful results → execution_results table
 * - Failed results → evaluation_failures table
 */

import { query, getClient } from '../lib/db.js';

/**
 * Insert a successful evaluation result.
 * 
 * @param {Object} result - Evaluation result from Kafka
 * @returns {Promise<Object>} Inserted row
 */
export async function insertExecutionResult(result) {
  const sql = `
    INSERT INTO execution_results (
      run_id,
      task_item_id,
      prompt_variant_id,
      model,
      repetition_index,
      raw_output,
      schema_valid,
      completeness,
      context_relevance,
      faithfulness,
      judge_score,
      metrics,
      latency_ms,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      estimated_cost_usd,
      executed_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW()
    )
    RETURNING id, executed_at
  `;

  const metrics = result.metrics || {};
  
  const params = [
    result.run_id,
    result.task_item_id,
    result.prompt_variant_id,
    result.model,
    result.repetition_index || 1,
    result.raw_output,
    metrics.schema_valid ?? null,
    metrics.completeness ?? null,
    metrics.context_relevance ?? null,
    metrics.faithfulness ?? null,
    metrics.judge_score ?? null,
    JSON.stringify({
      judge_reasoning: metrics.judge_reasoning,
      // Store any additional metrics that may be added later
    }),
    result.latency_ms ?? null,
    result.prompt_tokens ?? null,
    result.completion_tokens ?? null,
    result.total_tokens ?? null,
    result.estimated_cost_usd ?? null,
  ];

  const { rows } = await query(sql, params);
  return rows[0];
}

// Valid failure_type enum values in the database
const VALID_FAILURE_TYPES = new Set([
  'SCHEMA_VIOLATION',
  'INCOMPLETE_OUTPUT',
  'HALLUCINATION_DETECTED',
  'LOW_QUALITY',
  'TIMEOUT',
  'PROVIDER_ERROR',
  'EVALUATOR_ERROR',
]);

/**
 * Normalize failure type to a valid database enum value.
 * Maps unknown types (like RATE_LIMITED) to appropriate valid values.
 */
function normalizeFailureType(failureType) {
  if (!failureType) return 'EVALUATOR_ERROR';
  if (VALID_FAILURE_TYPES.has(failureType)) return failureType;
  
  // Map common unknown types to valid enum values
  const typeMapping = {
    'RATE_LIMITED': 'PROVIDER_ERROR',
    'PARSE_ERROR': 'SCHEMA_VIOLATION',
    'LOW_SIMILARITY': 'LOW_QUALITY',
    'LOW_FAITHFULNESS': 'HALLUCINATION_DETECTED',
  };
  
  return typeMapping[failureType] || 'PROVIDER_ERROR';
}

/**
 * Insert a failed evaluation into the failures table.
 * 
 * @param {Object} result - Failed evaluation result from Kafka
 * @returns {Promise<Object>} Inserted row
 */
export async function insertEvaluationFailure(result) {
  const sql = `
    INSERT INTO evaluation_failures (
      run_id,
      task_item_id,
      prompt_variant_id,
      model,
      repetition_index,
      failure_type,
      error_message,
      raw_output,
      retry_count
    ) VALUES (
      $1, $2, $3, $4, $5, $6::failure_type, $7, $8, $9
    )
    RETURNING id, created_at
  `;

  // Normalize failure type to valid enum
  const normalizedType = normalizeFailureType(result.failure_type);
  
  // Include original failure type in error message if it was normalized
  let errorMessage = result.failure_reason || result.error_message || 'Unknown error';
  if (result.failure_type && result.failure_type !== normalizedType) {
    errorMessage = `[${result.failure_type}] ${errorMessage}`;
  }

  const params = [
    result.run_id,
    result.task_item_id,
    result.prompt_variant_id,
    result.model,
    result.repetition_index || 1,
    normalizedType,
    errorMessage,
    result.raw_output ?? null,
    result.retry_count || 0,
  ];

  console.log(`[Persistence] Inserting failure: type=${normalizedType}, message=${errorMessage.slice(0, 100)}...`);

  const { rows } = await query(sql, params);
  return rows[0];
}

/**
 * Persist an evaluation result (routes to success or failure table).
 * 
 * @param {Object} result - Evaluation result from Kafka
 * @returns {Promise<{success: boolean, id: string, table: string}>}
 */
export async function persistResult(result) {
  const isSuccess = result.status === 'success';

  if (isSuccess) {
    const inserted = await insertExecutionResult(result);
    return {
      success: true,
      id: inserted.id,
      table: 'execution_results',
    };
  } else {
    const inserted = await insertEvaluationFailure(result);
    return {
      success: false,
      id: inserted.id,
      table: 'evaluation_failures',
    };
  }
}

/**
 * Batch insert multiple results in a transaction.
 * More efficient for high-throughput scenarios.
 * 
 * @param {Array<Object>} results - Array of evaluation results
 * @returns {Promise<{successes: number, failures: number}>}
 */
export async function persistResultsBatch(results) {
  const client = await getClient();
  
  let successes = 0;
  let failures = 0;

  try {
    await client.query('BEGIN');

    for (const result of results) {
      try {
        if (result.status === 'success') {
          await insertExecutionResultWithClient(client, result);
          successes++;
        } else {
          await insertEvaluationFailureWithClient(client, result);
          failures++;
        }
      } catch (error) {
        console.error(`[Persistence] Error inserting result ${result.job_id}:`, error.message);
        // Continue with other results
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { successes, failures };
}

/**
 * Insert execution result using a specific client (for transactions).
 */
async function insertExecutionResultWithClient(client, result) {
  const sql = `
    INSERT INTO execution_results (
      run_id, task_item_id, prompt_variant_id, model, repetition_index,
      raw_output, schema_valid, completeness, context_relevance, faithfulness,
      judge_score, metrics, latency_ms, prompt_tokens, completion_tokens,
      total_tokens, estimated_cost_usd, executed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
  `;

  const metrics = result.metrics || {};
  
  await client.query(sql, [
    result.run_id,
    result.task_item_id,
    result.prompt_variant_id,
    result.model,
    result.repetition_index || 1,
    result.raw_output,
    metrics.schema_valid ?? null,
    metrics.completeness ?? null,
    metrics.context_relevance ?? null,
    metrics.faithfulness ?? null,
    metrics.judge_score ?? null,
    JSON.stringify({ judge_reasoning: metrics.judge_reasoning }),
    result.latency_ms ?? null,
    result.prompt_tokens ?? null,
    result.completion_tokens ?? null,
    result.total_tokens ?? null,
    result.estimated_cost_usd ?? null,
  ]);
}

/**
 * Insert evaluation failure using a specific client (for transactions).
 */
async function insertEvaluationFailureWithClient(client, result) {
  // Normalize failure type to valid enum
  const normalizedType = normalizeFailureType(result.failure_type);
  
  // Include original failure type in error message if it was normalized
  let errorMessage = result.failure_reason || result.error_message || 'Unknown error';
  if (result.failure_type && result.failure_type !== normalizedType) {
    errorMessage = `[${result.failure_type}] ${errorMessage}`;
  }

  const sql = `
    INSERT INTO evaluation_failures (
      run_id, task_item_id, prompt_variant_id, model, repetition_index,
      failure_type, error_message, raw_output, retry_count
    ) VALUES ($1, $2, $3, $4, $5, $6::failure_type, $7, $8, $9)
  `;

  await client.query(sql, [
    result.run_id,
    result.task_item_id,
    result.prompt_variant_id,
    result.model,
    result.repetition_index || 1,
    normalizedType,
    errorMessage,
    result.raw_output ?? null,
    result.retry_count || 0,
  ]);
}
