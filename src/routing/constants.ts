/**
 * Shared constants for routing logic
 */

import type { ComplexityTier } from '../metrics/types.js';

/**
 * Tier ordering for model upgrade/downgrade comparisons
 * Lower values = simpler/cheaper, higher values = more complex/expensive
 */
export const TIER_ORDER: Record<ComplexityTier, number> = {
  simple: 0,
  mid: 1,
  complex: 2,
  reasoning: 3,
} as const;