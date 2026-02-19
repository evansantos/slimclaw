import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClawRouterAdapter } from '../clawrouter-adapter.js';

// Mock the @blockrun/clawrouter module
vi.mock('@blockrun/clawrouter', () => ({
  route: vi.fn(),
  DEFAULT_ROUTING_CONFIG: { version: '1.0', tiers: [] }
}));

describe('ClawRouterAdapter', () => {
  let adapter: ClawRouterAdapter;
  
  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ClawRouterAdapter();
  });

  describe('constructor', () => {
    it('should create an instance with correct name', () => {
      expect(adapter.name).toBe('clawrouter');
    });
  });

  describe('isAvailable', () => {
    it('should return true when @blockrun/clawrouter is available', () => {
      expect(adapter.isAvailable()).toBe(true);
    });
  });

  describe('route', () => {
    it('should call @blockrun/clawrouter route function and return RoutingDecision', async () => {
      // Mock the @blockrun/clawrouter route function
      const { route } = await import('@blockrun/clawrouter');
      const mockRoute = route as any;
      
      mockRoute.mockReturnValue({
        model: 'gpt-3.5-turbo',
        tier: 'medium',
        confidence: 0.85,
        savings: 40,
        costEstimate: 0.03
      });

      const result = adapter.route('Test message for routing', 150, { temperature: 0.7 });

      expect(mockRoute).toHaveBeenCalledWith(
        'Test message for routing',   // prompt
        undefined,                    // systemPrompt
        150,                          // maxOutputTokens (number)
        {
          config: expect.any(Object), // DEFAULT_ROUTING_CONFIG
          modelPricing: expect.any(Map)
        }
      );
      expect(result).toEqual({
        model: 'gpt-3.5-turbo',
        tier: 'medium',
        confidence: 0.85,
        savings: 40,
        costEstimate: 0.03
      });
    });

    it('should handle case when clawrouter returns partial data', async () => {
      const { route } = await import('@blockrun/clawrouter');
      const mockRoute = route as any;
      
      mockRoute.mockReturnValue({
        model: 'gpt-4',
        confidence: 0.9
        // Missing tier, savings, costEstimate
      });

      const result = adapter.route('Another test message', 200);

      expect(result.model).toBe('gpt-4');
      expect(result.confidence).toBe(0.9);
      expect(result.tier).toBeDefined(); // Should provide defaults
      expect(result.savings).toBeDefined();
      expect(result.costEstimate).toBeDefined();
    });

    it('should handle errors from @blockrun/clawrouter gracefully', async () => {
      const { route } = await import('@blockrun/clawrouter');
      const mockRoute = route as any;
      
      mockRoute.mockImplementation(() => {
        throw new Error('ClawRouter service unavailable');
      });

      expect(() => adapter.route('Test message', 100)).toThrow('ClawRouter service unavailable');
    });
  });
});