/**
 * SlimClaw Model Routing - Tier to Model Mapping
 * 
 * Maps complexity tiers to specific models based on configuration
 */

import type { SlimClawConfig } from '../config.js';

export type ComplexityTier = "simple" | "mid" | "complex" | "reasoning";

/**
 * Default tier to model mappings
 * Used when config doesn't specify custom mappings
 */
export const DEFAULT_TIER_MODELS: Record<ComplexityTier, string> = {
  simple: "anthropic/claude-3-haiku-20240307",
  mid: "anthropic/claude-sonnet-4-20250514",
  complex: "anthropic/claude-opus-4-20250514",
  reasoning: "anthropic/claude-opus-4-20250514",
} as const;

/**
 * Get the model for a given tier based on configuration
 */
export function getTierModel(
  tier: ComplexityTier,
  config: SlimClawConfig['routing']
): string {
  return config.tiers?.[tier] ?? DEFAULT_TIER_MODELS[tier];
}

/**
 * Check if a tier should use thinking budget
 */
export function isTierReasoning(tier: ComplexityTier): boolean {
  return tier === "reasoning";
}

/**
 * Get thinking budget for reasoning tier
 */
export function getThinkingBudget(config: SlimClawConfig['routing']): number {
  return config.reasoningBudget ?? 10000;
}

/**
 * Check if a tier downgrade is happening
 */
export function isDowngrade(fromTier: ComplexityTier, toTier: ComplexityTier): boolean {
  const tierRanks: Record<ComplexityTier, number> = {
    simple: 0,
    mid: 1,
    complex: 2,
    reasoning: 3,
  };
  
  return tierRanks[toTier] < tierRanks[fromTier];
}

/**
 * Check if a tier upgrade is happening
 */
export function isUpgrade(fromTier: ComplexityTier, toTier: ComplexityTier): boolean {
  const tierRanks: Record<ComplexityTier, number> = {
    simple: 0,
    mid: 1,
    complex: 2,
    reasoning: 3,
  };
  
  return tierRanks[toTier] > tierRanks[fromTier];
}

/**
 * Infer tier from model name (best effort)
 * Used for reverse mapping when needed
 */
export function inferTierFromModel(model: string): ComplexityTier {
  const lowerModel = model.toLowerCase();
  
  if (lowerModel.includes('haiku')) return 'simple';
  if (lowerModel.includes('sonnet')) return 'mid';
  if (lowerModel.includes('opus')) return 'complex'; // Default opus to complex, not reasoning
  
  // Fallback based on model patterns
  if (lowerModel.includes('gpt-3.5') || lowerModel.includes('llama-7b')) return 'simple';
  if (lowerModel.includes('gpt-4-turbo') || lowerModel.includes('llama-70b')) return 'mid';
  if (lowerModel.includes('gpt-4') || lowerModel.includes('llama-405b')) return 'complex';
  
  // Conservative fallback
  return 'complex';
}