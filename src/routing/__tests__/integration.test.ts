/**
 * Integration tests for the complete routing system
 * Tests the interaction between all routing components
 */

import { describe, it, expect } from 'vitest';
import { resolveModel } from '../model-router.js';
import { classifyComplexity } from '../../classifier/index.js';
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
});