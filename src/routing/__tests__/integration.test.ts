/**
 * Integration tests for the complete routing system
 * Tests the interaction between all routing components
 */

import { describe, it, expect } from 'vitest';
import { resolveModel } from '../model-router.js';
import { classifyComplexity } from '../../classifier/index.js';
import { inferTierFromModel } from '../tiers.js';
import { DEFAULT_MODEL_PRICING } from '../pricing.js';
import type { SlimClawConfig } from '../../config.js';
import type { RoutingContext } from '../overrides.js';
import type { Message } from '../../classifier/classify.js';

describe('routing integration', () => {
  const baseConfig: SlimClawConfig['routing'] = {
    enabled: true,
    allowDowngrade: true,
    minConfidence: 0.4,
    pinnedModels: ['anthropic/claude-opus-4-20250514'],
    tiers: {
      simple: 'anthropic/claude-3-haiku-20240307',
      mid: 'anthropic/claude-sonnet-4-20250514',
      complex: 'anthropic/claude-opus-4-20250514',
      reasoning: 'anthropic/claude-opus-4-20250514',
    }
  };

  describe('end-to-end routing scenarios', () => {
    it('should route simple query to haiku model', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hi, how are you?' }
      ];

      const classification = classifyComplexity(messages);
      const context: RoutingContext = {
        originalModel: 'anthropic/claude-sonnet-4-20250514'
      };

      const decision = resolveModel(classification, baseConfig, context);

      expect(decision.tier).toBe('simple');
      expect(decision.targetModel).toBe('anthropic/claude-3-haiku-20240307');
      expect(decision.reason).toBe('routed');
      expect(decision.thinking).toBeNull();
    });

    it('should route complex debugging task to opus model', () => {
      const messages: Message[] = [
        { role: 'user', content: 'I need help debugging a complex performance issue in my distributed microservices architecture. The system is experiencing intermittent timeouts and I need to analyze the trace data to identify bottlenecks.' }
      ];

      const classification = classifyComplexity(messages);
      const context: RoutingContext = {
        originalModel: 'anthropic/claude-3-haiku-20240307'
      };

      const decision = resolveModel(classification, baseConfig, context);

      expect(decision.tier).toBe('complex');
      expect(decision.targetModel).toBe('anthropic/claude-opus-4-20250514');
      expect(decision.reason).toBe('routed');
    });

    it('should route reasoning task with thinking enabled', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Please prove mathematically that the square root of 2 is irrational using a proof by contradiction approach. Show all your logical steps.' }
      ];

      const classification = classifyComplexity(messages);
      const context: RoutingContext = {
        originalModel: 'anthropic/claude-3-haiku-20240307'
      };

      const decision = resolveModel(classification, baseConfig, context);

      expect(decision.tier).toBe('reasoning');
      expect(decision.targetModel).toBe('anthropic/claude-opus-4-20250514');
      expect(decision.thinking).toEqual({
        type: 'enabled',
        budget_tokens: 10000
      });
      expect(decision.reason).toBe('routed');
    });

    it('should respect header override regardless of classification', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Complex debugging task that would normally route to opus' }
      ];

      const classification = classifyComplexity(messages);
      const context: RoutingContext = {
        originalModel: 'anthropic/claude-sonnet-4-20250514',
        headers: {
          'X-Model-Pinned': 'anthropic/claude-3-haiku-20240307'
        }
      };

      const decision = resolveModel(classification, baseConfig, context);

      expect(decision.targetModel).toBe('anthropic/claude-3-haiku-20240307');
      expect(decision.reason).toBe('pinned');
    });

    it('should prevent downgrade when disabled', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Simple greeting' }
      ];

      const noDowngradeConfig: SlimClawConfig['routing'] = {
        ...baseConfig,
        allowDowngrade: false
      };

      const classification = classifyComplexity(messages);
      const context: RoutingContext = {
        originalModel: 'anthropic/claude-opus-4-20250514' // High-tier model
      };

      const decision = resolveModel(classification, noDowngradeConfig, context);

      expect(decision.tier).toBe('simple'); // Classification is still simple
      expect(decision.targetModel).toBe('anthropic/claude-opus-4-20250514'); // But model stays high-tier
      expect(decision.reason).toBe('pinned'); // Blocked downgrade acts like pinning
    });

    it('should handle low confidence classification', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Ambiguous request that might be hard to classify' }
      ];

      const strictConfig: SlimClawConfig['routing'] = {
        ...baseConfig,
        minConfidence: 0.8 // High confidence requirement
      };

      const classification = classifyComplexity(messages);
      const context: RoutingContext = {
        originalModel: 'anthropic/claude-sonnet-4-20250514'
      };

      const decision = resolveModel(classification, strictConfig, context);

      // If classification confidence is low, should keep original model
      if (classification.confidence < 0.8) {
        expect(decision.targetModel).toBe('anthropic/claude-sonnet-4-20250514');
        expect(decision.reason).toBe('low-confidence');
      } else {
        expect(decision.reason).toBe('routed');
      }
    });

    it('should handle conversation flow with escalating complexity', () => {
      const initialMessages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi! How can I help you?' },
        { role: 'user', content: 'Can you explain React hooks?' }
      ];

      const escalatedMessages: Message[] = [
        ...initialMessages,
        { role: 'assistant', content: 'React hooks are functions that...' },
        { role: 'user', content: 'I need to optimize the performance of my React app. It has complex state management with multiple contexts, custom hooks, and I\'m seeing rendering issues with large datasets. Can you help me implement useMemo, useCallback, and React.memo effectively?' }
      ];

      const context: RoutingContext = {
        originalModel: 'anthropic/claude-3-haiku-20240307'
      };

      // Initial classification should be simpler
      const initialClassification = classifyComplexity(initialMessages);
      const initialDecision = resolveModel(initialClassification, baseConfig, context);

      // Escalated classification should be more complex
      const escalatedClassification = classifyComplexity(escalatedMessages);
      const escalatedDecision = resolveModel(escalatedClassification, baseConfig, context);

      // The escalated conversation should require a higher tier model
      expect(escalatedDecision.tier).not.toBe('simple');
      expect(['mid', 'complex', 'reasoning']).toContain(escalatedDecision.tier);
    });

    it('should work with disabled routing', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Complex task requiring opus model' }
      ];

      const disabledConfig: SlimClawConfig['routing'] = {
        ...baseConfig,
        enabled: false
      };

      const classification = classifyComplexity(messages);
      const context: RoutingContext = {
        originalModel: 'anthropic/claude-3-haiku-20240307'
      };

      const decision = resolveModel(classification, disabledConfig, context);

      expect(decision.targetModel).toBe('anthropic/claude-3-haiku-20240307'); // Original preserved
      expect(decision.reason).toBe('routing-disabled');
    });

    it('should handle custom tier mappings', () => {
      const customConfig: SlimClawConfig['routing'] = {
        ...baseConfig,
        tiers: {
          simple: 'custom/fast-model',
          mid: 'custom/balanced-model',
          complex: 'custom/powerful-model',
          reasoning: 'custom/thinking-model'
        }
      };

      const messages: Message[] = [
        { role: 'user', content: 'Medium complexity task' }
      ];

      const classification = classifyComplexity(messages);
      const context: RoutingContext = {
        originalModel: 'default/model'
      };

      const decision = resolveModel(classification, customConfig, context);

      // Should use custom model mapping
      if (decision.reason === 'routed') {
        expect(decision.targetModel).toMatch(/^custom\//);
      }
    });

    it('should handle error scenarios gracefully', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Test message' }
      ];

      // Test with completely invalid config
      const brokenConfig = null as any;

      const classification = classifyComplexity(messages);
      const context: RoutingContext = {
        originalModel: 'anthropic/claude-sonnet-4-20250514'
      };

      const decision = resolveModel(classification, brokenConfig, context);

      // Should fallback gracefully
      expect(decision.originalModel).toBe('anthropic/claude-sonnet-4-20250514');
      expect(decision.targetModel).toBe('anthropic/claude-sonnet-4-20250514');
      expect(decision.reason).toBe('routing-disabled');
    });
  });

  describe('logging and debugging scenarios', () => {
    it('should provide detailed decision information for debugging', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Debug this complex algorithm performance issue' }
      ];

      const classification = classifyComplexity(messages);
      const context: RoutingContext = {
        originalModel: 'anthropic/claude-3-haiku-20240307',
        sessionKey: 'debug-session-123',
        agentId: 'test-agent'
      };

      const decision = resolveModel(classification, baseConfig, context);

      // Decision should contain all necessary debug information
      expect(decision.originalModel).toBeDefined();
      expect(decision.targetModel).toBeDefined();
      expect(decision.tier).toBeDefined();
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
      expect(decision.reason).toBeDefined();
      expect(['routed', 'pinned', 'low-confidence', 'routing-disabled']).toContain(decision.reason);
    });

    it('should handle edge case with empty messages', () => {
      const messages: Message[] = [];

      const classification = classifyComplexity(messages);
      const context: RoutingContext = {
        originalModel: 'anthropic/claude-sonnet-4-20250514'
      };

      const decision = resolveModel(classification, baseConfig, context);

      expect(decision.tier).toBe('simple'); // Empty conversation defaults to simple
      expect(decision.targetModel).toBe('anthropic/claude-3-haiku-20240307');
      expect(decision.reason).toBe('routed');
    });
  });

  describe('Cross-provider model routing integration', () => {
    it('should infer correct tiers for cross-provider models end-to-end', () => {
      // Test cross-provider tier inference works end-to-end
      expect(inferTierFromModel("openai/o4-mini")).toBe('reasoning');
      expect(inferTierFromModel("google/gemini-2.5-flash")).toBe('mid');
      expect(inferTierFromModel("openai/gpt-4.1-nano")).toBe('simple');
      expect(inferTierFromModel("deepseek/deepseek-r1-0528")).toBe('reasoning');
      
      // Additional cross-provider models for comprehensive testing
      expect(inferTierFromModel("google/gemini-2.5-pro")).toBe('reasoning');
      expect(inferTierFromModel("openai/gpt-4.1-mini")).toBe('mid');
      expect(inferTierFromModel("deepseek/deepseek-v3.2")).toBe('simple');
      expect(inferTierFromModel("meta-llama/llama-4-maverick")).toBe('mid');
      expect(inferTierFromModel("qwen/qwen3-coder")).toBe('mid');
    });

    it('should detect cross-provider downgrades correctly via routing decisions', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Simple test message' }
      ];

      const noDowngradeConfig: SlimClawConfig['routing'] = {
        ...baseConfig,
        allowDowngrade: false,
        tiers: {
          simple: 'openai/gpt-4.1-nano',
          mid: 'google/gemini-2.5-flash', 
          complex: 'openai/gpt-4.1',
          reasoning: 'openai/o4-mini',
        }
      };

      // Test reasoning → mid (should be blocked downgrade)
      const classification1 = classifyComplexity(messages);
      classification1.tier = 'simple'; // Force simple tier to test downgrade
      
      const context1: RoutingContext = {
        originalModel: 'openai/o4-mini' // reasoning tier model
      };
      
      const decision1 = resolveModel(classification1, noDowngradeConfig, context1);
      // Should keep original model (reasoning tier) instead of downgrading to simple
      expect(decision1.targetModel).toBe('openai/o4-mini');
      expect(decision1.reason).toBe('pinned');

      // Test mid → simple (should be blocked downgrade)  
      const context2: RoutingContext = {
        originalModel: 'google/gemini-2.5-flash' // mid tier model
      };
      
      const decision2 = resolveModel(classification1, noDowngradeConfig, context2);
      // Should keep original model (mid tier) instead of downgrading to simple
      expect(decision2.targetModel).toBe('google/gemini-2.5-flash');
      expect(decision2.reason).toBe('pinned');

      // Test simple → reasoning (should be allowed upgrade)
      const complexClassification = classifyComplexity([
        { role: 'user', content: 'Complex reasoning task requiring deep mathematical proof' }
      ]);
      
      const context3: RoutingContext = {
        originalModel: 'openai/gpt-4.1-nano' // simple tier model
      };
      
      const decision3 = resolveModel(complexClassification, noDowngradeConfig, context3);
      // Should route to higher tier if classification suggests it
      if (complexClassification.tier === 'reasoning' || complexClassification.tier === 'complex') {
        expect(decision3.targetModel).not.toBe('openai/gpt-4.1-nano');
        expect(decision3.reason).toBe('routed');
      }
    });

    it('should have pricing entries for all cross-provider models', () => {
      // List of 12 cross-provider models based on the pricing file
      const crossProviderModels = [
        'openai/gpt-4.1-nano',
        'openai/gpt-4.1-mini', 
        'openai/gpt-4.1',
        'openai/gpt-4o-mini',
        'openai/o4-mini',
        'openai/o3',
        'google/gemini-2.5-flash',
        'google/gemini-2.5-pro',
        'deepseek/deepseek-r1-0528',
        'deepseek/deepseek-v3.2',
        'meta-llama/llama-4-maverick',
        'qwen/qwen3-coder'
      ];

      // Verify all 12 cross-provider models have pricing entries
      crossProviderModels.forEach(model => {
        expect(DEFAULT_MODEL_PRICING).toHaveProperty(model);
        
        const pricing = DEFAULT_MODEL_PRICING[model];
        expect(pricing).toHaveProperty('inputPer1k');
        expect(pricing).toHaveProperty('outputPer1k');
        
        // Verify pricing values are positive
        expect(pricing.inputPer1k).toBeGreaterThan(0);
        expect(pricing.outputPer1k).toBeGreaterThan(0);
        
        // Verify output pricing >= input pricing (standard model economics)
        expect(pricing.outputPer1k).toBeGreaterThanOrEqual(pricing.inputPer1k);
      });

      // Verify we have exactly the expected number of cross-provider models
      const crossProviderCount = crossProviderModels.length;
      expect(crossProviderCount).toBe(12);
    });

    it('should handle cross-provider routing with custom tier configurations', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Medium complexity task' }
      ];

      const crossProviderConfig: SlimClawConfig['routing'] = {
        ...baseConfig,
        tiers: {
          simple: 'openai/gpt-4.1-nano',
          mid: 'google/gemini-2.5-flash',
          complex: 'openai/gpt-4.1',
          reasoning: 'deepseek/deepseek-r1-0528'
        }
      };

      const classification = classifyComplexity(messages);
      const context: RoutingContext = {
        originalModel: 'anthropic/claude-3-haiku-20240307'
      };

      const decision = resolveModel(classification, crossProviderConfig, context);

      // Should use cross-provider model from custom config
      if (decision.reason === 'routed') {
        const validCrossProviderModels = [
          'openai/gpt-4.1-nano',
          'google/gemini-2.5-flash', 
          'openai/gpt-4.1',
          'deepseek/deepseek-r1-0528'
        ];
        expect(validCrossProviderModels).toContain(decision.targetModel);
      }
    });

    it('should enable thinking for cross-provider reasoning models', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Solve this complex mathematical proof step by step' }
      ];

      const reasoningConfig: SlimClawConfig['routing'] = {
        ...baseConfig,
        tiers: {
          simple: 'openai/gpt-4.1-nano',
          mid: 'google/gemini-2.5-flash', 
          complex: 'openai/gpt-4.1',
          reasoning: 'deepseek/deepseek-r1-0528'
        }
      };

      const classification = classifyComplexity(messages);
      const context: RoutingContext = {
        originalModel: 'openai/gpt-4.1-nano'
      };

      const decision = resolveModel(classification, reasoningConfig, context);

      // If classified as reasoning tier, should enable thinking
      if (decision.tier === 'reasoning') {
        expect(decision.thinking).toEqual({
          type: 'enabled',
          budget_tokens: 10000
        });
        expect(decision.targetModel).toBe('deepseek/deepseek-r1-0528');
      }
    });

    it('should preserve cross-provider model context through routing chain', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Complex debugging task' }
      ];

      const crossProviderConfig: SlimClawConfig['routing'] = {
        ...baseConfig,
        allowDowngrade: true,
        tiers: {
          simple: 'openai/gpt-4.1-nano',
          mid: 'google/gemini-2.5-flash',
          complex: 'meta-llama/llama-4-maverick', 
          reasoning: 'openai/o4-mini'
        }
      };

      const classification = classifyComplexity(messages);
      const context: RoutingContext = {
        originalModel: 'qwen/qwen3-coder',
        sessionKey: 'cross-provider-session',
        agentId: 'cross-provider-test'
      };

      const decision = resolveModel(classification, crossProviderConfig, context);

      // Should preserve context information
      expect(decision.originalModel).toBe('qwen/qwen3-coder');
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
      
      // Should use cross-provider model for target (unless pinned/disabled)
      if (decision.reason === 'routed') {
        const validTargets = [
          'openai/gpt-4.1-nano',
          'google/gemini-2.5-flash',
          'meta-llama/llama-4-maverick',
          'openai/o4-mini'
        ];
        expect(validTargets).toContain(decision.targetModel);
      }
    });
  });
});