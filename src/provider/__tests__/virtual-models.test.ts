// Create src/provider/__tests__/virtual-models.test.ts
import { describe, test, expect } from 'vitest';
import { 
  VIRTUAL_MODELS,
  getVirtualModelDefinitions,
  isVirtualModel,
  parseVirtualModelId,
  type VirtualModelConfig 
} from '../virtual-models.js';

describe('Virtual Models', () => {
  describe('VIRTUAL_MODELS constant', () => {
    test('should contain slimclaw/auto model definition', () => {
      const autoModel = VIRTUAL_MODELS.find(m => m.id === 'slimclaw/auto');
      expect(autoModel).toBeDefined();
      expect(autoModel?.name).toBe('SlimClaw Auto Router');
      expect(autoModel?.api).toBe('openai-completions');
      expect(autoModel?.reasoning).toBe(true);
      expect(autoModel?.input).toEqual(['text', 'image']);
      expect(autoModel?.contextWindow).toBe(200000);
      expect(autoModel?.maxTokens).toBe(16384);
    });

    test('should have valid cost structure for all models', () => {
      for (const model of VIRTUAL_MODELS) {
        expect(model.cost).toBeDefined();
        expect(model.cost.input).toBeGreaterThanOrEqual(0);
        expect(model.cost.output).toBeGreaterThanOrEqual(0);
        expect(model.cost.cacheRead).toBeGreaterThanOrEqual(0);
        expect(model.cost.cacheWrite).toBeGreaterThanOrEqual(0);
      }
    });

    test('should have superset capabilities for auto model', () => {
      const autoModel = VIRTUAL_MODELS.find(m => m.id === 'slimclaw/auto');
      expect(autoModel?.reasoning).toBe(true); // May route to reasoning models
      expect(autoModel?.input).toContain('text');
      expect(autoModel?.input).toContain('image');
      expect(autoModel?.contextWindow).toBe(200000); // Max across all targets
    });
  });

  describe('getVirtualModelDefinitions', () => {
    test('should return all virtual model definitions by default', () => {
      const models = getVirtualModelDefinitions();
      expect(models).toHaveLength(1); // Phase 1: only slimclaw/auto
      expect(models[0].id).toBe('slimclaw/auto');
    });

    test('should filter models based on enabled config', () => {
      const config: VirtualModelConfig = {
        auto: { enabled: false }
      };
      const models = getVirtualModelDefinitions(config);
      expect(models).toHaveLength(0);
    });

    test('should include model when enabled in config', () => {
      const config: VirtualModelConfig = {
        auto: { enabled: true }
      };
      const models = getVirtualModelDefinitions(config);
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('slimclaw/auto');
    });
  });

  describe('isVirtualModel', () => {
    test('should return true for valid virtual model IDs', () => {
      expect(isVirtualModel('slimclaw/auto')).toBe(true);
    });

    test('should return false for non-virtual model IDs', () => {
      expect(isVirtualModel('anthropic/claude-sonnet-4-20250514')).toBe(false);
      expect(isVirtualModel('openai/gpt-4')).toBe(false);
      expect(isVirtualModel('invalid')).toBe(false);
    });

    test('should return false for malformed IDs', () => {
      expect(isVirtualModel('slimclaw')).toBe(false); // Missing slash
      expect(isVirtualModel('slimclaw/')).toBe(false); // Empty model name
      expect(isVirtualModel('/auto')).toBe(false); // Missing provider
    });
  });

  describe('parseVirtualModelId', () => {
    test('should parse valid virtual model ID', () => {
      const result = parseVirtualModelId('slimclaw/auto');
      expect(result.provider).toBe('slimclaw');
      expect(result.modelName).toBe('auto');
      expect(result.isVirtual).toBe(true);
    });

    test('should handle non-virtual model ID', () => {
      const result = parseVirtualModelId('anthropic/claude-sonnet-4-20250514');
      expect(result.provider).toBe('anthropic');
      expect(result.modelName).toBe('claude-sonnet-4-20250514');
      expect(result.isVirtual).toBe(false);
    });

    test('should throw for invalid format', () => {
      expect(() => parseVirtualModelId('invalid')).toThrow('Invalid model ID format');
      expect(() => parseVirtualModelId('slimclaw/')).toThrow('Invalid model ID format');
      expect(() => parseVirtualModelId('/auto')).toThrow('Invalid model ID format');
    });
  });
});