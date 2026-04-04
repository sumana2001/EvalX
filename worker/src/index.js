import dotenv from 'dotenv';
import { initProviders, listProviders } from './providers/index.js';
import {
  initKafka,
  createConsumer,
  createProducer,
  subscribeToTasks,
  startConsuming,
  disconnect,
} from './lib/kafka.js';
import { createJobProcessor } from './jobProcessor.js';

dotenv.config();

console.log('[Worker] EvalX Worker starting...');

// Graceful shutdown
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[Worker] Received ${signal}. Shutting down gracefully...`);

  try {
    await disconnect();
    console.log('[Worker] Cleanup complete. Exiting.');
    process.exit(0);
  } catch (err) {
    console.error('[Worker] Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Main startup
async function main() {
  try {
    // 1. Initialize LLM providers
    initProviders();
    const activeProviders = listProviders();
    console.log(
      '[Worker] Active providers:',
      activeProviders.map((p) => p.name).join(', ') || 'none'
    );

    if (activeProviders.length === 0) {
      console.warn(
        '[Worker] WARNING: No LLM providers configured. ' +
        'Set GROQ_API_KEY, GEMINI_API_KEY, or ensure Ollama is running.'
      );
    }

    // 2. Initialize Kafka
    const { groupId } = initKafka();

    // 3. Create consumer and producer
    await createConsumer(groupId);
    await createProducer();

    // 4. Subscribe to tasks topic
    await subscribeToTasks();

    // 5. Create job processor
    const processor = createJobProcessor({
      onSuccess: (result) => {
        console.log(
          `[Worker] ✓ Job ${result.job_id} succeeded: ` +
          `${result.model} in ${result.latency_ms}ms`
        );
      },
      onFailure: (result) => {
        console.log(
          `[Worker] ✗ Job ${result.job_id} failed: ` +
          `${result.failure_type} - ${result.error_message}`
        );
      },
    });

    // 6. Start consuming
    console.log('[Worker] Ready! Waiting for jobs...');
    await startConsuming(processor);
  } catch (err) {
    console.error('[Worker] Failed to start:', err);
    process.exit(1);
  }
}

main();
