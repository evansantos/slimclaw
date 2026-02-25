/**
 * SlimClaw Embeddings - Production-ready embedding router
 *
 * @packageDocumentation
 */

export { EmbeddingRouter } from './router.js';
export type { EmbeddingRouterConfig } from './router.js';

export { AnthropicProvider, OpenRouterProvider } from './providers/index.js';
export type { EmbeddingProvider, EmbeddingResult } from './providers/index.js';

export { EmbeddingCache } from './cache/embedding-cache.js';
export { EmbeddingMetricsTracker } from './metrics/embedding-metrics.js';
export { classifyComplexity } from './classifier/complexity.js';

export { DEFAULT_CONFIG, getProviderForModel, getModelForTier } from './config/config.js';

export type {
  ComplexityTier,
  Provider,
  EmbeddingConfig,
  RoutingConfig,
  CacheConfig,
  MetricsConfig,
  EmbeddingRequest,
  EmbeddingResponse,
  CachedEmbedding,
  EmbeddingMetrics,
} from './config/types';
