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
 * Tier ranking system as specified in Task 3
 * simple=1, mid=2, complex=3, reasoning=4
 */
export const TIER_RANKS: Record<ComplexityTier, number> = {
  simple: 1,
  mid: 2,
  complex: 3,
  reasoning: 4,
} as const;

/**
 * Check if a tier downgrade is happening
 */
export function isDowngrade(fromTier: ComplexityTier, toTier: ComplexityTier): boolean {
  return TIER_RANKS[toTier] < TIER_RANKS[fromTier];
}

/**
 * Check if a tier upgrade is happening
 */
export function isUpgrade(fromTier: ComplexityTier, toTier: ComplexityTier): boolean {
  return TIER_RANKS[toTier] > TIER_RANKS[fromTier];
}

/**
 * Infer tier from model name (best effort)
 * Used for reverse mapping when needed
 */
export function inferTierFromModel(model: string): ComplexityTier {
  const lowerModel = model.toLowerCase();
  
  // Claude models
  if (lowerModel.includes('haiku')) return 'simple';
  if (lowerModel.includes('sonnet')) return 'mid';
  if (lowerModel.includes('opus')) return 'complex'; // Opus is high-capability general, not dedicated reasoning like o3/o4
  
  // Cross-Provider Models - Reasoning tier (check first for specificity)
  if (lowerModel.includes('o1') || lowerModel.includes('o3') || lowerModel.includes('o4-mini')) return 'reasoning';
  if (lowerModel.includes('deepseek-r1')) return 'reasoning';
  if (lowerModel.includes('gemini-2.5-pro')) return 'reasoning';
  
  // Cross-Provider Models - Simple tier (check specific patterns first)
  if (lowerModel.includes('gpt-4.1-nano') || lowerModel.includes('gpt-4o-mini')) return 'simple';
  if (lowerModel.includes('nano-model') || lowerModel.includes('nano')) return 'simple';
  if (lowerModel.includes('deepseek-v3')) return 'simple';
  
  // Cross-Provider Models - Mid tier
  if (lowerModel.includes('gpt-4.1-mini')) return 'mid';
  if (lowerModel.includes('gemini-2.5-flash') || lowerModel.includes('gemini-flash')) return 'mid';
  if (lowerModel.includes('flash')) return 'mid';
  if (lowerModel.includes('llama-4-maverick')) return 'mid';
  if (lowerModel.includes('qwen3-coder')) return 'mid';
  
  // Cross-Provider Models - Complex tier
  // Note: gpt-4.1-nano and gpt-4.1-mini are already matched above in simple/mid tiers
  if (lowerModel.includes('gpt-4.1') && !lowerModel.includes('nano') && !lowerModel.includes('mini')) return 'complex';
  if (lowerModel.includes('gpt-4-pro')) return 'complex';
  
  // Legacy fallback patterns
  if (lowerModel.includes('gpt-3.5') || lowerModel.includes('llama-7b')) return 'simple';
  if (lowerModel.includes('gpt-4-turbo') || lowerModel.includes('llama-70b')) return 'mid';
  if (lowerModel.includes('gpt-4') || lowerModel.includes('llama-405b')) return 'complex';
  
  // Conservative fallback
  return 'complex';
}