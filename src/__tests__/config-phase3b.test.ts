import { describe, test, expect } from 'vitest';
import { validateConfig, DEFAULT_CONFIG, type SlimClawConfig } from '../config.js';

describe('Phase 3b Configuration Schema', () => {
  describe('budget configuration', () => {
    test('should accept valid budget config', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          budget: {
            enabled: true,
            daily: { complex: 5.00, reasoning: 10.00 },
            weekly: { complex: 25.00, reasoning: 50.00 },
            alertThresholdPercent: 80,
            enforcementAction: 'alert-only'
          }
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.budget?.enabled).toBe(true);
        expect(result.data.routing.budget?.daily).toEqual({ complex: 5.00, reasoning: 10.00 });
        expect(result.data.routing.budget?.alertThresholdPercent).toBe(80);
      }
    });

    test('should use default budget values', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          budget: {
            enabled: true
          }
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.budget?.enabled).toBe(true);
        expect(result.data.routing.budget?.daily).toEqual({});
        expect(result.data.routing.budget?.weekly).toEqual({});
        expect(result.data.routing.budget?.alertThresholdPercent).toBe(80);
        expect(result.data.routing.budget?.enforcementAction).toBe('alert-only');
      }
    });

    test('should validate enforcementAction enum', () => {
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          budget: {
            enabled: true,
            daily: {},
            weekly: {},
            alertThresholdPercent: 80,
            enforcementAction: 'invalid-action' as any
          }
        }
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });

    test('should validate alertThresholdPercent range', () => {
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          budget: {
            enabled: true,
            daily: {},
            weekly: {},
            alertThresholdPercent: 150, // Invalid > 100
            enforcementAction: 'alert-only' as const
          }
        }
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });

    test('should validate budget amounts are non-negative', () => {
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          budget: {
            enabled: true,
            daily: { complex: -5.00 }, // Negative budget
            weekly: {},
            alertThresholdPercent: 80,
            enforcementAction: 'alert-only' as const
          }
        }
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });
  });

  describe('abTesting configuration', () => {
    test('should accept valid A/B testing config', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          abTesting: {
            enabled: true,
            experiments: [
              {
                id: 'exp-001',
                name: 'Test Experiment',
                tier: 'simple',
                variants: [
                  { id: 'control', model: 'openai/gpt-4.1-nano', weight: 50 },
                  { id: 'treatment', model: 'google/gemini-2.5-flash', weight: 50 }
                ],
                endAt: Date.now() + 86400000,
                minSamples: 100
              }
            ]
          }
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.abTesting?.enabled).toBe(true);
        expect(result.data.routing.abTesting?.experiments).toHaveLength(1);
        expect(result.data.routing.abTesting?.experiments[0].id).toBe('exp-001');
      }
    });

    test('should use default A/B testing values', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          abTesting: {
            enabled: true
          }
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.abTesting?.enabled).toBe(true);
        expect(result.data.routing.abTesting?.experiments).toEqual([]);
      }
    });

    test('should validate variant weights sum to 100', () => {
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          abTesting: {
            enabled: true,
            experiments: [{
              id: 'exp-001',
              name: 'Invalid Weights',
              tier: 'simple',
              variants: [
                { id: 'control', model: 'openai/gpt-4.1-nano', weight: 60 },
                { id: 'treatment', model: 'google/gemini-2.5-flash', weight: 50 } // Sum = 110
              ]
            }]
          }
        }
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });

    test('should validate variant weights are non-negative', () => {
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          abTesting: {
            enabled: true,
            experiments: [{
              id: 'exp-001',
              name: 'Negative Weight',
              tier: 'simple',
              variants: [
                { id: 'control', model: 'openai/gpt-4.1-nano', weight: 120 },
                { id: 'treatment', model: 'google/gemini-2.5-flash', weight: -20 }
              ]
            }]
          }
        }
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });

    test('should validate minimum samples is positive', () => {
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          abTesting: {
            enabled: true,
            experiments: [{
              id: 'exp-001',
              name: 'Invalid MinSamples',
              tier: 'simple',
              variants: [
                { id: 'control', model: 'openai/gpt-4.1-nano', weight: 50 },
                { id: 'treatment', model: 'google/gemini-2.5-flash', weight: 50 }
              ],
              minSamples: -10
            }]
          }
        }
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });

    test('should require at least one variant per experiment', () => {
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          abTesting: {
            enabled: true,
            experiments: [{
              id: 'exp-001',
              name: 'No Variants',
              tier: 'simple',
              variants: []
            }]
          }
        }
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });
  });

  describe('combined Phase 3b configuration', () => {
    test('should accept both budget and A/B testing', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          budget: {
            enabled: true,
            daily: { complex: 5.00 },
            weekly: { complex: 25.00 }
          },
          abTesting: {
            enabled: true,
            experiments: [{
              id: 'exp-001',
              name: 'Test',
              tier: 'simple',
              variants: [
                { id: 'control', model: 'openai/gpt-4.1-nano', weight: 100 }
              ]
            }]
          }
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.budget?.enabled).toBe(true);
        expect(result.data.routing.abTesting?.enabled).toBe(true);
      }
    });

    test('should work with all Phase 3 features combined', () => {
      const config: Partial<SlimClawConfig> = {
        routing: {
          enabled: true,
          // Phase 3a features
          dynamicPricing: {
            enabled: true,
            cacheTtlMs: 3600000
          },
          latencyTracking: {
            enabled: true,
            windowSize: 25
          },
          // Phase 3b features
          budget: {
            enabled: true,
            daily: { complex: 10.00 },
            enforcementAction: 'downgrade'
          },
          abTesting: {
            enabled: true,
            experiments: [{
              id: 'full-test',
              name: 'Full Feature Test',
              tier: 'mid',
              variants: [
                { id: 'a', model: 'openai/gpt-4.1-nano', weight: 50 },
                { id: 'b', model: 'google/gemini-2.5-flash', weight: 50 }
              ]
            }]
          }
        }
      };

      const result = validateConfig({ ...DEFAULT_CONFIG, ...config });
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.routing.dynamicPricing?.enabled).toBe(true);
        expect(result.data.routing.latencyTracking?.enabled).toBe(true);
        expect(result.data.routing.budget?.enabled).toBe(true);
        expect(result.data.routing.abTesting?.enabled).toBe(true);
      }
    });
  });
});