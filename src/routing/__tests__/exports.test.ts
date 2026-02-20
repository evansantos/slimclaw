/**
 * Test file to verify all Phase 2a exports are available
 * from the routing module index.
 */

import { describe, test, expect } from 'vitest';

// Import all Phase 2a exports we expect to be available
import {
  // Provider resolver exports
  resolveProvider,
  matchTierProvider,
  inferProviderFromModelId,
  type ProviderResolution,

  // Shadow router exports  
  buildShadowRecommendation,
  formatShadowLog,
  type ShadowRecommendation,

  // Routing decision exports
  makeRoutingDecision,
  buildOpenRouterHeaders,
  type RoutingOutput
} from '../index.js';

describe('Phase 2a routing exports', () => {
  describe('provider-resolver exports', () => {
    test('should export resolveProvider function', () => {
      expect(typeof resolveProvider).toBe('function');
    });

    test('should export matchTierProvider function', () => {
      expect(typeof matchTierProvider).toBe('function');
    });

    test('should export inferProviderFromModelId function', () => {
      expect(typeof inferProviderFromModelId).toBe('function');
    });

    test('resolveProvider should work with basic input', () => {
      const result = resolveProvider('openai/gpt-4');
      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('source');
      expect(result.provider).toBe('openai');
    });

    test('matchTierProvider should handle exact match', () => {
      expect(matchTierProvider('openai/gpt-4', 'openai/gpt-4')).toBe(true);
      expect(matchTierProvider('openai/gpt-4', 'openai/gpt-5')).toBe(false);
    });

    test('inferProviderFromModelId should extract provider', () => {
      expect(inferProviderFromModelId('openai/gpt-4')).toBe('openai');
      expect(inferProviderFromModelId('standalone-model')).toBe('default');
    });
  });

  describe('shadow-router exports', () => {
    test('should export buildShadowRecommendation function', () => {
      expect(typeof buildShadowRecommendation).toBe('function');
    });

    test('should export formatShadowLog function', () => {
      expect(typeof formatShadowLog).toBe('function');
    });
  });

  describe('routing-decision exports', () => {
    test('should export makeRoutingDecision function', () => {
      expect(typeof makeRoutingDecision).toBe('function');
    });

    test('should export buildOpenRouterHeaders function', () => {
      expect(typeof buildOpenRouterHeaders).toBe('function');
    });

    test('buildOpenRouterHeaders should create default headers', () => {
      const headers = buildOpenRouterHeaders();
      expect(headers['X-Title']).toBe('SlimClaw');
      expect(headers['HTTP-Referer']).toBe('slimclaw');
    });

    test('buildOpenRouterHeaders should accept custom values', () => {
      const headers = buildOpenRouterHeaders('CustomApp', 'https://example.com');
      expect(headers['X-Title']).toBe('CustomApp');
      expect(headers['HTTP-Referer']).toBe('https://example.com');
    });
  });

  describe('type exports', () => {
    test('should export ProviderResolution type', () => {
      // Type test - if this compiles, the type is exported
      const resolution: ProviderResolution = {
        provider: 'test',
        source: 'native'
      };
      expect(resolution.provider).toBe('test');
    });

    test('should export ShadowRecommendation type', () => {
      // Type test - if this compiles, the type is exported
      const recommendation: Partial<ShadowRecommendation> = {
        runId: 'test',
        actualModel: 'test'
      };
      expect(recommendation.runId).toBe('test');
    });

    test('should export RoutingOutput type', () => {
      // Type test - if this compiles, the type is exported
      const output: Partial<RoutingOutput> = {
        model: 'test',
        provider: 'test'
      };
      expect(output.model).toBe('test');
    });
  });
});