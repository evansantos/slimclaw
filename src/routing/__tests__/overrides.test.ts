/**
 * Tests for routing override functionality
 */

import { describe, it, expect } from 'vitest';
import {
  checkHeaderOverride,
  checkPinnedModelConfig,
  checkConfidenceThreshold,
  processOverrides,
  type RoutingContext,
} from '../overrides.js';
import type { SlimClawConfig } from '../../config.js';

describe('overrides', () => {
  const mockRoutingConfig: SlimClawConfig['routing'] = {
    enabled: true,
    allowDowngrade: true,
    minConfidence: 0.4,
    pinnedModels: [
      'anthropic/claude-opus-4-20250514',
      'gpt-4-turbo'
    ],
    tiers: {}
  };

  describe('checkHeaderOverride', () => {
    it('should detect X-Model-Pinned header (lowercase)', () => {
      const ctx: RoutingContext = {
        headers: {
          'x-model-pinned': 'custom/pinned-model'
        }
      };

      const result = checkHeaderOverride(ctx);
      expect(result.shouldOverride).toBe(true);
      expect(result.overrideModel).toBe('custom/pinned-model');
      expect(result.reason).toBe('pinned-header');
      expect(result.details).toContain('X-Model-Pinned header specified');
    });

    it('should detect X-Model-Pinned header (uppercase)', () => {
      const ctx: RoutingContext = {
        headers: {
          'X-Model-Pinned': 'custom/pinned-model'
        }
      };

      const result = checkHeaderOverride(ctx);
      expect(result.shouldOverride).toBe(true);
      expect(result.overrideModel).toBe('custom/pinned-model');
      expect(result.reason).toBe('pinned-header');
    });

    it('should handle array header values', () => {
      const ctx: RoutingContext = {
        headers: {
          'x-model-pinned': ['custom/pinned-model', 'secondary-model']
        }
      };

      const result = checkHeaderOverride(ctx);
      expect(result.shouldOverride).toBe(true);
      expect(result.overrideModel).toBe('custom/pinned-model'); // Should take first value
    });

    it('should return no override when header is missing', () => {
      const ctx: RoutingContext = {
        headers: {
          'other-header': 'value'
        }
      };

      const result = checkHeaderOverride(ctx);
      expect(result.shouldOverride).toBe(false);
      expect(result.reason).toBe('none');
    });

    it('should handle missing headers object', () => {
      const ctx: RoutingContext = {};

      const result = checkHeaderOverride(ctx);
      expect(result.shouldOverride).toBe(false);
      expect(result.reason).toBe('none');
    });
  });

  describe('checkPinnedModelConfig', () => {
    it('should detect pinned model in configuration', () => {
      const result = checkPinnedModelConfig('anthropic/claude-opus-4-20250514', mockRoutingConfig);
      expect(result.shouldOverride).toBe(true);
      expect(result.overrideModel).toBe('anthropic/claude-opus-4-20250514');
      expect(result.reason).toBe('pinned-config');
      expect(result.details).toContain('is in pinnedModels configuration');
    });

    it('should not detect non-pinned model', () => {
      const result = checkPinnedModelConfig('anthropic/claude-3-haiku-20240307', mockRoutingConfig);
      expect(result.shouldOverride).toBe(false);
      expect(result.reason).toBe('none');
    });

    it('should handle empty pinnedModels array', () => {
      const emptyConfig: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        pinnedModels: []
      };

      const result = checkPinnedModelConfig('any-model', emptyConfig);
      expect(result.shouldOverride).toBe(false);
      expect(result.reason).toBe('none');
    });

    it('should handle missing pinnedModels configuration', () => {
      const configWithoutPinned: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        pinnedModels: undefined
      };

      const result = checkPinnedModelConfig('any-model', configWithoutPinned);
      expect(result.shouldOverride).toBe(false);
      expect(result.reason).toBe('none');
    });
  });

  describe('checkConfidenceThreshold', () => {
    it('should detect confidence below threshold', () => {
      const result = checkConfidenceThreshold(0.3, mockRoutingConfig);
      expect(result.shouldOverride).toBe(true);
      expect(result.reason).toBe('none');
      expect(result.details).toContain('Confidence 0.3 below threshold 0.4');
    });

    it('should allow confidence above threshold', () => {
      const result = checkConfidenceThreshold(0.7, mockRoutingConfig);
      expect(result.shouldOverride).toBe(false);
      expect(result.reason).toBe('none');
    });

    it('should allow confidence equal to threshold', () => {
      const result = checkConfidenceThreshold(0.4, mockRoutingConfig);
      expect(result.shouldOverride).toBe(false);
      expect(result.reason).toBe('none');
    });

    it('should use default threshold when not configured', () => {
      const configWithoutThreshold: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        minConfidence: undefined
      };

      const result = checkConfidenceThreshold(0.3, configWithoutThreshold);
      expect(result.shouldOverride).toBe(true);
      expect(result.details).toContain('below threshold 0.4'); // Default threshold
    });
  });

  describe('processOverrides', () => {
    const baseCtx: RoutingContext = {
      originalModel: 'anthropic/claude-sonnet-4-20250514'
    };

    it('should prioritize header override over other overrides', () => {
      const ctx: RoutingContext = {
        ...baseCtx,
        headers: {
          'x-model-pinned': 'header/override-model'
        }
      };

      // Even though the original model is in pinnedModels, header should win
      const pinnedConfig: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        pinnedModels: ['anthropic/claude-sonnet-4-20250514']
      };

      const result = processOverrides(
        'anthropic/claude-sonnet-4-20250514',
        'complex',
        0.8,
        pinnedConfig,
        ctx
      );

      expect(result.shouldOverride).toBe(true);
      expect(result.overrideModel).toBe('header/override-model');
      expect(result.reason).toBe('pinned-header');
    });

    it('should apply pinned model config when no header override', () => {
      const result = processOverrides(
        'anthropic/claude-opus-4-20250514',
        'complex',
        0.8,
        mockRoutingConfig,
        baseCtx
      );

      expect(result.shouldOverride).toBe(true);
      expect(result.overrideModel).toBe('anthropic/claude-opus-4-20250514');
      expect(result.reason).toBe('pinned-config');
    });

    it('should block routing on low confidence', () => {
      const result = processOverrides(
        'regular-model',
        'complex',
        0.2, // Low confidence
        mockRoutingConfig,
        baseCtx
      );

      expect(result.shouldOverride).toBe(true);
      expect(result.overrideModel).toBe('regular-model'); // Original model preserved
      expect(result.reason).toBe('none');
      expect(result.details).toContain('Confidence');
    });

    it('should return no override when all checks pass', () => {
      const result = processOverrides(
        'regular-model',
        'complex',
        0.8, // High confidence
        mockRoutingConfig,
        baseCtx
      );

      expect(result.shouldOverride).toBe(false);
      expect(result.reason).toBe('none');
    });

    it('should handle priority correctly with multiple applicable overrides', () => {
      const ctx: RoutingContext = {
        ...baseCtx,
        headers: {
          'x-model-pinned': 'header/model'
        }
      };

      const pinnedConfig: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        pinnedModels: ['anthropic/claude-sonnet-4-20250514'],
        minConfidence: 0.8 // Would block low confidence
      };

      // Header should win even with pinned model and low confidence
      const result = processOverrides(
        'anthropic/claude-sonnet-4-20250514',
        'complex',
        0.2, // Low confidence but header overrides
        pinnedConfig,
        ctx
      );

      expect(result.shouldOverride).toBe(true);
      expect(result.overrideModel).toBe('header/model');
      expect(result.reason).toBe('pinned-header');
    });
  });
});