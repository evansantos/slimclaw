/**
 * Tests for tier mapping functionality
 */

import { describe, it, expect } from 'vitest';
import {
  getTierModel,
  isTierReasoning,
  getThinkingBudget,
  isDowngrade,
  isUpgrade,
  inferTierFromModel,
  getDowngradeTier,
  DEFAULT_TIER_MODELS,
} from '../tiers.js';
import type { SlimClawConfig } from '../../config.js';

describe('tiers', () => {
  const mockRoutingConfig: SlimClawConfig['routing'] = {
    enabled: true,
    allowDowngrade: true,
    minConfidence: 0.4,
    tiers: {
      simple: "anthropic/claude-3-haiku-20240307",
      mid: "anthropic/claude-sonnet-4-20250514",
      complex: "anthropic/claude-opus-4-20250514",
      reasoning: "anthropic/claude-opus-4-20250514",
    }
  };

  describe('getTierModel', () => {
    it('should return configured model for tier', () => {
      expect(getTierModel('simple', mockRoutingConfig)).toBe('anthropic/claude-3-haiku-20240307');
      expect(getTierModel('mid', mockRoutingConfig)).toBe('anthropic/claude-sonnet-4-20250514');
      expect(getTierModel('complex', mockRoutingConfig)).toBe('anthropic/claude-opus-4-20250514');
      expect(getTierModel('reasoning', mockRoutingConfig)).toBe('anthropic/claude-opus-4-20250514');
    });

    it('should fallback to defaults when config tiers are missing', () => {
      const emptyConfig: SlimClawConfig['routing'] = {
        enabled: true,
        allowDowngrade: true,
        minConfidence: 0.4,
        tiers: {}
      };

      expect(getTierModel('simple', emptyConfig)).toBe(DEFAULT_TIER_MODELS.simple);
      expect(getTierModel('mid', emptyConfig)).toBe(DEFAULT_TIER_MODELS.mid);
      expect(getTierModel('complex', emptyConfig)).toBe(DEFAULT_TIER_MODELS.complex);
      expect(getTierModel('reasoning', emptyConfig)).toBe(DEFAULT_TIER_MODELS.reasoning);
    });

    it('should handle partial tier configuration', () => {
      const partialConfig: SlimClawConfig['routing'] = {
        enabled: true,
        allowDowngrade: true,
        minConfidence: 0.4,
        tiers: {
          simple: "custom/haiku-model",
          // mid, complex, reasoning missing
        }
      };

      expect(getTierModel('simple', partialConfig)).toBe('custom/haiku-model');
      expect(getTierModel('mid', partialConfig)).toBe(DEFAULT_TIER_MODELS.mid);
      expect(getTierModel('complex', partialConfig)).toBe(DEFAULT_TIER_MODELS.complex);
      expect(getTierModel('reasoning', partialConfig)).toBe(DEFAULT_TIER_MODELS.reasoning);
    });
  });

  describe('isTierReasoning', () => {
    it('should return true only for reasoning tier', () => {
      expect(isTierReasoning('simple')).toBe(false);
      expect(isTierReasoning('mid')).toBe(false);
      expect(isTierReasoning('complex')).toBe(false);
      expect(isTierReasoning('reasoning')).toBe(true);
    });
  });

  describe('getThinkingBudget', () => {
    it('should return default thinking budget', () => {
      expect(getThinkingBudget(mockRoutingConfig)).toBe(10000);
    });
  });

  describe('isDowngrade', () => {
    it('should correctly identify downgrades', () => {
      expect(isDowngrade('complex', 'simple')).toBe(true);
      expect(isDowngrade('reasoning', 'complex')).toBe(true);
      expect(isDowngrade('reasoning', 'mid')).toBe(true);
      expect(isDowngrade('reasoning', 'simple')).toBe(true);
      expect(isDowngrade('complex', 'mid')).toBe(true);
      expect(isDowngrade('mid', 'simple')).toBe(true);
    });

    it('should correctly identify non-downgrades', () => {
      expect(isDowngrade('simple', 'complex')).toBe(false);
      expect(isDowngrade('simple', 'mid')).toBe(false);
      expect(isDowngrade('mid', 'complex')).toBe(false);
      expect(isDowngrade('complex', 'reasoning')).toBe(false);
      expect(isDowngrade('simple', 'simple')).toBe(false); // Same tier
    });
  });

  describe('isUpgrade', () => {
    it('should correctly identify upgrades', () => {
      expect(isUpgrade('simple', 'complex')).toBe(true);
      expect(isUpgrade('simple', 'mid')).toBe(true);
      expect(isUpgrade('mid', 'complex')).toBe(true);
      expect(isUpgrade('complex', 'reasoning')).toBe(true);
      expect(isUpgrade('simple', 'reasoning')).toBe(true);
      expect(isUpgrade('mid', 'reasoning')).toBe(true);
    });

    it('should correctly identify non-upgrades', () => {
      expect(isUpgrade('complex', 'simple')).toBe(false);
      expect(isUpgrade('reasoning', 'complex')).toBe(false);
      expect(isUpgrade('mid', 'simple')).toBe(false);
      expect(isUpgrade('reasoning', 'mid')).toBe(false);
      expect(isUpgrade('simple', 'simple')).toBe(false); // Same tier
    });
  });

  describe('getDowngradeTier', () => {
    it('should correctly downgrade each tier', () => {
      expect(getDowngradeTier('reasoning')).toBe('complex');
      expect(getDowngradeTier('complex')).toBe('mid');
      expect(getDowngradeTier('mid')).toBe('simple');
    });

    it('should keep simple tier at simple', () => {
      expect(getDowngradeTier('simple')).toBe('simple');
    });

    it('should handle all tiers in downgrade chain', () => {
      // Test full downgrade chain: reasoning → complex → mid → simple → simple
      let current = 'reasoning' as const;
      expect(getDowngradeTier(current)).toBe('complex');
      
      current = 'complex' as const;
      expect(getDowngradeTier(current)).toBe('mid');
      
      current = 'mid' as const;
      expect(getDowngradeTier(current)).toBe('simple');
      
      current = 'simple' as const;
      expect(getDowngradeTier(current)).toBe('simple');
    });
  });

  describe('inferTierFromModel', () => {
    it('should infer tier from Claude model names', () => {
      expect(inferTierFromModel('anthropic/claude-3-haiku-20240307')).toBe('simple');
      expect(inferTierFromModel('anthropic/claude-sonnet-4-20250514')).toBe('mid');
      expect(inferTierFromModel('anthropic/claude-opus-4-20250514')).toBe('complex');
      expect(inferTierFromModel('claude-3-haiku')).toBe('simple');
      expect(inferTierFromModel('claude-sonnet')).toBe('mid');
      expect(inferTierFromModel('claude-opus')).toBe('complex');
    });

    it('should infer tier from GPT model names', () => {
      expect(inferTierFromModel('gpt-3.5-turbo')).toBe('simple');
      expect(inferTierFromModel('gpt-4-turbo')).toBe('mid');
      expect(inferTierFromModel('gpt-4')).toBe('complex');
    });

    it('should infer tier from LLaMA model names', () => {
      expect(inferTierFromModel('llama-7b')).toBe('simple');
      expect(inferTierFromModel('llama-70b')).toBe('mid');
      expect(inferTierFromModel('llama-405b')).toBe('complex');
    });

    it('should fallback to complex for unknown models', () => {
      expect(inferTierFromModel('unknown-model')).toBe('complex');
      expect(inferTierFromModel('custom/my-model')).toBe('complex');
      expect(inferTierFromModel('')).toBe('complex');
    });
  });

  describe('inferTierFromModel - Cross-Provider Models', () => {
    describe('Simple tier models', () => {
      it('should infer simple tier for gpt-4.1-nano', () => {
        expect(inferTierFromModel('gpt-4.1-nano')).toBe('simple');
      });

      it('should infer simple tier for gpt-4o-mini', () => {
        expect(inferTierFromModel('gpt-4o-mini')).toBe('simple');
      });

      it('should infer simple tier for deepseek-v3', () => {
        expect(inferTierFromModel('deepseek-v3')).toBe('simple');
      });
    });

    describe('Mid tier models', () => {
      it('should infer mid tier for gpt-4.1-mini', () => {
        expect(inferTierFromModel('gpt-4.1-mini')).toBe('mid');
      });

      it('should infer mid tier for gemini-2.5-flash', () => {
        expect(inferTierFromModel('gemini-2.5-flash')).toBe('mid');
      });

      it('should infer mid tier for llama-4-maverick', () => {
        expect(inferTierFromModel('llama-4-maverick')).toBe('mid');
      });

      it('should infer mid tier for qwen3-coder', () => {
        expect(inferTierFromModel('qwen3-coder')).toBe('mid');
      });
    });

    describe('Complex tier models', () => {
      it('should infer complex tier for gpt-4.1 (not mini/nano)', () => {
        expect(inferTierFromModel('gpt-4.1')).toBe('complex');
      });

      it('should infer complex tier for gpt-4 (not turbo)', () => {
        expect(inferTierFromModel('gpt-4')).toBe('complex');
      });

      it('should NOT infer complex for gpt-4-turbo', () => {
        expect(inferTierFromModel('gpt-4-turbo')).toBe('mid'); // Should remain mid
      });
    });

    describe('Reasoning tier models', () => {
      it('should infer reasoning tier for o3', () => {
        expect(inferTierFromModel('o3')).toBe('reasoning');
      });

      it('should infer reasoning tier for o4-mini', () => {
        expect(inferTierFromModel('o4-mini')).toBe('reasoning');
      });

      it('should infer reasoning tier for deepseek-r1', () => {
        expect(inferTierFromModel('deepseek-r1')).toBe('reasoning');
      });

      it('should infer reasoning tier for gemini-2.5-pro', () => {
        expect(inferTierFromModel('gemini-2.5-pro')).toBe('reasoning');
      });
    });

    describe('Edge cases for cross-provider models', () => {
      it('should handle model names with provider prefixes', () => {
        expect(inferTierFromModel('openai/gpt-4.1-nano')).toBe('simple');
        expect(inferTierFromModel('anthropic/deepseek-v3')).toBe('simple');
        expect(inferTierFromModel('google/gemini-2.5-flash')).toBe('mid');
        expect(inferTierFromModel('meta/llama-4-maverick')).toBe('mid');
        expect(inferTierFromModel('openai/o3')).toBe('reasoning');
        expect(inferTierFromModel('deepseek/deepseek-r1')).toBe('reasoning');
      });

      it('should handle case-insensitive matching', () => {
        expect(inferTierFromModel('GPT-4.1-NANO')).toBe('simple');
        expect(inferTierFromModel('DeepSeek-V3')).toBe('simple');
        expect(inferTierFromModel('GEMINI-2.5-FLASH')).toBe('mid');
        expect(inferTierFromModel('O3')).toBe('reasoning');
      });
    });
  });
});