import type { EmbeddingConfig, ComplexityTier, Provider } from './types.js';

/**
 * Default embedding router configuration
 */
export const DEFAULT_CONFIG: EmbeddingConfig = {
  enabled: true,
  routing: {
    tiers: {
      simple: 'openai/text-embedding-3-small',
      mid: 'openai/text-embedding-3-large',
      complex: 'cohere/cohere-embed-english-v3.0',
    },
    tierProviders: {
      'openai/*': 'openrouter',
      'cohere/*': 'openrouter',
      'anthropic/*': 'anthropic',
    },
  },
  caching: {
    enabled: true,
    ttlMs: 604800000, // 7 days
    maxSize: 1000,
  },
  metrics: {
    enabled: true,
    trackCosts: true,
  },
};

/**
 * Get the provider for a given model based on config
 *
 * @param model - Model identifier
 * @param config - Embedding configuration
 * @returns Provider name
 */
export function getProviderForModel(model: string, config: EmbeddingConfig): Provider {
  const { tierProviders } = config.routing;

  // Check exact match first
  if (tierProviders[model]) {
    return tierProviders[model];
  }

  // Check wildcard patterns
  for (const [pattern, provider] of Object.entries(tierProviders)) {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      if (model.startsWith(prefix + '/')) {
        return provider;
      }
    }
  }

  // Default to openrouter if no match
  return 'openrouter';
}

/**
 * Get the model for a given complexity tier
 *
 * @param tier - Complexity tier
 * @param config - Embedding configuration
 * @returns Model identifier
 */
export function getModelForTier(tier: ComplexityTier, config: EmbeddingConfig): string {
  return config.routing.tiers[tier];
}
