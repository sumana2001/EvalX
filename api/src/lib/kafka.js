/**
 * Kafka client using KafkaJS (compatible with Redpanda).
 * 
 * Why KafkaJS?
 * - Pure JavaScript, no native dependencies
 * - Built-in retry logic and connection management
 * - Works with Redpanda without configuration changes
 * 
 * Topics:
 * - evaluation.tasks: Jobs to be processed by workers
 * - evaluation.results: Completed job results from workers
 */

import { Kafka, Partitioners } from 'kafkajs';
import { config } from './config.js';

// Create Kafka instance
const kafka = new Kafka({
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

// Producer instance (singleton)
let producer = null;
let isProducerConnected = false;

// Topic names
export const TOPICS = {
  EVALUATION_TASKS: 'evaluation.tasks',
  EVALUATION_RESULTS: 'evaluation.results',
};

// ============================================================
// Producer Functions
// ============================================================

/**
 * Connect the Kafka producer.
 * Call this during application startup.
 */
export async function connectProducer() {
  if (isProducerConnected) {
    return;
  }

  producer = kafka.producer({
    // Use legacy partitioner for compatibility
    createPartitioner: Partitioners.LegacyPartitioner,
    // Batch settings for high throughput
    allowAutoTopicCreation: true,
  });

  producer.on('producer.connect', () => {
    console.log('[Kafka] Producer connected');
    isProducerConnected = true;
  });

  producer.on('producer.disconnect', () => {
    console.log('[Kafka] Producer disconnected');
    isProducerConnected = false;
  });

  await producer.connect();
}

/**
 * Disconnect the Kafka producer.
 * Call this on graceful shutdown.
 */
export async function disconnectProducer() {
  if (producer && isProducerConnected) {
    console.log('[Kafka] Disconnecting producer...');
    await producer.disconnect();
    isProducerConnected = false;
  }
}

/**
 * Send a single message to a topic.
 * 
 * @param {string} topic - Topic name
 * @param {object} message - Message payload (will be JSON stringified)
 * @param {string} [key] - Optional partition key (e.g., run_id for ordering)
 */
export async function sendMessage(topic, message, key = null) {
  if (!isProducerConnected) {
    throw new Error('Kafka producer not connected');
  }

  await producer.send({
    topic,
    messages: [
      {
        key: key ? String(key) : null,
        value: JSON.stringify(message),
        timestamp: Date.now().toString(),
      },
    ],
  });
}

/**
 * Send multiple messages to a topic in a single batch.
 * Much more efficient for fan-out (thousands of messages).
 * 
 * @param {string} topic - Topic name
 * @param {Array<{message: object, key?: string}>} messages - Array of messages
 */
export async function sendBatch(topic, messages) {
  if (!isProducerConnected) {
    throw new Error('Kafka producer not connected');
  }

  const kafkaMessages = messages.map((m) => ({
    key: m.key ? String(m.key) : null,
    value: JSON.stringify(m.message),
    timestamp: Date.now().toString(),
  }));

  await producer.send({
    topic,
    messages: kafkaMessages,
  });

  return kafkaMessages.length;
}

/**
 * Health check for Kafka producer.
 */
export async function healthCheck() {
  return isProducerConnected;
}

// ============================================================
// Admin Functions (Topic Management)
// ============================================================

/**
 * Ensure required topics exist.
 * Call this during startup.
 */
export async function ensureTopics() {
  const admin = kafka.admin();

  try {
    await admin.connect();

    const existingTopics = await admin.listTopics();
    const topicsToCreate = [];

    for (const topic of Object.values(TOPICS)) {
      if (!existingTopics.includes(topic)) {
        topicsToCreate.push({
          topic,
          numPartitions: 6, // Allow parallel consumption
          replicationFactor: 1, // Single node in dev
        });
      }
    }

    if (topicsToCreate.length > 0) {
      await admin.createTopics({ topics: topicsToCreate });
      console.log('[Kafka] Created topics:', topicsToCreate.map((t) => t.topic).join(', '));
    } else {
      console.log('[Kafka] All topics already exist');
    }
  } finally {
    await admin.disconnect();
  }
}

export { kafka };
