import type {
  EmbeddingConfig,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingMetrics,
  ComplexityTier,
} from './config/types.js';
import { getProviderForModel, getModelForTier } from './config/config.js';
import { ComplexityClassifier } from './classifier/complexity.js';
import { EmbeddingCache } from './cache/embedding-cache.js';
import { EmbeddingMetricsTracker } from './metrics/embedding-metrics.js';
import { AnthropicProvider, OpenRouterProvider } from './providers/index.js';
import type { EmbeddingProvider } from './providers/index.js';

/**
 * Configuration for EmbeddingRouter
 */
export interface EmbeddingRouterConfig {
  config: EmbeddingConfig;
  apiKeys: {
    anthropic?: string;
    openrouter?: string;
  };
}

/**
 * Main embedding router - orchestrates complexity classification,
 * caching, provider selection, and metrics tracking
 */
export class EmbeddingRouter {
  private config: EmbeddingConfig;
  private cache: EmbeddingCache;
  private metrics: EmbeddingMetricsTracker;
  private providers: Map<string, EmbeddingProvider>;
  private classifier: ComplexityClassifier;
  private maxRetries: number;
  private baseDelayMs: number;
  private timeoutMs: number;

  constructor(options: EmbeddingRouterConfig) {
    this.config = options.config;
    this.cache = new EmbeddingCache(options.config.caching);
    this.metrics = new EmbeddingMetricsTracker(options.config.metrics);

    // Configure classifier with custom thresholds
    this.classifier = new ComplexityClassifier(options.config.classifier);

    // Configure retry settings
    this.maxRetries = options.config.retry?.maxRetries ?? 3;
    this.baseDelayMs = options.config.retry?.baseDelayMs ?? 1000;
    this.timeoutMs = options.config.retry?.timeoutMs ?? 30000;

    // Initialize providers
    this.providers = new Map();
    if (options.apiKeys.anthropic) {
      this.providers.set('anthropic', new AnthropicProvider(options.apiKeys.anthropic));
    }
    if (options.apiKeys.openrouter) {
      this.providers.set('openrouter', new OpenRouterProvider(options.apiKeys.openrouter));
    }
  }

  /**
   * Helper method to embed with retry logic and timeout
   *
   * @param provider - Provider instance
   * @param providerName - Provider name for error messages
   * @param text - Text to embed
   * @param model - Model to use
   * @returns Embedding result
   * @private
   */
  private async embedWithRetry(
    provider: EmbeddingProvider,
    providerName: string,
    text: string,
    model: string,
  ): Promise<{ embedding: number[] }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Wrap in timeout
        const embedPromise = provider.embed(text, model);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Timeout after ${this.timeoutMs}ms`));
          }, this.timeoutMs);
        });

        const result = await Promise.race([embedPromise, timeoutPromise]);
        return result;
      } catch (error) {
        lastError = error as Error;

        // Check if it's a client error (4xx) - don't retry
        const is4xxError = lastError.message.match(/\b4\d{2}\b/);
        if (is4xxError) {
          throw new Error(`${providerName} client error: ${lastError.message}`);
        }

        // Last attempt - throw with context
        if (attempt === this.maxRetries - 1) {
          throw new Error(
            `${providerName} failed after ${this.maxRetries} attempts: ${lastError.message}`,
          );
        }

        // Calculate delay with exponential backoff
        const delay = this.baseDelayMs * Math.pow(2, attempt);

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Should never reach here, but TypeScript needs it
    throw new Error(
      `${providerName} failed after ${this.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
    );
  }

  /**
   * Route an embedding request to the appropriate model
   *
   * @param request - Embedding request
   * @returns Embedding response with metadata
   *
   * @example
   * ```ts
   * const result = await router.route({
   *   text: 'Hello world',
   *   options: { tier: 'simple' }
   * });
   * console.log(result.embedding, result.model, result.cached);
   * ```
   */
  async route(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const startTime = Date.now();

    // Determine complexity tier
    let tier: ComplexityTier;
    if (request.options?.tier) {
      tier = request.options.tier;
    } else {
      tier = this.classifier.classify(request.text);
    }

    // Determine model
    let model: string;
    if (request.options?.modelHint) {
      model = request.options.modelHint;
    } else {
      model = getModelForTier(tier, this.config);
    }

    // Determine provider
    const providerName = getProviderForModel(model, this.config);
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider ${providerName} not configured`);
    }

    // Check cache
    const cacheKey = EmbeddingCache.generateKey(request.text, model);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      const durationMs = Date.now() - startTime;

      // Track metrics for cached hit
      this.metrics.recordRequest(model, tier, 0, durationMs, true);

      return {
        embedding: cached.embedding,
        model,
        cached: true,
        tier,
        provider: providerName,
        cost: 0,
        durationMs,
      };
    }

    // Generate embedding with retry logic
    const result = await this.embedWithRetry(provider, providerName, request.text, model);

    // Estimate tokens (rough approximation: ~4 chars per token)
    const estimatedTokens = Math.ceil(request.text.length / 4);
    const cost = provider.calculateCost(estimatedTokens, model);

    const durationMs = Date.now() - startTime;

    // Store in cache
    this.cache.set(cacheKey, {
      embedding: result.embedding,
      model,
      timestamp: Date.now(),
      tier,
    });

    // Track metrics
    this.metrics.recordRequest(model, tier, cost, durationMs, false);

    return {
      embedding: result.embedding,
      model,
      cached: false,
      tier,
      provider: providerName,
      cost,
      durationMs,
    };
  }

  /**
   * Get current metrics
   *
   * @returns Metrics summary
   */
  getMetrics(): EmbeddingMetrics {
    return this.metrics.getMetrics();
  }

  /**
   * Reset metrics to zero
   */
  resetMetrics(): void {
    this.metrics.reset();
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   *
   * @returns Number of cached embeddings
   */
  getCacheSize(): number {
    return this.cache.size();
  }
}
