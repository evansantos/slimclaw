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
});