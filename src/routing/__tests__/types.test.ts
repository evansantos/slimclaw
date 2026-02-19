import { describe, it, expect } from 'vitest';
import type { RoutingDecision, IRoutingProvider } from '../types.js';

describe('RoutingDecision', () => {
  it('should have all required fields', () => {
    const decision: RoutingDecision = {
      model: 'gpt-4',
      tier: 'high',
      confidence: 0.9,
      savings: 50,
      costEstimate: 0.05
    };
    
    expect(decision.model).toBe('gpt-4');
    expect(decision.tier).toBe('high');
    expect(decision.confidence).toBe(0.9);
    expect(decision.savings).toBe(50);
    expect(decision.costEstimate).toBe(0.05);
  });
});

describe('IRoutingProvider', () => {
  it('should define the required interface', () => {
    const mockProvider: IRoutingProvider = {
      name: 'test-provider',
      route: (text: string, contextTokens: number, config?: Record<string, unknown>) => ({
        model: 'gpt-3.5-turbo',
        tier: 'low',
        confidence: 0.8,
        savings: 30,
        costEstimate: 0.02
      }),
      isAvailable: () => true
    };
    
    expect(mockProvider.name).toBe('test-provider');
    expect(mockProvider.isAvailable()).toBe(true);
    
    const result = mockProvider.route('test text', 100);
    expect(result.model).toBe('gpt-3.5-turbo');
    expect(result.confidence).toBe(0.8);
  });
});