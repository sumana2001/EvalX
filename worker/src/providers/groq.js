/**
 * Groq Provider - Fast inference for Llama and Mixtral models.
 * 
 * FREE TIER: Get a free API key at https://console.groq.com (no credit card required)
 * Rate limit: ~30 requests/minute on free tier
 * 
 * Supported models:
 * - llama-3.3-70b-versatile
 * - llama-3.1-8b-instant
 * - llama-3.1-70b-versatile
 * - mixtral-8x7b-32768
 * - gemma2-9b-it
 * 
 * Docs: https://console.groq.com/docs/quickstart
 */

import Groq from 'groq-sdk';
import { BaseProvider, ProviderError } from './base.js';

// Model mappings (short name → full Groq model ID)
const MODEL_MAP = {
  'llama-3.3-70b': 'llama-3.3-70b-versatile',
  'llama-3.1-70b': 'llama-3.1-70b-versatile',
  'llama-3.1-8b': 'llama-3.1-8b-instant',
  'llama3-70b': 'llama-3.3-70b-versatile',
  'llama3-8b': 'llama-3.1-8b-instant',
  'mixtral-8x7b': 'mixtral-8x7b-32768',
  'gemma2-9b': 'gemma2-9b-it',
};

// Pricing per 1K tokens (USD) - Reference only, FREE TIER costs $0
const PRICING = {
  'llama-3.3-70b-versatile': { input: 0.00059, output: 0.00079 },
  'llama-3.1-70b-versatile': { input: 0.00059, output: 0.00079 },
  'llama-3.1-8b-instant': { input: 0.00005, output: 0.00008 },
  'mixtral-8x7b-32768': { input: 0.00024, output: 0.00024 },
  'gemma2-9b-it': { input: 0.00020, output: 0.00020 },
};

export class GroqProvider extends BaseProvider {
  constructor(apiKey) {
    super('groq');
    
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is required');
    }
    
    this.client = new Groq({ apiKey });
    this.supportedModels = new Set([
      ...Object.keys(MODEL_MAP),
      ...Object.values(MODEL_MAP),
    ]);
  }

  supportsModel(model) {
    return this.supportedModels.has(model);
  }

  getPricing(model) {
    const resolvedModel = MODEL_MAP[model] || model;
    return PRICING[resolvedModel] || null;
  }

  async complete(options) {
    const {
      model,
      prompt,
      systemPrompt = null,
      maxTokens = 2048,
      temperature = 0.7,
    } = options;

    // Resolve short model name to full Groq model ID
    const resolvedModel = MODEL_MAP[model] || model;

    // Build messages array
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const startTime = Date.now();

    try {
      const response = await this.client.chat.completions.create({
        model: resolvedModel,
        messages,
        max_tokens: maxTokens,
        temperature,
      });

      const latencyMs = Date.now() - startTime;
      const choice = response.choices[0];
      const usage = response.usage || {};

      return {
        content: choice.message.content,
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        latencyMs,
        model: resolvedModel,
        provider: this.name,
        finishReason: choice.finish_reason,
      };
    } catch (err) {
      throw this._handleError(err);
    }
  }

  _handleError(err) {
    // Groq SDK throws structured errors
    const statusCode = err.status || err.statusCode || null;
    
    // Rate limited (429)
    if (statusCode === 429) {
      return new ProviderError(
        `Groq rate limited: ${err.message}`,
        this.name,
        { statusCode, retryable: true, rateLimited: true, originalError: err }
      );
    }
    
    // Server errors (5xx) are retryable
    if (statusCode >= 500) {
      return new ProviderError(
        `Groq server error: ${err.message}`,
        this.name,
        { statusCode, retryable: true, originalError: err }
      );
    }
    
    // Client errors (4xx except 429) are not retryable
    if (statusCode >= 400) {
      return new ProviderError(
        `Groq client error: ${err.message}`,
        this.name,
        { statusCode, retryable: false, originalError: err }
      );
    }
    
    // Network/unknown errors are retryable
    return new ProviderError(
      `Groq error: ${err.message}`,
      this.name,
      { retryable: true, originalError: err }
    );
  }
}
