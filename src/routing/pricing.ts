/**
 * Shared pricing functions for model cost estimation and routing savings
 */

import type { ComplexityTier } from '../metrics/types.js';
import { inferTierFromModel } from './tiers.js';
import type { DynamicPricingCache } from './dynamic-pricing.js';

/**
 * Default model pricing per 1k tokens
 * Configurable pricing map that can be updated
 */
export const DEFAULT_MODEL_PRICING: Record<string, { inputPer1k: number, outputPer1k: number }> = {
  // Anthropic models
  'anthropic/claude-3-haiku-20240307': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  'anthropic/claude-sonnet-4-20250514': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'anthropic/claude-opus-4-20250514': { inputPer1k: 0.015, outputPer1k: 0.075 },
  
  // OpenAI models (existing)
  'openai/gpt-3.5-turbo': { inputPer1k: 0.0005, outputPer1k: 0.0015 },
  'openai/gpt-4': { inputPer1k: 0.01, outputPer1k: 0.03 },
  'openai/gpt-4-turbo': { inputPer1k: 0.01, outputPer1k: 0.03 },
  'openai/gpt-4o': { inputPer1k: 0.005, outputPer1k: 0.015 },
  
  // OpenAI models (cross-provider)
  'openai/gpt-4.1-nano': { inputPer1k: 0.0001, outputPer1k: 0.0004 },
  'openai/gpt-4.1-mini': { inputPer1k: 0.0004, outputPer1k: 0.0016 },
  'openai/gpt-4.1': { inputPer1k: 0.002, outputPer1k: 0.008 },
  'openai/gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  'openai/o4-mini': { inputPer1k: 0.0011, outputPer1k: 0.0044 },
  'openai/o3': { inputPer1k: 0.002, outputPer1k: 0.008 },
  
  // Google models (cross-provider)
  'google/gemini-2.5-flash': { inputPer1k: 0.0003, outputPer1k: 0.0025 },
  'google/gemini-2.5-pro': { inputPer1k: 0.00125, outputPer1k: 0.01 },
  
  // DeepSeek models (cross-provider)
  'deepseek/deepseek-r1-0528': { inputPer1k: 0.0004, outputPer1k: 0.00175 },
  'deepseek/deepseek-v3.2': { inputPer1k: 0.00026, outputPer1k: 0.00038 },
  
  // Meta LLaMA models (cross-provider)
  'meta-llama/llama-4-maverick': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  
  // Qwen models (cross-provider)
  'qwen/qwen3-coder': { inputPer1k: 0.00022, outputPer1k: 0.001 },
  
  // Default fallback rates by tier
  'tier:simple': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  'tier:mid': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'tier:complex': { inputPer1k: 0.015, outputPer1k: 0.075 },
  'tier:reasoning': { inputPer1k: 0.015, outputPer1k: 0.075 },
};

/**
 * Get pricing for a model with support for dynamic cache, custom overrides, and hardcoded fallback.
 * 
 * Priority order:
 * 1. Custom pricing overrides (customPricing parameter)
 * 2. Dynamic pricing cache (if provided and enabled)
 * 3. Hardcoded DEFAULT_MODEL_PRICING
 * 4. Tier inference fallback
 * 
 * @param model - Model identifier
 * @param customPricing - Optional custom pricing overrides
 * @param dynamicCache - Optional dynamic pricing cache
 * @returns Pricing data (never null)
 */
export function getModelPricing(
  model: string,
  customPricing?: Record<string, { inputPer1k: number, outputPer1k: number }>,
  dynamicCache?: DynamicPricingCache
): { inputPer1k: number, outputPer1k: number } {
  // 1. Check custom pricing first (highest priority)
  if (customPricing && customPricing[model]) {
    return customPricing[model];
  }

  // 2. Check dynamic cache second
  if (dynamicCache) {
    try {
      const dynamicPricing = dynamicCache.getPricing(model);
      // Dynamic cache always returns valid pricing (with hardcoded fallback internally)
      return dynamicPricing;
    } catch (error) {
      // Fallback to hardcoded if dynamic cache fails
    }
  }

  // 3. Check hardcoded pricing
  if (DEFAULT_MODEL_PRICING[model]) {
    return DEFAULT_MODEL_PRICING[model];
  }

  // 4. Tier inference fallback for unknown models
  const inferredTier = inferTierFromModel(model);
  if (DEFAULT_MODEL_PRICING[`tier:${inferredTier}`]) {
    return DEFAULT_MODEL_PRICING[`tier:${inferredTier}`];
  }

  // 5. Final fallback to mid-tier pricing
  return DEFAULT_MODEL_PRICING['tier:mid'];
}

/**
 * Calculate estimated routing savings as a percentage
 * @param originalTier Original complexity tier or model name
 * @param targetTier Target complexity tier
 * @param customPricing Optional custom pricing map
 * @returns Savings percentage (0-100, not 0-1)
 */
export function calculateRoutingSavings(
  originalTier: string,
  targetTier: ComplexityTier,
  customPricing?: Record<string, { inputPer1k: number, outputPer1k: number }>
): number {
  const originalPricing = getModelPricing(originalTier, customPricing);
  const targetPricing = getModelPricing(`tier:${targetTier}`, customPricing);
  
  // Calculate average cost (input + output) for comparison
  const originalAvgCost = (originalPricing.inputPer1k + originalPricing.outputPer1k) / 2;
  const targetAvgCost = (targetPricing.inputPer1k + targetPricing.outputPer1k) / 2;
  
  if (originalAvgCost === 0) return 0;
  
  const savings = ((originalAvgCost - targetAvgCost) / originalAvgCost) * 100;
  
  // Use consistent precision (2 decimal places for percentages)
  return Math.round(savings * 100) / 100;
}

/**
 * Estimate the cost of a model request.
 * 
 * @param model - Model identifier
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens (optional, defaults to 0)
 * @param customPricing - Optional custom pricing overrides
 * @param dynamicCache - Optional dynamic pricing cache
 * @returns Estimated cost in USD
 */
export function estimateModelCost(
  model: string,
  inputTokens: number,
  outputTokens: number = 0,
  customPricing?: Record<string, { inputPer1k: number, outputPer1k: number }>,
  dynamicCache?: DynamicPricingCache
): number {
  const modelPricing = getModelPricing(model, customPricing, dynamicCache);
  
  const inputCost = (inputTokens / 1000) * modelPricing.inputPer1k;
  const outputCost = (outputTokens / 1000) * modelPricing.outputPer1k;
  
  const totalCost = inputCost + outputCost;
  
  // Use consistent precision (6 decimal places for costs)
  return Math.round(totalCost * 1000000) / 1000000;
}

/**
 * Estimate cost per token for a model (weighted average of input/output)
 * @param model Model name
 * @param outputRatio Ratio of output to input tokens (default 0.3)
 * @param customPricing Optional custom pricing map
 * @returns Cost per token
 */
export function estimateCostPerToken(
  model: string,
  outputRatio: number = 0.3,
  customPricing?: Record<string, { inputPer1k: number, outputPer1k: number }>
): number {
  const modelPricing = getModelPricing(model, customPricing);
  
  // Calculate weighted average based on typical input/output ratio
  const inputWeight = 1 / (1 + outputRatio);
  const outputWeight = outputRatio / (1 + outputRatio);
  
  const weightedCostPer1k = (modelPricing.inputPer1k * inputWeight) + (modelPricing.outputPer1k * outputWeight);
  const costPerToken = weightedCostPer1k / 1000;
  
  // Use consistent precision (6 decimal places for costs)
  return Math.round(costPerToken * 1000000) / 1000000;
}