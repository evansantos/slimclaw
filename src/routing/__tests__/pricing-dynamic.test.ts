import { describe, test, expect, vi, beforeEach } from 'vitest';
import { getModelPricing, estimateModelCost } from '../pricing.js';
import type { DynamicPricingCache } from '../dynamic-pricing.js';

// Mock dynamic pricing cache
const mockDynamicCache = {
  getPricing: vi.fn()
} as unknown as DynamicPricingCache;

describe('pricing with dynamic cache integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getModelPricing with dynamic cache', () => {
    test('should use dynamic cache when available and no custom pricing', () => {
      (mockDynamicCache.getPricing as any).mockReturnValue({
        inputPer1k: 0.0002,
        outputPer1k: 0.0008
      });

      const pricing = getModelPricing('openai/gpt-4.1-nano', undefined, mockDynamicCache);

      expect(mockDynamicCache.getPricing).toHaveBeenCalledWith('openai/gpt-4.1-nano');
      expect(pricing.inputPer1k).toBe(0.0002);
      expect(pricing.outputPer1k).toBe(0.0008);
    });

    test('should fallback to hardcoded when no dynamic cache provided', () => {
      const pricing = getModelPricing('anthropic/claude-sonnet-4-20250514');

      expect(pricing.inputPer1k).toBe(0.003);
      expect(pricing.outputPer1k).toBe(0.015);
    });

    test('should prioritize custom pricing over dynamic cache', () => {
      (mockDynamicCache.getPricing as any).mockReturnValue({
        inputPer1k: 0.001,
        outputPer1k: 0.002
      });

      const customPricing = {
        'openai/gpt-4.1-nano': { inputPer1k: 0.0005, outputPer1k: 0.0010 }
      };

      const pricing = getModelPricing('openai/gpt-4.1-nano', customPricing, mockDynamicCache);

      expect(pricing.inputPer1k).toBe(0.0005); // Custom pricing wins
      expect(pricing.outputPer1k).toBe(0.0010);
      expect(mockDynamicCache.getPricing).not.toHaveBeenCalled();
    });

    test('should use dynamic cache when custom pricing does not have the model', () => {
      (mockDynamicCache.getPricing as any).mockReturnValue({
        inputPer1k: 0.0003,
        outputPer1k: 0.0012
      });

      const customPricing = {
        'other-model': { inputPer1k: 0.001, outputPer1k: 0.002 }
      };

      const pricing = getModelPricing('openai/gpt-4.1-nano', customPricing, mockDynamicCache);

      expect(mockDynamicCache.getPricing).toHaveBeenCalledWith('openai/gpt-4.1-nano');
      expect(pricing.inputPer1k).toBe(0.0003);
      expect(pricing.outputPer1k).toBe(0.0012);
    });

    test('should fallback to hardcoded when dynamic cache throws error', () => {
      (mockDynamicCache.getPricing as any).mockImplementation(() => {
        throw new Error('Cache error');
      });

      const pricing = getModelPricing('anthropic/claude-sonnet-4-20250514', undefined, mockDynamicCache);

      expect(pricing.inputPer1k).toBe(0.003); // Hardcoded fallback
      expect(pricing.outputPer1k).toBe(0.015);
    });

    test('should use generic fallback for unknown model when no cache has it', () => {
      (mockDynamicCache.getPricing as any).mockReturnValue({
        inputPer1k: 0.001, // Generic fallback values from dynamic cache
        outputPer1k: 0.002
      });

      const pricing = getModelPricing('unknown/model', undefined, mockDynamicCache);

      expect(mockDynamicCache.getPricing).toHaveBeenCalledWith('unknown/model');
      expect(pricing.inputPer1k).toBe(0.001);
      expect(pricing.outputPer1k).toBe(0.002);
    });

    test('should maintain tier inference when dynamic cache is provided', () => {
      (mockDynamicCache.getPricing as any).mockReturnValue({
        inputPer1k: 0.001,
        outputPer1k: 0.002
      });

      // Test with a tier-based lookup
      const pricing = getModelPricing('tier:simple', undefined, mockDynamicCache);

      expect(mockDynamicCache.getPricing).toHaveBeenCalledWith('tier:simple');
      expect(pricing.inputPer1k).toBe(0.001);
      expect(pricing.outputPer1k).toBe(0.002);
    });
  });

  describe('estimateModelCost with dynamic cache', () => {
    test('should use dynamic pricing for cost estimation', () => {
      (mockDynamicCache.getPricing as any).mockReturnValue({
        inputPer1k: 0.0001,
        outputPer1k: 0.0005
      });

      const cost = estimateModelCost('openai/gpt-4.1-nano', 2000, 1000, undefined, mockDynamicCache);

      // 2000 input tokens * 0.0001 + 1000 output tokens * 0.0005 = 0.0002 + 0.0005 = 0.0007
      expect(cost).toBeCloseTo(0.0007, 6);
      expect(mockDynamicCache.getPricing).toHaveBeenCalledWith('openai/gpt-4.1-nano');
    });

    test('should prioritize custom pricing over dynamic cache for cost estimation', () => {
      (mockDynamicCache.getPricing as any).mockReturnValue({
        inputPer1k: 0.001,
        outputPer1k: 0.002
      });

      const customPricing = {
        'test-model': { inputPer1k: 0.0005, outputPer1k: 0.001 }
      };

      const cost = estimateModelCost('test-model', 1000, 1000, customPricing, mockDynamicCache);

      // Should use custom pricing: 1000 * 0.0005 + 1000 * 0.001 = 0.0015
      expect(cost).toBeCloseTo(0.0015, 6);
      expect(mockDynamicCache.getPricing).not.toHaveBeenCalled();
    });

    test('should fallback gracefully when dynamic cache fails', () => {
      (mockDynamicCache.getPricing as any).mockImplementation(() => {
        throw new Error('Cache unavailable');
      });

      const cost = estimateModelCost('anthropic/claude-sonnet-4-20250514', 1000, 1000, undefined, mockDynamicCache);

      // Should fallback to hardcoded pricing
      const expectedCost = (1000/1000 * 0.003) + (1000/1000 * 0.015);
      expect(cost).toBe(expectedCost);
    });

    test('should handle zero tokens with dynamic cache', () => {
      (mockDynamicCache.getPricing as any).mockReturnValue({
        inputPer1k: 0.001,
        outputPer1k: 0.002
      });

      const cost = estimateModelCost('test-model', 0, 0, undefined, mockDynamicCache);
      expect(cost).toBe(0);
    });

    test('should maintain precision with dynamic cache pricing', () => {
      (mockDynamicCache.getPricing as any).mockReturnValue({
        inputPer1k: 0.0001234,
        outputPer1k: 0.0005678
      });

      const cost = estimateModelCost('test-model', 1337, 842, undefined, mockDynamicCache);
      
      const decimalPlaces = (cost.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(6);
      expect(Number.isFinite(cost)).toBe(true);
    });
  });

  describe('priority hierarchy validation', () => {
    test('should follow correct priority order: custom > dynamic > hardcoded > generic', () => {
      const customPricing = {
        'test-model': { inputPer1k: 0.01, outputPer1k: 0.02 }
      };

      (mockDynamicCache.getPricing as any).mockReturnValue({
        inputPer1k: 0.005,
        outputPer1k: 0.01
      });

      // 1. Custom pricing should win
      const pricing1 = getModelPricing('test-model', customPricing, mockDynamicCache);
      expect(pricing1.inputPer1k).toBe(0.01);
      expect(pricing1.outputPer1k).toBe(0.02);

      // 2. Dynamic cache should be used when no custom pricing
      const pricing2 = getModelPricing('test-model', undefined, mockDynamicCache);
      expect(pricing2.inputPer1k).toBe(0.005);
      expect(pricing2.outputPer1k).toBe(0.01);

      // 3. Hardcoded should be used when no cache
      const pricing3 = getModelPricing('anthropic/claude-sonnet-4-20250514');
      expect(pricing3.inputPer1k).toBe(0.003);
      expect(pricing3.outputPer1k).toBe(0.015);

      // 4. Generic fallback for completely unknown model
      const pricing4 = getModelPricing('completely-unknown-provider/unknown-model');
      expect(pricing4.inputPer1k).toBeGreaterThan(0); // Should use tier inference fallback
      expect(pricing4.outputPer1k).toBeGreaterThan(0);
    });
  });

  describe('backward compatibility', () => {
    test('should work without dynamic cache parameter (existing behavior)', () => {
      const pricing = getModelPricing('anthropic/claude-sonnet-4-20250514');
      expect(pricing.inputPer1k).toBe(0.003);
      expect(pricing.outputPer1k).toBe(0.015);
    });

    test('should work with custom pricing only (existing behavior)', () => {
      const customPricing = {
        'test-model': { inputPer1k: 0.001, outputPer1k: 0.002 }
      };
      
      const pricing = getModelPricing('test-model', customPricing);
      expect(pricing.inputPer1k).toBe(0.001);
      expect(pricing.outputPer1k).toBe(0.002);
    });

    test('estimateModelCost should work without dynamic cache', () => {
      const cost = estimateModelCost('anthropic/claude-sonnet-4-20250514', 1000, 1000);
      const expectedCost = (1000/1000 * 0.003) + (1000/1000 * 0.015);
      expect(cost).toBe(expectedCost);
    });
  });
});