import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeuristicProvider } from '../heuristic-provider.js';
import type { ComplexityTier } from '../tiers.js';

// Mock the existing routing functions
vi.mock('../overrides.js', () => ({
  processOverrides: vi.fn()
}));

vi.mock('../tiers.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTierModel: vi.fn()
  };
});

vi.mock('../../classifier/classify.js', () => ({
  classifyComplexity: vi.fn(),
  classifyQuickTier: vi.fn()
}));

describe('HeuristicProvider', () => {
  let provider: HeuristicProvider;
  
  beforeEach(() => {
    vi.clearAllMocks();
    provider = new HeuristicProvider();
  });

  describe('constructor', () => {
    it('should create an instance with correct name', () => {
      expect(provider.name).toBe('heuristic');
    });
  });

  describe('isAvailable', () => {
    it('should always return true', () => {
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('route', () => {
    it('should use existing classifier to make routing decisions', async () => {
      const { classifyComplexity } = await import('../../classifier/classify.js');
      const { getTierModel } = await import('../tiers.js');
      const { processOverrides } = await import('../overrides.js');
      
      const mockClassify = classifyComplexity as any;
      const mockGetTierModel = getTierModel as any;
      const mockOverrides = processOverrides as any;
      
      // Mock the classifier responses
      mockClassify.mockReturnValue({
        tier: 'simple' as ComplexityTier,
        confidence: 0.8,
        reason: 'Simple query classification',
        scores: { simple: 0.8, mid: 0.1, complex: 0.1, reasoning: 0.0 },
        signals: ['keyword:simple']
      });
      
      mockGetTierModel.mockReturnValue('anthropic/claude-3-haiku-20240307');
      
      mockOverrides.mockReturnValue({
        shouldOverride: false,
        reason: 'none'
      });

      const result = provider.route('What is 2+2?', 50);

      expect(mockClassify).toHaveBeenCalledWith([{ role: 'user', content: 'What is 2+2?' }]);
      expect(mockGetTierModel).toHaveBeenCalledWith('simple', undefined);
      
      expect(result).toEqual({
        model: 'anthropic/claude-3-haiku-20240307',
        tier: 'simple',
        confidence: 0.8,
        savings: expect.any(Number),
        costEstimate: expect.any(Number)
      });
    });

    it('should handle override scenarios', async () => {
      const { classifyComplexity } = await import('../../classifier/classify.js');
      const { getTierModel } = await import('../tiers.js');
      const { processOverrides } = await import('../overrides.js');
      
      const mockClassify = classifyComplexity as any;
      const mockGetTierModel = getTierModel as any;
      const mockOverrides = processOverrides as any;
      
      mockClassify.mockReturnValue({
        tier: 'mid' as ComplexityTier,
        confidence: 0.7,
        reason: 'Medium complexity',
        scores: { simple: 0.1, mid: 0.7, complex: 0.1, reasoning: 0.1 },
        signals: ['keyword:explain']
      });
      
      mockGetTierModel.mockReturnValue('anthropic/claude-sonnet-4-20250514');
      
      // Override with pinned model
      mockOverrides.mockReturnValue({
        shouldOverride: true,
        overrideModel: 'claude-3-sonnet',
        reason: 'pinned-header',
        details: 'X-Model-Pinned header specified'
      });

      const config = { 
        headers: { 'X-Model-Pinned': 'claude-3-sonnet' } 
      };
      const result = provider.route('Analyze this text', 200, config);

      expect(result.model).toBe('claude-3-sonnet');
      expect(result.tier).toBe('mid');
      expect(result.confidence).toBe(0.7);
    });

    it('should provide reasonable cost estimates', async () => {
      const { classifyComplexity } = await import('../../classifier/classify.js');
      const { getTierModel } = await import('../tiers.js');
      const { processOverrides } = await import('../overrides.js');
      
      const mockClassify = classifyComplexity as any;
      const mockGetTierModel = getTierModel as any;
      const mockOverrides = processOverrides as any;
      
      mockClassify.mockReturnValue({
        tier: 'complex' as ComplexityTier,
        confidence: 0.9,
        reason: 'Complex analysis required',
        scores: { simple: 0.05, mid: 0.05, complex: 0.9, reasoning: 0.0 },
        signals: ['keyword:analyze', 'length:long']
      });
      
      mockGetTierModel.mockReturnValue('anthropic/claude-opus-4-20250514');
      
      mockOverrides.mockReturnValue({
        shouldOverride: false,
        reason: 'none'
      });

      const result = provider.route('Write a comprehensive analysis', 1000);

      expect(result.costEstimate).toBeGreaterThan(0);
      expect(result.savings).toBeGreaterThanOrEqual(0);
      expect(typeof result.costEstimate).toBe('number');
      expect(typeof result.savings).toBe('number');
    });

    it('should handle low confidence scenarios', async () => {
      const { classifyComplexity } = await import('../../classifier/classify.js');
      const { getTierModel } = await import('../tiers.js');
      
      const mockClassify = classifyComplexity as any;
      const mockGetTierModel = getTierModel as any;
      
      mockClassify.mockReturnValue({
        tier: 'mid' as ComplexityTier,
        confidence: 0.3, // Low confidence
        reason: 'Uncertain classification',
        scores: { simple: 0.3, mid: 0.3, complex: 0.2, reasoning: 0.2 },
        signals: ['structural:ambiguous']
      });

      mockGetTierModel.mockReturnValue('anthropic/claude-sonnet-4-20250514');

      const result = provider.route('Ambiguous query', 100);

      expect(result.confidence).toBe(0.3);
      // Should still provide a routing decision even with low confidence
      expect(result.model).toBeDefined();
      expect(result.tier).toBeDefined();
    });
  });
});