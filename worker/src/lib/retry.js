/**
 * Retry mechanism with exponential backoff.
 * 
 * Handles rate limits (429) and transient errors gracefully.
 * 
 * Backoff formula: min(baseDelay * 2^attempt, maxDelay) + jitter
 */

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG = {
  maxRetries: 5,
  baseDelayMs: 1000,    // Start with 1 second
  maxDelayMs: 30000,    // Cap at 30 seconds
  jitterFactor: 0.2,    // Add up to 20% random jitter
};

/**
 * Sleep for a specified duration.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter.
 * 
 * @param {number} attempt - Current attempt (0-indexed)
 * @param {object} config - Retry configuration
 * @returns {number} - Delay in milliseconds
 */
export function calculateBackoff(attempt, config = DEFAULT_RETRY_CONFIG) {
  // Exponential: baseDelay * 2^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter (random factor to prevent thundering herd)
  const jitter = cappedDelay * config.jitterFactor * Math.random();

  return Math.floor(cappedDelay + jitter);
}

/**
 * Execute a function with retries.
 * 
 * @param {Function} fn - Async function to execute
 * @param {object} options - Retry options
 * @param {Function} options.shouldRetry - (error) => boolean, determines if error is retryable
 * @param {Function} options.onRetry - (error, attempt, delay) => void, called before each retry
 * @param {object} options.config - Retry configuration
 * @returns {Promise<any>} - Result of the function
 */
export async function withRetry(fn, options = {}) {
  const {
    shouldRetry = (err) => err.retryable === true,
    onRetry = () => {},
    config = DEFAULT_RETRY_CONFIG,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Check if we should retry
      if (attempt >= config.maxRetries || !shouldRetry(err)) {
        throw err;
      }

      // Calculate backoff delay
      const delay = calculateBackoff(attempt, config);

      // Special handling for rate limits - use server's retry-after if available
      const retryAfter = err.retryAfter || err.headers?.['retry-after'];
      const actualDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;

      // Notify about retry
      onRetry(err, attempt + 1, actualDelay);

      console.log(
        `[Retry] Attempt ${attempt + 1}/${config.maxRetries} failed: ${err.message}. ` +
        `Retrying in ${actualDelay}ms...`
      );

      // Wait before retrying
      await sleep(actualDelay);
    }
  }

  throw lastError;
}

/**
 * Pre-configured retry for LLM provider calls.
 * Retries on rate limits (429) and server errors (5xx).
 */
export async function withProviderRetry(fn, options = {}) {
  return withRetry(fn, {
    shouldRetry: (err) => {
      // Check our custom retryable flag
      if (err.retryable === true) return true;

      // Check HTTP status codes
      const status = err.statusCode || err.status;
      if (status === 429) return true; // Rate limited
      if (status >= 500 && status < 600) return true; // Server error

      return false;
    },
    config: {
      ...DEFAULT_RETRY_CONFIG,
      maxRetries: options.maxRetries || 5,
    },
    onRetry: options.onRetry,
  });
}
