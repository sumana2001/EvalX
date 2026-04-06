/**
 * Aggregator - Kafka Consumer for evaluation results.
 * 
 * Consumes from `evaluation.results` topic and:
 * 1. Persists successful results to `execution_results` table
 * 2. Persists failures to `evaluation_failures` table
 * 3. Updates Redis counters for run progress
 * 4. Emits Socket.io events for real-time UI updates
 */

import { Kafka } from 'kafkajs';

// Topics
export const TOPICS = {
  EVALUATION_RESULTS: 'evaluation.results',
};

// Kafka instance (singleton)
let kafka = null;
let consumer = null;

/**
 * Initialize Kafka client for the aggregator.
 */
export function initKafka(config = {}) {
  const brokers = config.brokers || process.env.KAFKA_BROKERS?.split(',') || ['localhost:19092'];
  const clientId = config.clientId || 'evalx-aggregator';
  const groupId = config.groupId || 'evalx-aggregators';

  kafka = new Kafka({
    clientId,
    brokers,
    retry: {
      initialRetryTime: 300,
      retries: 10,
    },
  });

  console.log(`[Aggregator Kafka] Initialized with brokers: ${brokers.join(', ')}`);

  return { kafka, groupId };
}

/**
 * Create and connect the consumer.
 */
export async function createConsumer(groupId) {
  if (!kafka) {
    throw new Error('Kafka not initialized. Call initKafka() first.');
  }

  consumer = kafka.consumer({
    groupId,
    maxWaitTimeInMs: 1000,
    // Don't auto-commit - we'll commit after successful processing
    autoCommit: false,
  });

  await consumer.connect();
  console.log(`[Aggregator Kafka] Consumer connected (group: ${groupId})`);

  return consumer;
}

/**
 * Subscribe to the evaluation results topic.
 */
export async function subscribeToResults() {
  if (!consumer) {
    throw new Error('Consumer not created. Call createConsumer() first.');
  }

  await consumer.subscribe({
    topic: TOPICS.EVALUATION_RESULTS,
    fromBeginning: false, // Only process new messages
  });

  console.log(`[Aggregator Kafka] Subscribed to ${TOPICS.EVALUATION_RESULTS}`);
}

/**
 * Start consuming messages with provided handler.
 * 
 * @param {Function} handler - Async function (message) => void
 */
export async function startConsuming(handler) {
  if (!consumer) {
    throw new Error('Consumer not created. Call createConsumer() first.');
  }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const value = message.value?.toString();
      
      if (!value) {
        console.warn('[Aggregator] Received empty message, skipping');
        return;
      }

      try {
        const result = JSON.parse(value);
        
        // Process the result
        await handler(result);
        
        // Commit offset after successful processing
        await consumer.commitOffsets([{
          topic,
          partition,
          offset: (BigInt(message.offset) + 1n).toString(),
        }]);
        
      } catch (error) {
        console.error('[Aggregator] Error processing message:', error);
        // Don't commit - message will be reprocessed
        // In production, implement dead-letter queue after N retries
      }
    },
  });

  console.log('[Aggregator Kafka] Consumer started');
}

/**
 * Graceful shutdown.
 */
export async function disconnect() {
  if (consumer) {
    await consumer.disconnect();
    console.log('[Aggregator Kafka] Consumer disconnected');
  }
}

/**
 * Get current consumer instance.
 */
export function getConsumer() {
  return consumer;
}
