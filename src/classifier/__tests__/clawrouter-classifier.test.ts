/**
 * Tests for ClawRouter-based classifier
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { Message, ClassificationResult } from '../classify.js';
import { classifyWithRouter } from '../clawrouter-classifier.js';
import type { IRoutingProvider, RoutingDecision } from '../../routing/types.js';

// Mock the hybrid router with proper mock functions
const mockHybridRouter = {
  name: 'mock-hybrid-router',
  route: vi.fn(),
  isAvailable: vi.fn(() => true)
} satisfies IRoutingProvider;

// Mock the routing modules with proper constructor functions
vi.mock('../../routing/hybrid-router.js', () => ({
  HybridRouter: class MockHybridRouter {
    name = 'mock-hybrid-router';
    route = mockHybridRouter.route;
    isAvailable = mockHybridRouter.isAvailable;
  }
}));

vi.mock('../../routing/clawrouter-adapter.js', () => ({
  ClawRouterAdapter: class MockClawRouterAdapter {
    name = 'mock-clawrouter-adapter';
    route = vi.fn();
    isAvailable = vi.fn(() => true);
  }
}));

vi.mock('../../routing/heuristic-provider.js', () => ({
  HeuristicProvider: class MockHeuristicProvider {
    name = 'mock-heuristic-provider';
    route = vi.fn();
    isAvailable = vi.fn(() => true);
  }
}));

describe('classifyWithRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHybridRouter.isAvailable.mockReturnValue(true);
  });

  test('should return valid ClassificationResult', () => {
    const mockDecision: RoutingDecision = {
      model: 'claude-3-haiku',
      tier: 'simple',
      confidence: 0.8,
      savings: 0.6,
      costEstimate: 0.001
    };
    
    mockHybridRouter.route.mockReturnValue(mockDecision);

    const messages: Message[] = [
      { role: 'user', content: 'Hello! How are you?' }
    ];
    
    const result = classifyWithRouter(messages);
    
    // Should return ClassificationResult with expected shape
    expect(result).toHaveProperty('tier');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('scores');
    expect(result).toHaveProperty('signals');
    
    expect(result.tier).toBe('simple');
    expect(result.confidence).toBe(0.8);
    expect(typeof result.reason).toBe('string');
    expect(typeof result.scores).toBe('object');
    expect(Array.isArray(result.signals)).toBe(true);
  });

  test('should delegate to HybridRouter', () => {
    const mockDecision: RoutingDecision = {
      model: 'claude-3-sonnet',
      tier: 'complex',
      confidence: 0.9,
      savings: 0.2,
      costEstimate: 0.01
    };
    
    mockHybridRouter.route.mockReturnValue(mockDecision);

    const messages: Message[] = [
      { role: 'user', content: 'I need help with a complex algorithm optimization problem.' }
    ];
    
    const result = classifyWithRouter(messages, { customConfig: 'test' });
    
    // Should have called the router with correct parameters
    expect(mockHybridRouter.route).toHaveBeenCalledTimes(1);
    expect(mockHybridRouter.route).toHaveBeenCalledWith(
      'I need help with a complex algorithm optimization problem.',
      expect.any(Number), // contextTokens
      { customConfig: 'test' }
    );
    
    expect(result.tier).toBe('complex');
    expect(result.confidence).toBe(0.9);
  });

  test('should extract text from messages correctly', () => {
    const mockDecision: RoutingDecision = {
      model: 'claude-3-haiku',
      tier: 'mid',
      confidence: 0.7,
      savings: 0.4,
      costEstimate: 0.005
    };
    
    mockHybridRouter.route.mockReturnValue(mockDecision);

    const messages: Message[] = [
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'Assistant response' },
      { 
        role: 'user', 
        content: [
          { type: 'text', text: 'Second user message with blocks' },
          { type: 'text', text: 'Another text block' }
        ] 
      }
    ];
    
    classifyWithRouter(messages);
    
    // Should extract text from all messages and blocks
    expect(mockHybridRouter.route).toHaveBeenCalledWith(
      'First message Assistant response Second user message with blocks Another text block',
      expect.any(Number),
      undefined
    );
  });

  test('should calculate contextTokens from message content', () => {
    const mockDecision: RoutingDecision = {
      model: 'claude-3-haiku',
      tier: 'simple',
      confidence: 0.8,
      savings: 0.6,
      costEstimate: 0.001
    };
    
    mockHybridRouter.route.mockReturnValue(mockDecision);

    const longMessage = 'This is a long message. '.repeat(100); // ~2300 characters
    const messages: Message[] = [
      { role: 'user', content: longMessage }
    ];
    
    classifyWithRouter(messages);
    
    const [text, contextTokens] = mockHybridRouter.route.mock.calls[0];
    expect(contextTokens).toBeGreaterThan(0);
    expect(contextTokens).toBeLessThan(text.length); // rough heuristic: tokens < characters
  });

  test('should handle router failures gracefully', () => {
    mockHybridRouter.route.mockImplementation(() => {
      throw new Error('Router failed');
    });

    const messages: Message[] = [
      { role: 'user', content: 'Hello' }
    ];
    
    const result = classifyWithRouter(messages);
    
    // Should return fallback result when router fails
    expect(result).toHaveProperty('tier');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('scores');
    expect(result).toHaveProperty('signals');
    
    expect(result.reason).toContain('fallback');
    expect(result.signals).toContain('router:fallback');
  });

  test('should handle empty messages array', () => {
    const mockDecision: RoutingDecision = {
      model: 'claude-3-haiku',
      tier: 'simple',
      confidence: 0.5,
      savings: 1.0,
      costEstimate: 0.0
    };
    
    mockHybridRouter.route.mockReturnValue(mockDecision);

    const result = classifyWithRouter([]);
    
    expect(mockHybridRouter.route).toHaveBeenCalledWith('', 0, undefined);
    expect(result.tier).toBe('simple');
  });

  test('should map RoutingDecision fields to ClassificationResult correctly', () => {
    const mockDecision: RoutingDecision = {
      model: 'claude-3-opus',
      tier: 'reasoning',
      confidence: 0.95,
      savings: 0.1,
      costEstimate: 0.05
    };
    
    mockHybridRouter.route.mockReturnValue(mockDecision);

    const messages: Message[] = [
      { role: 'user', content: 'Complex reasoning task' }
    ];
    
    const result = classifyWithRouter(messages);
    
    expect(result.tier).toBe('reasoning');
    expect(result.confidence).toBe(0.95);
    expect(result.reason).toContain('claude-3-opus');
    expect(result.reason).toContain('reasoning');
    expect(result.signals).toContain('router:primary');
  });

  test('should pass config to router', () => {
    const mockDecision: RoutingDecision = {
      model: 'claude-3-haiku',
      tier: 'simple',
      confidence: 0.8,
      savings: 0.6,
      costEstimate: 0.001
    };
    
    mockHybridRouter.route.mockReturnValue(mockDecision);

    const messages: Message[] = [
      { role: 'user', content: 'Hello' }
    ];
    
    const config = { temperature: 0.5, maxTokens: 1000 };
    classifyWithRouter(messages, config);
    
    expect(mockHybridRouter.route).toHaveBeenCalledWith(
      'Hello',
      expect.any(Number),
      config
    );
  });

  test('should normalize uppercase tier values to lowercase', () => {
    mockHybridRouter.route.mockReturnValue({
      model: 'claude-haiku',
      tier: 'SIMPLE',
      confidence: 0.9,
      savings: 50,
      costEstimate: 0.01
    });

    const messages: Message[] = [{ role: 'user', content: 'hi' }];
    const result = classifyWithRouter(messages);

    expect(result.tier).toBe('simple');
    expect(result.scores.simple).toBeGreaterThan(result.scores.complex);
  });

  test('should fallback to mid tier for unknown tier values', () => {
    mockHybridRouter.route.mockReturnValue({
      model: 'claude-sonnet',
      tier: 'UNKNOWN_TIER',
      confidence: 0.7,
      savings: 30,
      costEstimate: 0.02
    });

    const messages: Message[] = [{ role: 'user', content: 'test' }];
    const result = classifyWithRouter(messages);

    expect(result.tier).toBe('mid');
  });
});