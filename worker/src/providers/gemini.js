/**
 * Gemini Provider - Google's Gemini models.
 * 
 * FREE TIER: Get a free API key at https://ai.google.dev (no credit card required)
 * Rate limit: ~15 requests/minute on free tier
 * 
 * Supported models:
 * - gemini-2.0-flash (latest free model)
 * - gemini-1.5-flash-latest
 * - gemini-1.5-pro-latest
 * 
 * Docs: https://ai.google.dev/gemini-api/docs
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseProvider, ProviderError } from './base.js';

// Model mappings (short name → full Gemini model ID)
const MODEL_MAP = {
  'gemini-2.0-flash': 'gemini-2.0-flash',
  'gemini-1.5-flash': 'gemini-1.5-flash-latest',
  'gemini-1.5-flash-latest': 'gemini-1.5-flash-latest',
  'gemini-1.5-pro': 'gemini-1.5-pro-latest',
  'gemini-1.5-pro-latest': 'gemini-1.5-pro-latest',
  'gemini-pro': 'gemini-1.5-pro-latest',
};

// Pricing per 1K tokens (USD) - Reference only, FREE TIER costs $0
const PRICING = {
  'gemini-2.0-flash': { input: 0.0, output: 0.0 },  // Free tier
  'gemini-1.5-flash-latest': { input: 0.000075, output: 0.0003 },
  'gemini-1.5-pro-latest': { input: 0.00125, output: 0.00500 },
};

export class GeminiProvider extends BaseProvider {
  constructor(apiKey) {
    super('gemini');
    
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required');
    }
    
    this.client = new GoogleGenerativeAI(apiKey);
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

    // Resolve short model name to full Gemini model ID
    const resolvedModel = MODEL_MAP[model] || model;

    const startTime = Date.now();

    try {
      // Get the generative model
      const genModel = this.client.getGenerativeModel({
        model: resolvedModel,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature,
        },
        ...(systemPrompt && {
          systemInstruction: systemPrompt,
        }),
      });

      const result = await genModel.generateContent(prompt);
      const response = await result.response;

      const latencyMs = Date.now() - startTime;
      const text = response.text();
      
      // Gemini doesn't always return token counts
      const usage = response.usageMetadata || {};

      return {
        content: text,
        promptTokens: usage.promptTokenCount || 0,
        completionTokens: usage.candidatesTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0,
        latencyMs,
        model: resolvedModel,
        provider: this.name,
        finishReason: response.candidates?.[0]?.finishReason || 'unknown',
      };
    } catch (err) {
      throw this._handleError(err);
    }
  }

  _handleError(err) {
    const message = err.message || String(err);
    
    // Rate limited
    if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
      return new ProviderError(
        `Gemini rate limited: ${message}`,
        this.name,
        { statusCode: 429, retryable: true, rateLimited: true, originalError: err }
      );
    }
    
    // Safety filter triggered
    if (message.includes('SAFETY') || message.includes('blocked')) {
      return new ProviderError(
        `Gemini content blocked: ${message}`,
        this.name,
        { retryable: false, originalError: err }
      );
    }
    
    // Server errors
    if (message.includes('500') || message.includes('503')) {
      return new ProviderError(
        `Gemini server error: ${message}`,
        this.name,
        { statusCode: 500, retryable: true, originalError: err }
      );
    }
    
    // Default: assume retryable network error
    return new ProviderError(
      `Gemini error: ${message}`,
      this.name,
      { retryable: true, originalError: err }
    );
  }
}
