/**
 * Kafka Consumer for the Worker.
 * Consumes jobs from `evaluation.tasks` topic.
 */

import { Kafka } from 'kafkajs';

// Topics
export const TOPICS = {
  EVALUATION_TASKS: 'evaluation.tasks',
  EVALUATION_RESULTS: 'evaluation.results',
};

// Kafka instance (singleton)
let kafka = null;
let consumer = null;
let producer = null;

/**
 * Initialize Kafka client.
 */
export function initKafka(config = {}) {
  const brokers = config.brokers || process.env.KAFKA_BROKERS?.split(',') || ['localhost:19092'];
  const clientId = config.clientId || process.env.KAFKA_CLIENT_ID || 'evalx-worker';
  const groupId = config.groupId || process.env.KAFKA_GROUP_ID || 'evalx-workers';

  kafka = new Kafka({
    clientId,
    brokers,
    retry: {
      initialRetryTime: 300,
      retries: 10,
    },
  });

  console.log(`[Kafka] Initialized with brokers: ${brokers.join(', ')}`);

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
    // Process one message at a time for better error handling
    maxWaitTimeInMs: 1000,
    // Don't auto-commit - we'll commit after successful processing
    autoCommit: false,
  });

  await consumer.connect();
  console.log(`[Kafka] Consumer connected (group: ${groupId})`);

  return consumer;
}

/**
 * Create and connect the producer (for publishing results).
 */
export async function createProducer() {
  if (!kafka) {
    throw new Error('Kafka not initialized. Call initKafka() first.');
  }

  producer = kafka.producer();
  await producer.connect();
  console.log('[Kafka] Producer connected');

  return producer;
}

/**
 * Subscribe to the evaluation tasks topic.
 */
export async function subscribeToTasks() {
  if (!consumer) {
    throw new Error('Consumer not created. Call createConsumer() first.');
  }

  await consumer.subscribe({
    topic: TOPICS.EVALUATION_TASKS,
    fromBeginning: false, // Only process new messages
  });

  console.log(`[Kafka] Subscribed to ${TOPICS.EVALUATION_TASKS}`);
}

/**
 * Start consuming messages with the provided handler.
 * 
 * @param {Function} handler - async function(job) that processes each job
 */
export async function startConsuming(handler) {
  if (!consumer) {
    throw new Error('Consumer not created. Call createConsumer() first.');
  }

  await consumer.run({
    // Process messages one at a time
    eachMessage: async ({ topic, partition, message }) => {
      const startTime = Date.now();

      try {
        const job = JSON.parse(message.value.toString());

        console.log(`[Kafka] Processing job ${job.job_id} (model: ${job.model})`);

        // Process the job
        await handler(job);

        // Commit offset after successful processing
        await consumer.commitOffsets([
          {
            topic,
            partition,
            offset: (BigInt(message.offset) + 1n).toString(),
          },
        ]);

        const duration = Date.now() - startTime;
        console.log(`[Kafka] Job ${job.job_id} completed in ${duration}ms`);
      } catch (err) {
        console.error(`[Kafka] Error processing message:`, err.message);
        // Don't commit - message will be redelivered
        // In production, you'd want a dead-letter queue after N retries
        throw err;
      }
    },
  });
}

/**
 * Publish a result to the results topic.
 */
export async function publishResult(result) {
  if (!producer) {
    throw new Error('Producer not created. Call createProducer() first.');
  }

  await producer.send({
    topic: TOPICS.EVALUATION_RESULTS,
    messages: [
      {
        key: result.run_id,
        value: JSON.stringify(result),
        timestamp: Date.now().toString(),
      },
    ],
  });
}

/**
 * Graceful shutdown.
 */
export async function disconnect() {
  if (consumer) {
    console.log('[Kafka] Disconnecting consumer...');
    await consumer.disconnect();
  }
  if (producer) {
    console.log('[Kafka] Disconnecting producer...');
    await producer.disconnect();
  }
  console.log('[Kafka] Disconnected');
}
