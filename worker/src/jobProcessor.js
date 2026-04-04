/**
 * Job Processor - Core logic for processing evaluation jobs.
 * 
 * Flow:
 * 1. Receive job from Kafka
 * 2. Format prompt with {{input}}, {{context}}
 * 3. Call LLM provider with retry
 * 4. Publish result to evaluation.results topic
 * 
 * The Python evaluator will consume from evaluation.results
 * and perform the heavy scoring (schema validation, RAG metrics, etc.)
 */

import { formatJobPrompt } from './lib/promptFormatter.js';
import { withProviderRetry } from './lib/retry.js';
import { completeWithProvider, estimateCost, ProviderError } from './providers/index.js';
import { publishResult } from './lib/kafka.js';

/**
 * Process a single evaluation job.
 * 
 * @param {object} job - Job message from Kafka
 */
export async function processJob(job) {
  const { job_id, run_id, task_item, prompt_variant, model, repetition_index, expected_schema } = job;

  const startTime = Date.now();
  let result;

  try {
    // 1. Format the prompt
    const formattedPrompt = formatJobPrompt(job);

    // 2. Call the LLM with retries
    const llmResponse = await withProviderRetry(
      () =>
        completeWithProvider({
          model,
          prompt: formattedPrompt,
          systemPrompt: prompt_variant.system_prompt || null,
          maxTokens: 2048,
          temperature: 0.7,
        }),
      {
        maxRetries: 3,
        onRetry: (err, attempt, delay) => {
          console.log(
            `[Job ${job_id}] Retry ${attempt} after ${err.message}. ` +
            `Waiting ${delay}ms...`
          );
        },
      }
    );

    const latencyMs = Date.now() - startTime;

    // 3. Estimate cost
    const costUsd = estimateCost(model, llmResponse.promptTokens, llmResponse.completionTokens);

    // 4. Build success result
    result = {
      job_id,
      run_id,
      task_item_id: task_item.id,
      prompt_variant_id: prompt_variant.id,
      model,
      repetition_index,
      status: 'success',
      raw_output: llmResponse.content,
      latency_ms: latencyMs,
      prompt_tokens: llmResponse.promptTokens,
      completion_tokens: llmResponse.completionTokens,
      total_tokens: llmResponse.totalTokens,
      estimated_cost_usd: costUsd,
      provider: llmResponse.provider,
      finish_reason: llmResponse.finishReason,
      // Include data needed for evaluation
      expected_schema,
      ground_truth: task_item.ground_truth,
      context: task_item.context,
      input: task_item.input,
      timestamp: new Date().toISOString(),
    };

    console.log(
      `[Job ${job_id}] Success: ${model} in ${latencyMs}ms, ` +
      `${llmResponse.totalTokens} tokens`
    );
  } catch (err) {
    const latencyMs = Date.now() - startTime;

    // Determine failure type
    let failureType = 'PROVIDER_ERROR';
    if (err.rateLimited) {
      failureType = 'RATE_LIMITED';
    } else if (err.message?.includes('timeout')) {
      failureType = 'TIMEOUT';
    }

    // Build failure result
    result = {
      job_id,
      run_id,
      task_item_id: task_item.id,
      prompt_variant_id: prompt_variant.id,
      model,
      repetition_index,
      status: 'failed',
      failure_type: failureType,
      error_message: err.message,
      error_stack: err.stack,
      latency_ms: latencyMs,
      provider: err.provider || 'unknown',
      timestamp: new Date().toISOString(),
    };

    console.error(`[Job ${job_id}] Failed: ${failureType} - ${err.message}`);

    // Re-throw if not retryable (will cause Kafka to redeliver)
    if (!err.retryable && !(err instanceof ProviderError)) {
      throw err;
    }
  }

  // 5. Publish result to Kafka (both success and handled failures)
  await publishResult(result);

  return result;
}

/**
 * Create a job processor with the given configuration.
 * Returns a function that can be passed to startConsuming().
 */
export function createJobProcessor(options = {}) {
  const { onSuccess, onFailure } = options;

  return async (job) => {
    const result = await processJob(job);

    if (result.status === 'success' && onSuccess) {
      await onSuccess(result);
    } else if (result.status === 'failed' && onFailure) {
      await onFailure(result);
    }

    return result;
  };
}
