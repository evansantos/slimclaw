import { describe, test, expect } from 'vitest';
import { validateConfig, DEFAULT_CONFIG, type SlimClawConfig } from '../config.js';

describe('Phase 3a Configuration Schema', () => {
  describe('dynamicPricing configuration', () => {
    test('should accept valid dynamicPricing config', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          dynamicPricing: {
            enabled: true,
            ttlMs: 3600000, // 1 hour
            refreshIntervalMs: 3600000,
            timeoutMs: 3000,
            apiUrl: 'https://openrouter.ai/api/v1/models'
          }
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.dynamicPricing?.enabled).toBe(true);
        expect(result.data.routing.dynamicPricing?.ttlMs).toBe(3600000);
        expect(result.data.routing.dynamicPricing?.timeoutMs).toBe(3000);
        expect(result.data.routing.dynamicPricing?.apiUrl).toBe('https://openrouter.ai/api/v1/models');
      }
    });

    test('should use default dynamicPricing values', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          dynamicPricing: {
            enabled: true
          }
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.dynamicPricing?.enabled).toBe(true);
        expect(result.data.routing.dynamicPricing?.ttlMs).toBe(21600000); // 6 hours
        expect(result.data.routing.dynamicPricing?.timeoutMs).toBe(10000);
        expect(result.data.routing.dynamicPricing?.apiUrl).toBe('https://openrouter.ai/api/v1/models');
      }
    });

    test('should be optional field with defaults when not provided', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.dynamicPricing).toBeDefined();
        expect(result.data.routing.dynamicPricing?.enabled).toBe(false); // Default false
      }
    });

    test('should validate ttlMs range', () => {
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          dynamicPricing: {
            enabled: true,
            ttlMs: -1000 // Invalid negative value
          }
        }
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });

    test('should validate timeoutMs range', () => {
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          dynamicPricing: {
            enabled: true,
            timeoutMs: 0 // Invalid zero timeout
          }
        }
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });

    test('should validate apiUrl format', () => {
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          dynamicPricing: {
            enabled: true,
            apiUrl: '' // Invalid empty URL
          }
        }
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });
  });

  describe('latencyTracking configuration', () => {
    test('should accept valid latencyTracking config', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          latencyTracking: {
            enabled: true,
            bufferSize: 25,
            outlierThresholdMs: 30000
          }
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.latencyTracking?.enabled).toBe(true);
        expect(result.data.routing.latencyTracking?.bufferSize).toBe(25);
        expect(result.data.routing.latencyTracking?.outlierThresholdMs).toBe(30000);
      }
    });

    test('should use default latencyTracking values', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          latencyTracking: {
            enabled: true
          }
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.latencyTracking?.enabled).toBe(true);
        expect(result.data.routing.latencyTracking?.bufferSize).toBe(100);
        expect(result.data.routing.latencyTracking?.outlierThresholdMs).toBe(60000);
      }
    });

    test('should be optional field with defaults when not provided', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.latencyTracking).toBeDefined();
        expect(result.data.routing.latencyTracking?.enabled).toBe(true); // Default true
      }
    });

    test('should validate bufferSize range', () => {
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          latencyTracking: {
            enabled: true,
            bufferSize: 0 // Invalid zero buffer
          }
        }
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });

    test('should validate outlierThresholdMs range', () => {
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          latencyTracking: {
            enabled: true,
            outlierThresholdMs: -1000 // Invalid negative threshold
          }
        }
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });

    test('should validate bufferSize upper limit', () => {
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          latencyTracking: {
            enabled: true,
            bufferSize: 10000 // Too large
          }
        }
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });
  });

  describe('combined Phase 3a configuration', () => {
    test('should accept both dynamicPricing and latencyTracking', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          dynamicPricing: {
            enabled: true,
            ttlMs: 1800000 // 30 minutes
          },
          latencyTracking: {
            enabled: true,
            bufferSize: 200
          }
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.dynamicPricing?.enabled).toBe(true);
        expect(result.data.routing.latencyTracking?.enabled).toBe(true);
        expect(result.data.routing.dynamicPricing?.ttlMs).toBe(1800000);
        expect(result.data.routing.latencyTracking?.bufferSize).toBe(200);
      }
    });

    test('should work with existing routing configuration', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          allowDowngrade: true,
          minConfidence: 0.6,
          pinnedModels: ['anthropic/claude-opus-4-20250514'],
          tiers: {
            simple: 'openai/gpt-4.1-nano',
            mid: 'google/gemini-2.5-flash',
            complex: 'anthropic/claude-opus-4-20250514',
            reasoning: 'openai/o4-mini'
          },
          tierProviders: {
            'openai/*': 'openrouter',
            'google/*': 'openrouter'
          },
          dynamicPricing: {
            enabled: true
          },
          latencyTracking: {
            enabled: true
          }
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.enabled).toBe(true);
        expect(result.data.routing.minConfidence).toBe(0.6);
        expect(result.data.routing.pinnedModels).toContain('anthropic/claude-opus-4-20250514');
        expect(result.data.routing.dynamicPricing?.enabled).toBe(true);
        expect(result.data.routing.latencyTracking?.enabled).toBe(true);
      }
    });
  });

  describe('field name consistency', () => {
    test('should use consistent field names for dynamic pricing', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          dynamicPricing: {
            enabled: true,
            ttlMs: 21600000, // 6 hours
            refreshIntervalMs: 21600000,
            timeoutMs: 10000,
            apiUrl: 'https://openrouter.ai/api/v1/models'
          }
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        // Verify all expected fields are present
        const dynamicPricing = result.data.routing.dynamicPricing;
        expect(dynamicPricing).toBeDefined();
        expect(typeof dynamicPricing?.enabled).toBe('boolean');
        expect(typeof dynamicPricing?.ttlMs).toBe('number');
        expect(typeof dynamicPricing?.refreshIntervalMs).toBe('number');
        expect(typeof dynamicPricing?.timeoutMs).toBe('number');
        expect(typeof dynamicPricing?.apiUrl).toBe('string');
      }
    });

    test('should use consistent field names for latency tracking', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          latencyTracking: {
            enabled: true,
            bufferSize: 100,
            outlierThresholdMs: 60000
          }
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        // Verify all expected fields are present
        const latencyTracking = result.data.routing.latencyTracking;
        expect(latencyTracking).toBeDefined();
        expect(typeof latencyTracking?.enabled).toBe('boolean');
        expect(typeof latencyTracking?.bufferSize).toBe('number');
        expect(typeof latencyTracking?.outlierThresholdMs).toBe('number');
      }
    });
  });
});