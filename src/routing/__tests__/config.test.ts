import { describe, test, expect } from 'vitest';
import { SlimClawConfigSchema } from '../../config.js';

describe('config schema', () => {
  describe('tierProviders field', () => {
    test('should accept valid tierProviders configuration', () => {
      const result = SlimClawConfigSchema.safeParse({
        routing: {
          tierProviders: {
            "openai/*": "openrouter",
            "google/*": "openrouter",
            "deepseek/*": "openrouter"
          }
        }
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.routing.tierProviders).toEqual({
          "openai/*": "openrouter",
          "google/*": "openrouter",
          "deepseek/*": "openrouter"
        });
      }
    });

    test('should be optional field', () => {
      const result = SlimClawConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.routing.tierProviders).toBeUndefined();
      }
    });

    test('should support empty tierProviders object', () => {
      const result = SlimClawConfigSchema.safeParse({
        routing: { tierProviders: {} }
      });
      expect(result.success).toBe(true);
    });

    test('should accept cross-provider models in tiers', () => {
      const result = SlimClawConfigSchema.safeParse({
        routing: {
          tiers: {
            simple: "openai/gpt-4.1-nano",
            mid: "google/gemini-2.5-flash",
            complex: "anthropic/claude-opus-4-6",
            reasoning: "openai/o4-mini"
          }
        }
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.routing.tiers.simple).toBe("openai/gpt-4.1-nano");
      }
    });
  });
});