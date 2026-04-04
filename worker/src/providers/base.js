/**
 * Base Provider Interface.
 * All LLM providers must extend this class.
 * 
 * Why an abstract base?
 * - Enforces consistent interface across providers
 * - Easier to add new providers (just extend and implement)
 * - Allows provider-specific error handling while maintaining consistency
 */

export class BaseProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Complete a prompt using the LLM.
   * 
   * @param {object} options
   * @param {string} options.model - Model identifier (e.g., "llama-3.3-70b")
   * @param {string} options.prompt - User prompt (already formatted with {{input}}, {{context}} substituted)
   * @param {string} [options.systemPrompt] - Optional system prompt
   * @param {number} [options.maxTokens=2048] - Maximum tokens to generate
   * @param {number} [options.temperature=0.7] - Sampling temperature
   * 
   * @returns {Promise<{
   *   content: string,
   *   promptTokens: number,
   *   completionTokens: number,
   *   totalTokens: number,
   *   latencyMs: number,
   *   model: string,
   *   provider: string
   * }>}
   */
  async complete(options) {
    throw new Error(`Provider ${this.name} must implement complete()`);
  }

  /**
   * Check if this provider supports a given model.
   * 
   * @param {string} model - Model identifier
   * @returns {boolean}
   */
  supportsModel(model) {
    throw new Error(`Provider ${this.name} must implement supportsModel()`);
  }

  /**
   * Get estimated cost per 1K tokens for a model.
   * Returns null if pricing is unknown.
   * 
   * @param {string} model - Model identifier
   * @returns {{ input: number, output: number } | null} - Cost per 1K tokens in USD
   */
  getPricing(model) {
    return null;
  }
}

/**
 * Standard error class for provider errors.
 * Includes retry eligibility flag.
 */
export class ProviderError extends Error {
  constructor(message, provider, options = {}) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.statusCode = options.statusCode || null;
    this.retryable = options.retryable ?? false;
    this.rateLimited = options.rateLimited ?? false;
    this.originalError = options.originalError || null;
  }
}
