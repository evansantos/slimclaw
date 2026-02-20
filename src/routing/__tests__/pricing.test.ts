import { describe, test, expect } from 'vitest';
import { 
  calculateRoutingSavings, 
  estimateModelCost, 
  DEFAULT_MODEL_PRICING 
} from '../pricing.js';
import type { ComplexityTier } from '../../metrics/types.js';

describe('pricing', () => {
  describe('calculateRoutingSavings', () => {
    test('calculates savings from complex to simple tier', () => {
      const savings = calculateRoutingSavings('tier:complex', 'simple');
      expect(savings).toBeGreaterThan(0);
      expect(typeof savings).toBe('number');
      expect(Number.isFinite(savings)).toBe(true);
    });

    test('calculates negative savings (cost increase) from simple to complex', () => {
      const savings = calculateRoutingSavings('tier:simple', 'complex');
      expect(savings).toBeLessThan(0);
    });

    test('returns zero savings for same tier', () => {
      const savings = calculateRoutingSavings('tier:mid', 'mid');
      expect(savings).toBe(0);
    });

    test('handles specific model names', () => {
      const savings = calculateRoutingSavings('anthropic/claude-opus-4-20250514', 'simple');
      expect(savings).toBeGreaterThan(0);
    });

    test('uses custom pricing when provided', () => {
      const customPricing = {
        'tier:simple': { inputPer1k: 0.001, outputPer1k: 0.002 },
        'tier:complex': { inputPer1k: 0.010, outputPer1k: 0.020 },
      };
      
      const savings = calculateRoutingSavings('tier:complex', 'simple', customPricing);
      expect(savings).toBeGreaterThan(0);
    });

    test('returns precise percentage with 2 decimal places', () => {
      const savings = calculateRoutingSavings('tier:complex', 'simple');
      const decimalPlaces = (savings.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });
  });

  describe('estimateModelCost', () => {
    test('calculates cost for input tokens only', () => {
      const cost = estimateModelCost('anthropic/claude-3-haiku-20240307', 1000);
      expect(cost).toBe(0.00025); // 1000 tokens * 0.00025 per 1k
    });

    test('calculates cost for input and output tokens', () => {
      const cost = estimateModelCost('anthropic/claude-3-haiku-20240307', 1000, 500);
      const expected = (1000/1000 * 0.00025) + (500/1000 * 0.00125);
      expect(cost).toBe(expected);
    });

    test('handles unknown models with fallback pricing', () => {
      const cost = estimateModelCost('unknown-model', 1000);
      expect(cost).toBeGreaterThan(0);
      expect(typeof cost).toBe('number');
    });

    test('returns zero cost for zero tokens', () => {
      const cost = estimateModelCost('anthropic/claude-3-haiku-20240307', 0, 0);
      expect(cost).toBe(0);
    });

    test('uses custom pricing when provided', () => {
      const customPricing = {
        'test-model': { inputPer1k: 0.001, outputPer1k: 0.002 }
      };
      
      const cost = estimateModelCost('test-model', 1000, 500, customPricing);
      const expected = (1000/1000 * 0.001) + (500/1000 * 0.002);
      expect(cost).toBe(expected);
    });

    test('returns precise cost with 6 decimal places max', () => {
      const cost = estimateModelCost('anthropic/claude-sonnet-4-20250514', 1337, 842);
      const decimalPlaces = (cost.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(6);
    });
  });

  describe('DEFAULT_MODEL_PRICING', () => {
    test('includes expected model entries', () => {
      expect(DEFAULT_MODEL_PRICING['anthropic/claude-3-haiku-20240307']).toBeDefined();
      expect(DEFAULT_MODEL_PRICING['anthropic/claude-sonnet-4-20250514']).toBeDefined();
      expect(DEFAULT_MODEL_PRICING['anthropic/claude-opus-4-20250514']).toBeDefined();
    });

    test('includes new cross-provider OpenAI models', () => {
      expect(DEFAULT_MODEL_PRICING['openai/gpt-4.1-nano']).toEqual({
        inputPer1k: 0.0001,
        outputPer1k: 0.0004
      });
      expect(DEFAULT_MODEL_PRICING['openai/gpt-4.1-mini']).toEqual({
        inputPer1k: 0.0004,
        outputPer1k: 0.0016
      });
      expect(DEFAULT_MODEL_PRICING['openai/gpt-4.1']).toEqual({
        inputPer1k: 0.002,
        outputPer1k: 0.008
      });
      expect(DEFAULT_MODEL_PRICING['openai/gpt-4o-mini']).toEqual({
        inputPer1k: 0.00015,
        outputPer1k: 0.0006
      });
      expect(DEFAULT_MODEL_PRICING['openai/o4-mini']).toEqual({
        inputPer1k: 0.0011,
        outputPer1k: 0.0044
      });
      expect(DEFAULT_MODEL_PRICING['openai/o3']).toEqual({
        inputPer1k: 0.002,
        outputPer1k: 0.008
      });
    });

    test('includes new cross-provider Google models', () => {
      expect(DEFAULT_MODEL_PRICING['google/gemini-2.5-flash']).toEqual({
        inputPer1k: 0.0003,
        outputPer1k: 0.0025
      });
      expect(DEFAULT_MODEL_PRICING['google/gemini-2.5-pro']).toEqual({
        inputPer1k: 0.00125,
        outputPer1k: 0.01
      });
    });

    test('includes new cross-provider DeepSeek models', () => {
      expect(DEFAULT_MODEL_PRICING['deepseek/deepseek-r1-0528']).toEqual({
        inputPer1k: 0.0004,
        outputPer1k: 0.00175
      });
      expect(DEFAULT_MODEL_PRICING['deepseek/deepseek-v3.2']).toEqual({
        inputPer1k: 0.00026,
        outputPer1k: 0.00038
      });
    });

    test('includes new cross-provider Meta LLaMA models', () => {
      expect(DEFAULT_MODEL_PRICING['meta-llama/llama-4-maverick']).toEqual({
        inputPer1k: 0.00015,
        outputPer1k: 0.0006
      });
    });

    test('includes new cross-provider Qwen models', () => {
      expect(DEFAULT_MODEL_PRICING['qwen/qwen3-coder']).toEqual({
        inputPer1k: 0.00022,
        outputPer1k: 0.001
      });
    });

    test('includes tier-based fallbacks', () => {
      expect(DEFAULT_MODEL_PRICING['tier:simple']).toBeDefined();
      expect(DEFAULT_MODEL_PRICING['tier:mid']).toBeDefined();
      expect(DEFAULT_MODEL_PRICING['tier:complex']).toBeDefined();
      expect(DEFAULT_MODEL_PRICING['tier:reasoning']).toBeDefined();
    });

    test('all pricing entries have correct structure', () => {
      Object.values(DEFAULT_MODEL_PRICING).forEach(pricing => {
        expect(typeof pricing.inputPer1k).toBe('number');
        expect(typeof pricing.outputPer1k).toBe('number');
        expect(pricing.inputPer1k).toBeGreaterThanOrEqual(0);
        expect(pricing.outputPer1k).toBeGreaterThanOrEqual(0);
      });
    });

    test('output pricing is typically higher than input pricing', () => {
      Object.values(DEFAULT_MODEL_PRICING).forEach(pricing => {
        // This is a typical pattern for most LLM providers
        expect(pricing.outputPer1k).toBeGreaterThanOrEqual(pricing.inputPer1k);
      });
    });
  });

  describe('Cross-provider cost estimation scenarios', () => {
    describe('Realistic cost estimation for cross-provider models', () => {
      test('calculates cost for OpenAI gpt-4.1-nano', () => {
        const cost = estimateModelCost('openai/gpt-4.1-nano', 1000, 500);
        expect(cost).toBeGreaterThan(0);
        expect(cost).toBeCloseTo(0.0003, 6); // 0.1 + 0.2 = 0.3 cents
      });

      test('calculates cost for Google gemini-2.5-flash', () => {
        const cost = estimateModelCost('google/gemini-2.5-flash', 1000, 500);
        expect(cost).toBeGreaterThan(0);
        expect(cost).toBeCloseTo(0.00155, 6); // 0.03 + 0.125 = 0.155 cents
      });

      test('calculates cost for OpenAI o4-mini', () => {
        const cost = estimateModelCost('openai/o4-mini', 1000, 500);
        expect(cost).toBeGreaterThan(0);
        expect(cost).toBeCloseTo(0.0033, 6); // 1.1 + 2.2 = 3.3 cents
      });

      test('all cross-provider models have reasonable costs', () => {
        const crossProviderModels = [
          'openai/gpt-4.1-nano',
          'openai/gpt-4.1-mini', 
          'openai/gpt-4o-mini',
          'openai/o4-mini',
          'google/gemini-2.5-flash',
          'google/gemini-2.5-pro',
          'deepseek/deepseek-r1-0528',
          'deepseek/deepseek-v3.2',
          'meta-llama/llama-4-maverick',
          'qwen/qwen3-coder'
        ];

        crossProviderModels.forEach(model => {
          const cost = estimateModelCost(model, 1000, 1000);
          expect(cost).toBeGreaterThan(0);
          expect(cost).toBeLessThan(1); // Should be less than $1 for 2k tokens
          expect(Number.isFinite(cost)).toBe(true);
        });
      });

      test('costs are within expected ranges for typical usage', () => {
        const cost1 = estimateModelCost('openai/gpt-4.1-nano', 10000, 5000);
        const cost2 = estimateModelCost('google/gemini-2.5-flash', 10000, 5000);
        const cost3 = estimateModelCost('deepseek/deepseek-v3.2', 10000, 5000);
        
        expect(cost1).toBeLessThan(0.1); // nano models should be very cheap
        expect(cost2).toBeLessThan(0.2); // flash models moderately cheap
        expect(cost3).toBeLessThan(0.1); // deepseek competitive
      });
    });

    describe('Cross-provider pricing comparison', () => {
      test('gpt-4.1-nano is cheaper than Claude haiku for same usage', () => {
        const nanoStandardCost = estimateModelCost('openai/gpt-4.1-nano', 1000, 1000);
        const haikuCost = estimateModelCost('anthropic/claude-3-haiku-20240307', 1000, 1000);
        
        expect(nanoStandardCost).toBeLessThan(haikuCost);
        
        // Also verify tier comparison 
        const savings = calculateRoutingSavings('anthropic/claude-3-haiku-20240307', 'simple');
        // When routing TO simple tier, should be no savings (already simple tier)
        expect(Math.abs(savings)).toBeLessThanOrEqual(1); // Near zero
      });

      test('cross-provider alternatives are typically cheaper in same tiers', () => {
        // Compare simple tier alternatives
        const haikuCost = estimateModelCost('anthropic/claude-3-haiku-20240307', 1000, 1000);
        const nanoCost = estimateModelCost('openai/gpt-4.1-nano', 1000, 1000);
        const llamaCost = estimateModelCost('meta-llama/llama-4-maverick', 1000, 1000);
        
        expect(nanoCost).toBeLessThan(haikuCost);
        expect(llamaCost).toBeLessThan(haikuCost);
      });

      test('calculates meaningful savings when routing to cheaper alternatives', () => {
        const savings1 = calculateRoutingSavings('anthropic/claude-sonnet-4-20250514', 'simple');
        const savings2 = calculateRoutingSavings('anthropic/claude-opus-4-20250514', 'simple');
        
        expect(savings1).toBeGreaterThan(50); // Should save significant percentage
        expect(savings2).toBeGreaterThan(70); // Opus to simple saves even more
        
        // Negative savings (cost increase) when routing to more expensive
        const negativeSavings = calculateRoutingSavings('openai/gpt-4.1-nano', 'complex');
        expect(negativeSavings).toBeLessThan(-50); // Significant cost increase
      });

      test('cross-provider models show appropriate routing savings', () => {
        // Routing from expensive to cheap cross-provider 
        const savings = calculateRoutingSavings('google/gemini-2.5-pro', 'simple');
        expect(savings).toBeGreaterThan(60); // Pro to simple should save significantly
        
        const miniSavings = calculateRoutingSavings('openai/o4-mini', 'simple');
        expect(miniSavings).toBeGreaterThan(50); // o4-mini is more expensive, so routing to simple saves significantly
      });
    });

    describe('Edge cases', () => {
      test('handles zero token counts', () => {
        const cost1 = estimateModelCost('openai/gpt-4.1-nano', 0, 0);
        const cost2 = estimateModelCost('google/gemini-2.5-flash', 0);
        const cost3 = estimateModelCost('deepseek/deepseek-v3.2', 0, 0);
        
        expect(cost1).toBe(0);
        expect(cost2).toBe(0);
        expect(cost3).toBe(0);
      });

      test('handles very large token counts', () => {
        const largeTokens = 1000000; // 1M tokens
        const cost = estimateModelCost('openai/gpt-4.1-nano', largeTokens, largeTokens);
        
        expect(cost).toBeGreaterThan(0);
        expect(Number.isFinite(cost)).toBe(true);
        expect(cost).toBe(0.5); // Should be $0.50 for 2M tokens at nano rates (0.1 + 0.4)
      });

      test('handles unknown cross-provider model with fallback', () => {
        const cost = estimateModelCost('unknown-provider/unknown-model', 1000, 1000);
        
        expect(cost).toBeGreaterThan(0);
        expect(Number.isFinite(cost)).toBe(true);
        // Unknown models fall back to complex tier via inferTierFromModel
        const expected = (1000/1000 * 0.015) + (1000/1000 * 0.075);
        expect(cost).toBe(expected);
      });

      test('routing savings with unknown models use reasonable fallbacks', () => {
        const savings = calculateRoutingSavings('unknown-expensive/gpt-10', 'simple');
        
        // Should fallback to mid-tier and calculate reasonable savings
        expect(savings).toBeGreaterThan(0);
        expect(Number.isFinite(savings)).toBe(true);
        expect(savings).toBeLessThan(100); // Not more than 100% savings
      });

      test('handles edge case in calculateRoutingSavings with zero cost model', () => {
        const customPricing = {
          'zero-cost-model': { inputPer1k: 0, outputPer1k: 0 },
          'tier:simple': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
        };
        
        const savings = calculateRoutingSavings('zero-cost-model', 'simple', customPricing);
        expect(savings).toBe(0); // Should handle division by zero gracefully
      });

      test('precision is maintained for very small costs', () => {
        const tinyCost = estimateModelCost('openai/gpt-4.1-nano', 1, 1);
        expect(tinyCost).toBeGreaterThan(0);
        expect(tinyCost).toBeLessThan(0.000002); // Should be around 0.0000005
        
        // Should have proper decimal precision
        const decimalPlaces = (tinyCost.toString().split('.')[1] || '').length;
        expect(decimalPlaces).toBeLessThanOrEqual(6);
      });
    });
  });
});