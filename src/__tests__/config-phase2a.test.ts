import { describe, test, expect } from 'vitest';
import { validateConfig, DEFAULT_CONFIG, type SlimClawConfig } from '../config.js';

describe('config schema enhancements for Phase 2a', () => {
  describe('openRouterHeaders configuration', () => {
    test('should accept valid openRouterHeaders', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          openRouterHeaders: {
            'HTTP-Referer': 'https://myapp.com',
            'X-Title': 'MyCustomApp'
          }
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.openRouterHeaders).toEqual({
          'HTTP-Referer': 'https://myapp.com',
          'X-Title': 'MyCustomApp'
        });
      }
    });

    test('should be optional field', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.openRouterHeaders).toBeUndefined();
      }
    });

    test('should validate header value types', () => {
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          openRouterHeaders: {
            'HTTP-Referer': 123 // Should be string
          }
        }
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });
  });

  describe('shadowLogging configuration', () => {
    test('should accept shadowLogging boolean', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          shadowLogging: true
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.shadowLogging).toBe(true);
      }
    });

    test('should default shadowLogging to true', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.shadowLogging).toBe(true);
      }
    });

    test('should accept shadowLogging false', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          shadowLogging: false
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.shadowLogging).toBe(false);
      }
    });
  });

  describe('tierProviders validation', () => {
    test('should validate tierProviders patterns', () => {
      const validPatterns = {
        'openai/*': 'openrouter',
        'google/*': 'openrouter',
        'anthropic/*': 'anthropic',
        'openai/specific-model': 'custom-provider',
        '*': 'default-provider'
      };

      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          tierProviders: validPatterns
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.tierProviders).toEqual(validPatterns);
      }
    });

    test('should reject empty string patterns', () => {
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          tierProviders: {
            '': 'provider' // Empty pattern should be invalid
          }
        }
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });
  });
});