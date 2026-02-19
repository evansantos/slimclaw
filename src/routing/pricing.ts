/**
 * Shared pricing functions for model cost estimation and routing savings
 */

import type { ComplexityTier } from '../metrics/types.js';

/**
 * Default model pricing per 1k tokens
 * Configurable pricing map that can be updated
 */
export const DEFAULT_MODEL_PRICING: Record<string, { inputPer1k: number, outputPer1k: number }> = {
  // Anthropic models
  'anthropic/claude-3-haiku-20240307': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  'anthropic/claude-sonnet-4-20250514': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'anthropic/claude-opus-4-20250514': { inputPer1k: 0.015, outputPer1k: 0.075 },
  
  // OpenAI models
  'openai/gpt-3.5-turbo': { inputPer1k: 0.0005, outputPer1k: 0.0015 },
  'openai/gpt-4': { inputPer1k: 0.01, outputPer1k: 0.03 },
  'openai/gpt-4-turbo': { inputPer1k: 0.01, outputPer1k: 0.03 },
  'openai/gpt-4o': { inputPer1k: 0.005, outputPer1k: 0.015 },
  
  // Default fallback rates by tier
  'tier:simple': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  'tier:mid': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'tier:complex': { inputPer1k: 0.015, outputPer1k: 0.075 },
  'tier:reasoning': { inputPer1k: 0.015, outputPer1k: 0.075 },
};

/**
 * Get pricing for a specific model
 * Falls back to tier-based pricing if model not found
 */
function getModelPricing(
  model: string, 
  tier?: ComplexityTier,
  pricing: Record<string, { inputPer1k: number, outputPer1k: number }> = DEFAULT_MODEL_PRICING
): { inputPer1k: number, outputPer1k: number } {
  // Try exact model match first
  if (pricing[model]) {
    return pricing[model];
  }
  
  // Try tier-based fallback
  if (tier && pricing[`tier:${tier}`]) {
    return pricing[`tier:${tier}`];
  }
  
  // Infer from model name patterns
  const lowerModel = model.toLowerCase();
  
  if (lowerModel.includes('haiku')) {
    return pricing['tier:simple'];
  }
  if (lowerModel.includes('sonnet')) {
    return pricing['tier:mid'];
  }
  if (lowerModel.includes('opus')) {
    return pricing['tier:complex'];
  }
  if (lowerModel.includes('gpt-3.5')) {
    return pricing['tier:simple'];
  }
  if (lowerModel.includes('gpt-4')) {
    return pricing['tier:complex'];
  }
  
  // Default to mid-tier pricing
  return pricing['tier:mid'];
}

/**
 * Calculate estimated routing savings as a percentage
 * @param originalTier Original complexity tier or model name
 * @param targetTier Target complexity tier
 * @param pricing Optional custom pricing map
 * @returns Savings percentage (0-100, not 0-1)
 */
export function calculateRoutingSavings(
  originalTier: string,
  targetTier: ComplexityTier,
  pricing: Record<string, { inputPer1k: number, outputPer1k: number }> = DEFAULT_MODEL_PRICING
): number {
  const originalPricing = getModelPricing(originalTier, undefined, pricing);
  const targetPricing = getModelPricing(`tier:${targetTier}`, targetTier, pricing);
  
  // Calculate average cost (input + output) for comparison
  const originalAvgCost = (originalPricing.inputPer1k + originalPricing.outputPer1k) / 2;
  const targetAvgCost = (targetPricing.inputPer1k + targetPricing.outputPer1k) / 2;
  
  if (originalAvgCost === 0) return 0;
  
  const savings = ((originalAvgCost - targetAvgCost) / originalAvgCost) * 100;
  
  // Use consistent precision (2 decimal places for percentages)
  return Math.round(savings * 100) / 100;
}

/**
 * Estimate model cost for given tokens
 * @param model Model name or tier
 * @param inputTokens Number of input tokens
 * @param outputTokens Number of output tokens (optional, defaults to 0)
 * @param pricing Optional custom pricing map
 * @returns Estimated cost in dollars
 */
export function estimateModelCost(
  model: string,
  inputTokens: number,
  outputTokens: number = 0,
  pricing: Record<string, { inputPer1k: number, outputPer1k: number }> = DEFAULT_MODEL_PRICING
): number {
  const modelPricing = getModelPricing(model, undefined, pricing);
  
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
 * @param pricing Optional custom pricing map
 * @returns Cost per token
 */
export function estimateCostPerToken(
  model: string,
  outputRatio: number = 0.3,
  pricing: Record<string, { inputPer1k: number, outputPer1k: number }> = DEFAULT_MODEL_PRICING
): number {
  const modelPricing = getModelPricing(model, undefined, pricing);
  
  // Calculate weighted average based on typical input/output ratio
  const inputWeight = 1 / (1 + outputRatio);
  const outputWeight = outputRatio / (1 + outputRatio);
  
  const weightedCostPer1k = (modelPricing.inputPer1k * inputWeight) + (modelPricing.outputPer1k * outputWeight);
  const costPerToken = weightedCostPer1k / 1000;
  
  // Use consistent precision (6 decimal places for costs)
  return Math.round(costPerToken * 1000000) / 1000000;
}