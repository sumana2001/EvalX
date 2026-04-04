//Provider Registry - Routes model names to the correct LLM provider.

import { GroqProvider } from './groq.js';
import { GeminiProvider } from './gemini.js';
import { OllamaProvider } from './ollama.js';
import { ProviderError } from './base.js';

// Provider instances (lazy initialized)
let providers = null;

/**
 * Initialize all providers with API keys from environment.
 * Call this once at worker startup.
 */
export function initProviders(config = {}) {
  const {
    groqApiKey = process.env.GROQ_API_KEY,
    geminiApiKey = process.env.GEMINI_API_KEY,
    ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434',
  } = config;

  providers = {
    groq: groqApiKey ? new GroqProvider(groqApiKey) : null,
    gemini: geminiApiKey ? new GeminiProvider(geminiApiKey) : null,
    ollama: new OllamaProvider(ollamaHost),
  };

  // Log which providers are available
  const available = Object.entries(providers)
    .filter(([_, p]) => p !== null)
    .map(([name]) => name);
  
  console.log(`[Providers] Initialized: ${available.join(', ')}`);
  
  return providers;
}

/**
 * Model routing rules.
 * Maps model name patterns to provider names.
 */
const MODEL_ROUTES = [
  // Groq models (Llama, Mixtral)
  { pattern: /^llama/i, provider: 'groq' },
  { pattern: /^mixtral/i, provider: 'groq' },
  { pattern: /^gemma2-9b/i, provider: 'groq' },
  
  // Gemini models
  { pattern: /^gemini/i, provider: 'gemini' },
  
  // Ollama/local models
  { pattern: /^ollama\//i, provider: 'ollama' },
  { pattern: /^local\//i, provider: 'ollama' },
];

/**
 * Get the provider instance for a given model.
 * 
 * @param {string} model - Model identifier
 * @returns {BaseProvider}
 * @throws {ProviderError} If no provider found or provider not configured
 */
export function getProvider(model) {
  if (!providers) {
    throw new Error('Providers not initialized. Call initProviders() first.');
  }

  // Find matching route
  for (const route of MODEL_ROUTES) {
    if (route.pattern.test(model)) {
      const provider = providers[route.provider];
      
      if (!provider) {
        throw new ProviderError(
          `Provider '${route.provider}' required for model '${model}' but not configured. ` +
          `Set ${route.provider.toUpperCase()}_API_KEY environment variable.`,
          route.provider,
          { retryable: false }
        );
      }
      
      return provider;
    }
  }

  // No route matched - try each provider
  for (const [name, provider] of Object.entries(providers)) {
    if (provider && provider.supportsModel(model)) {
      return provider;
    }
  }

  throw new ProviderError(
    `No provider found for model '${model}'. Supported patterns: ` +
    MODEL_ROUTES.map((r) => r.pattern.source).join(', '),
    'registry',
    { retryable: false }
  );
}

/**
 * Convenience function: Get provider and complete in one call.
 * 
 * @param {object} options - Same as BaseProvider.complete()
 * @returns {Promise<object>} - Completion result
 */
export async function completeWithProvider(options) {
  const provider = getProvider(options.model);
  return provider.complete(options);
}

/**
 * Get pricing for a model.
 * 
 * @param {string} model - Model identifier
 * @returns {{ input: number, output: number } | null}
 */
export function getPricing(model) {
  try {
    const provider = getProvider(model);
    return provider.getPricing(model);
  } catch {
    return null;
  }
}

/**
 * Calculate estimated cost for a completion.
 * 
 * @param {string} model - Model identifier
 * @param {number} promptTokens - Input token count
 * @param {number} completionTokens - Output token count
 * @returns {number | null} - Cost in USD, or null if pricing unknown
 */
export function estimateCost(model, promptTokens, completionTokens) {
  const pricing = getPricing(model);
  if (!pricing) return null;
  
  const inputCost = (promptTokens / 1000) * pricing.input;
  const outputCost = (completionTokens / 1000) * pricing.output;
  
  return inputCost + outputCost;
}

/**
 * List all available providers (configured with API keys).
 */
export function listProviders() {
  if (!providers) {
    return [];
  }
  
  return Object.entries(providers)
    .filter(([_, p]) => p !== null)
    .map(([name, provider]) => ({
      name,
      type: provider.constructor.name,
    }));
}

export { ProviderError };
