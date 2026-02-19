import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HybridRouter } from '../hybrid-router.js';
import type { IRoutingProvider, RoutingDecision } from '../types.js';

describe('HybridRouter', () => {
  let primaryProvider: IRoutingProvider;
  let fallbackProvider: IRoutingProvider;
  let router: HybridRouter;

  const mockDecision: RoutingDecision = {
    model: 'test-model',
    tier: 'mid',
    confidence: 0.8,
    savings: 10,
    costEstimate: 0.02
  };

  beforeEach(() => {
    vi.useFakeTimers();
    
    primaryProvider = {
      name: 'primary',
      route: vi.fn(),
      isAvailable: vi.fn().mockReturnValue(true)
    };

    fallbackProvider = {
      name: 'fallback', 
      route: vi.fn(),
      isAvailable: vi.fn().mockReturnValue(true)
    };

    router = new HybridRouter(primaryProvider, fallbackProvider);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create router with correct name', () => {
      expect(router.name).toBe('hybrid(primary,fallback)');
    });

    it('should use default options when not provided', () => {
      const routerWithDefaults = new HybridRouter(primaryProvider, fallbackProvider);
      expect(routerWithDefaults.name).toBe('hybrid(primary,fallback)');
      // Default behavior should work as tested in other tests
    });

    it('should accept custom options', () => {
      const customOptions = {
        maxFailures: 5,
        cooldownMs: 30000,
        confidenceThreshold: 0.7
      };
      const customRouter = new HybridRouter(primaryProvider, fallbackProvider, customOptions);
      expect(customRouter.name).toBe('hybrid(primary,fallback)');
      
      // Test custom confidence threshold by using a decision with confidence 0.6
      const mediumConfidenceDecision = { ...mockDecision, confidence: 0.6 };
      const fallbackDecision = { ...mockDecision, model: 'fallback-model' };
      
      (primaryProvider.route as any).mockReturnValue(mediumConfidenceDecision);
      (fallbackProvider.route as any).mockReturnValue(fallbackDecision);
      
      const result = customRouter.route('test', 100);
      
      // With confidence threshold 0.7, should fallback even with 0.6 confidence
      expect(fallbackProvider.route).toHaveBeenCalled();
    });
  });

  describe('isAvailable', () => {
    it('should return true when primary is available', () => {
      expect(router.isAvailable()).toBe(true);
    });

    it('should return true when only fallback is available', () => {
      (primaryProvider.isAvailable as any).mockReturnValue(false);
      expect(router.isAvailable()).toBe(true);
    });

    it('should return false when neither provider is available', () => {
      (primaryProvider.isAvailable as any).mockReturnValue(false);
      (fallbackProvider.isAvailable as any).mockReturnValue(false);
      expect(router.isAvailable()).toBe(false);
    });
  });

  describe('route', () => {

    it('should use primary provider when available and confident', () => {
      (primaryProvider.route as any).mockReturnValue(mockDecision);

      const result = router.route('test text', 100);

      expect(primaryProvider.route).toHaveBeenCalledWith('test text', 100, undefined);
      expect(fallbackProvider.route).not.toHaveBeenCalled();
      expect(result).toBe(mockDecision);
    });

    it('should fallback when primary confidence is too low', () => {
      const lowConfidenceDecision = { ...mockDecision, confidence: 0.3 };
      const fallbackDecision = { ...mockDecision, confidence: 0.9, model: 'fallback-model' };
      
      (primaryProvider.route as any).mockReturnValue(lowConfidenceDecision);
      (fallbackProvider.route as any).mockReturnValue(fallbackDecision);

      const result = router.route('test text', 100);

      expect(primaryProvider.route).toHaveBeenCalled();
      expect(fallbackProvider.route).toHaveBeenCalled();
      expect(result).toBe(fallbackDecision);
    });

    it('should fallback when primary throws error', () => {
      const fallbackDecision = { ...mockDecision, model: 'fallback-model' };
      
      (primaryProvider.route as any).mockImplementation(() => {
        throw new Error('Primary provider failed');
      });
      (fallbackProvider.route as any).mockReturnValue(fallbackDecision);

      const result = router.route('test text', 100);

      expect(fallbackProvider.route).toHaveBeenCalled();
      expect(result).toBe(fallbackDecision);
    });

    describe('circuit breaker', () => {
      it('should open circuit after 3 consecutive failures', () => {
        const fallbackDecision = { ...mockDecision, model: 'fallback-model' };
        
        (primaryProvider.route as any).mockImplementation(() => {
          throw new Error('Primary failed');
        });
        (fallbackProvider.route as any).mockReturnValue(fallbackDecision);

        // First 3 failures
        router.route('test1', 100);
        router.route('test2', 100);
        router.route('test3', 100);

        // 4th call should skip primary due to open circuit
        vi.clearAllMocks();
        router.route('test4', 100);

        expect(primaryProvider.route).not.toHaveBeenCalled();
        expect(fallbackProvider.route).toHaveBeenCalled();
      });

      it('should reset circuit after 60s cooldown', () => {
        const fallbackDecision = { ...mockDecision, model: 'fallback-model' };
        
        // Trip the circuit breaker
        (primaryProvider.route as any).mockImplementation(() => {
          throw new Error('Primary failed');
        });
        (fallbackProvider.route as any).mockReturnValue(fallbackDecision);

        router.route('test1', 100);
        router.route('test2', 100);
        router.route('test3', 100); // Circuit now open

        // Advance time by 60 seconds
        vi.advanceTimersByTime(60000);

        // Primary should now work again
        (primaryProvider.route as any).mockReturnValue(mockDecision);
        vi.clearAllMocks();

        const result = router.route('test after cooldown', 100);

        expect(primaryProvider.route).toHaveBeenCalled();
        expect(result).toBe(mockDecision);
      });

      it('should reset failure count on successful primary call', () => {
        const fallbackDecision = { ...mockDecision, model: 'fallback-model' };
        
        // 2 failures (not enough to trip circuit)
        (primaryProvider.route as any)
          .mockImplementationOnce(() => { throw new Error('Fail 1'); })
          .mockImplementationOnce(() => { throw new Error('Fail 2'); })
          .mockReturnValue(mockDecision); // Success on 3rd call

        (fallbackProvider.route as any).mockReturnValue(fallbackDecision);

        router.route('test1', 100); // Fail 1
        router.route('test2', 100); // Fail 2
        router.route('test3', 100); // Success - should reset counter

        // Now fail again - should not immediately trip circuit since counter was reset
        (primaryProvider.route as any).mockImplementationOnce(() => { 
          throw new Error('Fail after reset'); 
        });
        
        vi.clearAllMocks();
        router.route('test4', 100); // Should still try primary
        
        expect(primaryProvider.route).toHaveBeenCalled();
      });
    });

    it('should prefer fallback decision when both have same confidence', () => {
      // Use low confidence to force fallback comparison
      const primaryDecision = { ...mockDecision, confidence: 0.4 };
      const fallbackDecision = { ...mockDecision, confidence: 0.4, model: 'fallback-model' };
      
      (primaryProvider.route as any).mockReturnValue(primaryDecision);
      (fallbackProvider.route as any).mockReturnValue(fallbackDecision);

      const result = router.route('test text', 100);

      expect(result).toBe(fallbackDecision);
    });

    it('should handle case when fallback also fails', () => {
      (primaryProvider.route as any).mockImplementation(() => {
        throw new Error('Primary failed');
      });
      (fallbackProvider.route as any).mockImplementation(() => {
        throw new Error('Fallback failed');
      });

      expect(() => router.route('test text', 100)).toThrow('All routing providers failed');
    });
  });
});