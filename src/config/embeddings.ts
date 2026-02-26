/**
 * Embedding Router Factory - Creates and configures EmbeddingRouter instance
 */

import { EmbeddingRouter } from '../embeddings/router.js';
import type { EmbeddingRouterConfig } from '../embeddings/router.js';
import type { SlimClawConfig } from '../config.js';

/**
 * Creates an EmbeddingRouter instance from SlimClaw config
 *
 * @param config - SlimClaw configuration
 * @returns EmbeddingRouter instance or null if disabled/not configured
 */
export function createEmbeddingRouter(config: SlimClawConfig): EmbeddingRouter | null {
  // Check if embeddings are enabled
  if (!config.embeddings?.enabled) {
    return null;
  }

  // Collect API keys from environment
  const apiKeys: { anthropic?: string; openrouter?: string } = {};

  if (process.env.ANTHROPIC_API_KEY) {
    apiKeys.anthropic = process.env.ANTHROPIC_API_KEY;
  }

  if (process.env.OPENROUTER_API_KEY) {
    apiKeys.openrouter = process.env.OPENROUTER_API_KEY;
  }

  // Need at least one API key
  if (!apiKeys.anthropic && !apiKeys.openrouter) {
    return null;
  }

  // Build EmbeddingRouter config
  const routerConfig: EmbeddingRouterConfig = {
    config: config.embeddings,
    apiKeys,
  };

  // Create and return router
  return new EmbeddingRouter(routerConfig);
}
