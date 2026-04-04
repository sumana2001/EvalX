import dotenv from 'dotenv';
import { initProviders, listProviders, completeWithProvider } from './providers/index.js';

dotenv.config();

console.log('[Worker] EvalX Worker starting...');

// Initialize LLM providers
initProviders();

// List active providers
const activeProviders = listProviders();
console.log('[Worker] Active providers:', activeProviders.map((p) => p.name).join(', ') || 'none');

// Quick test function (can be called manually)
export async function testProvider(model = 'llama-3.3-70b') {
  console.log(`[Worker] Testing provider for model: ${model}`);

  try {
    const result = await completeWithProvider({
      model,
      prompt: 'What is 2+2? Reply with just the number.',
      maxTokens: 10,
      temperature: 0,
    });

    console.log('[Worker] Test result:', {
      content: result.content.trim(),
      tokens: result.totalTokens,
      latency: `${result.latencyMs}ms`,
      provider: result.provider,
    });

    return result;
  } catch (err) {
    console.error('[Worker] Test failed:', err.message);
    throw err;
  }
}

console.log('[Worker] Waiting for Kafka consumer implementation.');

// Placeholder - Kafka consumer will be implemented next
