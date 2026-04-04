/**
 * Ollama Provider - Local LLM inference.
 * 
 * 100% FREE - Runs entirely locally, no API keys or accounts needed.
 * Install: brew install ollama (macOS) or see https://ollama.ai
 * Pull a model: ollama pull llama3
 * 
 * Supports any model available in your local Ollama installation.
 * Common models: llama3, mistral, codellama, phi, etc.
 * 
 * Docs: https://ollama.ai/
 */

import { Ollama } from 'ollama';
import { BaseProvider, ProviderError } from './base.js';

// Common Ollama model prefixes
const OLLAMA_PREFIXES = [
  'ollama/',
  'local/',
  'llama3:',
  'mistral:',
  'codellama:',
  'phi:',
  'gemma:',
  'qwen:',
];

export class OllamaProvider extends BaseProvider {
  constructor(host = 'http://localhost:11434') {
    super('ollama');
    
    this.client = new Ollama({ host });
    this.host = host;
  }

  supportsModel(model) {
    // Ollama supports any model with ollama/ or local/ prefix
    // or known Ollama model names
    const lowerModel = model.toLowerCase();
    
    // Explicit Ollama prefix
    if (OLLAMA_PREFIXES.some((prefix) => lowerModel.startsWith(prefix))) {
      return true;
    }
    
    // Could also check with Ollama API, but that's async
    // For now, we'll accept models that look like Ollama models
    return false;
  }

  /**
   * Normalize model name for Ollama.
   * Strips prefixes like "ollama/" or "local/".
   */
  _normalizeModel(model) {
    let normalized = model;
    
    // Remove common prefixes
    if (normalized.startsWith('ollama/')) {
      normalized = normalized.slice(7);
    } else if (normalized.startsWith('local/')) {
      normalized = normalized.slice(6);
    }
    
    return normalized;
  }

  getPricing(model) {
    // Ollama is 100% free (local inference, no API costs)
    return { input: 0, output: 0 };
  }

  async complete(options) {
    const {
      model,
      prompt,
      systemPrompt = null,
      maxTokens = 2048,
      temperature = 0.7,
    } = options;

    const normalizedModel = this._normalizeModel(model);
    const startTime = Date.now();

    try {
      // Build messages array (Ollama uses chat format)
      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      const response = await this.client.chat({
        model: normalizedModel,
        messages,
        options: {
          num_predict: maxTokens,
          temperature,
        },
      });

      const latencyMs = Date.now() - startTime;

      return {
        content: response.message.content,
        promptTokens: response.prompt_eval_count || 0,
        completionTokens: response.eval_count || 0,
        totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
        latencyMs,
        model: normalizedModel,
        provider: this.name,
        finishReason: response.done ? 'stop' : 'length',
      };
    } catch (err) {
      throw this._handleError(err);
    }
  }

  _handleError(err) {
    const message = err.message || String(err);
    
    // Connection refused (Ollama not running)
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return new ProviderError(
        `Ollama not reachable at ${this.host}. Is Ollama running?`,
        this.name,
        { retryable: true, originalError: err }
      );
    }
    
    // Model not found
    if (message.includes('not found') || message.includes('pull')) {
      return new ProviderError(
        `Ollama model not found: ${message}. Run 'ollama pull <model>' first.`,
        this.name,
        { retryable: false, originalError: err }
      );
    }
    
    // Default: retryable
    return new ProviderError(
      `Ollama error: ${message}`,
      this.name,
      { retryable: true, originalError: err }
    );
  }
}
