import { describe, test, expect } from 'vitest';
import { 
  resolveProvider,
  matchTierProvider,
  inferProviderFromModelId,
  type ProviderResolution
} from '../provider-resolver.js';

describe('provider-resolver', () => {
  describe('matchTierProvider', () => {
    test('should match exact patterns', () => {
      expect(matchTierProvider('openai/gpt-4.1-nano', 'openai/gpt-4.1-nano')).toBe(true);
      expect(matchTierProvider('anthropic/claude-sonnet-4', 'anthropic/claude-sonnet-4')).toBe(true);
      expect(matchTierProvider('openai/gpt-4.1-nano', 'openai/gpt-4.1-mini')).toBe(false);
    });

    test('should match wildcard pattern', () => {
      expect(matchTierProvider('anything', '*')).toBe(true);
      expect(matchTierProvider('openai/gpt-4.1-nano', '*')).toBe(true);
      expect(matchTierProvider('custom/my-model', '*')).toBe(true);
    });

    test('should match prefix globs', () => {
      expect(matchTierProvider('openai/gpt-4.1-nano', 'openai/*')).toBe(true);
      expect(matchTierProvider('openai/o3', 'openai/*')).toBe(true);
      expect(matchTierProvider('google/gemini-2.5-flash', 'google/*')).toBe(true);
      expect(matchTierProvider('openai/anything', 'google/*')).toBe(false);
      expect(matchTierProvider('openai-custom/model', 'openai/*')).toBe(false);
    });

    test('should not match invalid patterns', () => {
      expect(matchTierProvider('openai/gpt-4', 'openai/gpt-5')).toBe(false);
      expect(matchTierProvider('anthropic/claude', 'openai/*')).toBe(false);
      expect(matchTierProvider('custom', 'openai/*')).toBe(false);
    });
  });

  describe('inferProviderFromModelId', () => {
    test('should extract provider from slash-separated model IDs', () => {
      expect(inferProviderFromModelId('openai/gpt-4.1-nano')).toBe('openai');
      expect(inferProviderFromModelId('anthropic/claude-sonnet-4-20250514')).toBe('anthropic');
      expect(inferProviderFromModelId('google/gemini-2.5-flash')).toBe('google');
      expect(inferProviderFromModelId('deepseek/deepseek-r1-0528')).toBe('deepseek');
      expect(inferProviderFromModelId('meta-llama/llama-4-maverick')).toBe('meta-llama');
    });

    test('should default to "default" for models without slash', () => {
      expect(inferProviderFromModelId('my-custom-model')).toBe('default');
      expect(inferProviderFromModelId('gpt4')).toBe('default');
      expect(inferProviderFromModelId('claude')).toBe('default');
    });

    test('should handle edge cases', () => {
      expect(inferProviderFromModelId('')).toBe('default');
      expect(inferProviderFromModelId('/')).toBe('default');
      expect(inferProviderFromModelId('provider/')).toBe('provider');
      expect(inferProviderFromModelId('/model')).toBe('default');
    });
  });

  describe('resolveProvider', () => {
    const tierProviders = {
      "openai/*": "openrouter",
      "google/*": "openrouter", 
      "deepseek/*": "openrouter",
      "meta-llama/*": "openrouter",
      "qwen/*": "openrouter",
      "anthropic/*": "anthropic"
    };

    test('should resolve via exact match first', () => {
      const exactProviders = {
        ...tierProviders,
        "openai/o3": "openai-direct"
      };

      const result = resolveProvider('openai/o3', exactProviders);
      expect(result.provider).toBe('openai-direct');
      expect(result.source).toBe('tierProviders');
      expect(result.matchedPattern).toBe('openai/o3');
    });

    test('should resolve via glob match second', () => {
      const result = resolveProvider('openai/gpt-4.1-nano', tierProviders);
      expect(result.provider).toBe('openrouter');
      expect(result.source).toBe('tierProviders');
      expect(result.matchedPattern).toBe('openai/*');
    });

    test('should fall back to prefix inference', () => {
      const result = resolveProvider('custom/my-model', tierProviders);
      expect(result.provider).toBe('custom');
      expect(result.source).toBe('native');
      expect(result.matchedPattern).toBeUndefined();
    });

    test('should fall back to default for no-slash models', () => {
      const result = resolveProvider('my-model', tierProviders);
      expect(result.provider).toBe('default');
      expect(result.source).toBe('default');
      expect(result.matchedPattern).toBeUndefined();
    });

    test('should handle no tierProviders config', () => {
      const result = resolveProvider('openai/gpt-4.1-nano');
      expect(result.provider).toBe('openai');
      expect(result.source).toBe('native');
    });

    test('should handle empty tierProviders config', () => {
      const result = resolveProvider('openai/gpt-4.1-nano', {});
      expect(result.provider).toBe('openai');
      expect(result.source).toBe('native');
    });
  });
});