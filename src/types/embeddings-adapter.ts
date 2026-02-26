/**
 * Adapter interface for embedding metrics
 *
 * This interface provides a type-safe way to wrap embedding metrics
 * without using `as any` casts. It's used in the dashboard creation
 * to adapt the EmbeddingRouter's metrics to the expected interface.
 */

import type { EmbeddingMetrics } from '../embeddings/config/types.js';

/**
 * Adapter interface for embedding metrics tracking
 *
 * This interface allows wrapping different metrics implementations
 * with a consistent interface for the dashboard.
 */
export interface EmbeddingMetricsAdapter {
  /**
   * Get current metrics snapshot
   */
  getMetrics: () => EmbeddingMetrics;

  /**
   * Reset metrics (optional)
   * Some implementations may not support resetting
   */
  reset?: () => void;
}
