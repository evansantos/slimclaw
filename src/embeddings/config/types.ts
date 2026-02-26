/**
 * Complexity tier for routing embeddings
 */
export type ComplexityTier = 'simple' | 'mid' | 'complex';

/**
 * Supported embedding providers
 */
export type Provider = 'anthropic' | 'openrouter';

/**
 * Configuration for embedding routing
 */
export interface RoutingConfig {
  tiers: Record<ComplexityTier, string>;
  tierProviders: Record<string, Provider>;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  enabled: boolean;
  ttlMs: number;
  maxSize: number;
}

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  enabled: boolean;
  trackCosts: boolean;
}

/**
 * Retry configuration for error handling
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  timeoutMs: number;
}

/**
 * Classifier configuration for complexity thresholds
 */
export interface ClassifierConfig {
  simpleMaxChars?: number;
  midMaxChars?: number;
}

/**
 * Full embedding router configuration
 */
export interface EmbeddingConfig {
  enabled: boolean;
  routing: RoutingConfig;
  caching: CacheConfig;
  metrics: MetricsConfig;
  retry?: RetryConfig;
  classifier?: ClassifierConfig;
}

/**
 * Request for embedding
 */
export interface EmbeddingRequest {
  text: string;
  options?: {
    modelHint?: string;
    tier?: ComplexityTier;
  };
}

/**
 * Response from embedding
 */
export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  cached: boolean;
  tier: ComplexityTier;
  provider: Provider;
  cost: number;
  durationMs: number;
}

/**
 * Cached embedding entry
 */
export interface CachedEmbedding {
  embedding: number[];
  model: string;
  timestamp: number;
  tier: ComplexityTier;
}

/**
 * Metrics summary
 */
export interface EmbeddingMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  totalCost: number;
  costByModel: Record<string, number>;
  requestsByTier: Record<ComplexityTier, number>;
  averageDurationMs: number;
}
