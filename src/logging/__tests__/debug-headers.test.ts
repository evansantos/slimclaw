/**
 * Tests for debug headers integration with logging
 */

import { describe, it, expect } from 'vitest';
import { generateDebugHeaders, createOptimizationContext } from '../../middleware/optimizer.js';
import type { OptimizedResult } from '../../middleware/optimizer.js';
import type { OptimizerMetrics } from '../../metrics/types.js';
import { DEFAULT_CONFIG } from '../../config.js';

describe('Debug Headers with Logging', () => {
  const createMockResult = (requestId: string, overrides: Partial<OptimizerMetrics> = {}): OptimizedResult => {
    const metrics: OptimizerMetrics = {
      requestId,
      timestamp: new Date().toISOString(),
      agentId: 'test-agent',
      sessionKey: 'test-session',
      mode: 'active',
      
      originalModel: 'test-model',
      originalMessageCount: 3,
      originalTokenEstimate: 1000,
      
      windowingApplied: true,
      windowedMessageCount: 2,
      windowedTokenEstimate: 800,
      trimmedMessages: 1,
      summaryTokens: 50,
      summarizationMethod: 'heuristic',
      
      classificationTier: 'mid',
      classificationConfidence: 0.8,
      classificationScores: { simple: 0.1, mid: 0.8, complex: 0.1, reasoning: 0.0 },
      classificationSignals: ['length', 'complexity'],
      
      routingApplied: false,
      targetModel: 'test-model',
      modelDowngraded: false,
      modelUpgraded: false,
      
      cacheBreakpointsInjected: 2,
      
      actualInputTokens: null,
      actualOutputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      latencyMs: 150,
      
      tokensSaved: 200,
      estimatedCostOriginal: null,
      estimatedCostOptimized: null,
      estimatedCostSaved: null,
      
      ...overrides,
    };

    return {
      messages: [],
      metrics,
    };
  };

  it('should include request ID in debug headers', () => {
    const requestId = 'test-request-123';
    const result = createMockResult(requestId);
    
    const headers = generateDebugHeaders(result, DEFAULT_CONFIG);
    
    expect(headers['X-SlimClaw-Request-Id']).toBe(requestId);
  });

  it('should include basic optimization info', () => {
    const result = createMockResult('basic-test');
    
    const headers = generateDebugHeaders(result, DEFAULT_CONFIG);
    
    expect(headers['X-SlimClaw-Enabled']).toBe('true');
    expect(headers['X-SlimClaw-Mode']).toBe('active');
    expect(headers['X-SlimClaw-Original-Tokens']).toBe('1000');
    expect(headers['X-SlimClaw-Optimized-Tokens']).toBe('800');
    expect(headers['X-SlimClaw-Tokens-Saved']).toBe('200');
    expect(headers['X-SlimClaw-Savings-Percent']).toBe('20.0');
  });

  it('should include feature usage info', () => {
    const result = createMockResult('feature-test');
    
    const headers = generateDebugHeaders(result, DEFAULT_CONFIG);
    
    expect(headers['X-SlimClaw-Windowing']).toBe('applied');
    expect(headers['X-SlimClaw-Caching']).toBe('applied');
    expect(headers['X-SlimClaw-Classification']).toBe('mid');
    expect(headers['X-SlimClaw-Routing']).toBe('skipped');
  });

  it('should include detailed debug info when available', () => {
    const result = createMockResult('detailed-test');
    
    const headers = generateDebugHeaders(result, DEFAULT_CONFIG);
    
    expect(headers['X-SlimClaw-Trimmed-Messages']).toBe('1');
    expect(headers['X-SlimClaw-Cache-Breakpoints']).toBe('2');
    expect(headers['X-SlimClaw-Latency-Ms']).toBe('150');
    expect(headers['X-SlimClaw-Agent-Id']).toBe('test-agent');
    expect(headers['X-SlimClaw-Session-Key']).toBe('test-session');
  });

  it('should handle disabled optimization', () => {
    const disabledConfig = { ...DEFAULT_CONFIG, enabled: false };
    const result = createMockResult('disabled-test');
    
    const headers = generateDebugHeaders(result, disabledConfig);
    
    expect(headers['X-SlimClaw-Enabled']).toBe('false');
    expect(headers['X-SlimClaw-Request-Id']).toBe('disabled-test');
    
    // Should still include basic info
    expect(headers['X-SlimClaw-Mode']).toBeDefined();
  });

  it('should handle zero savings gracefully', () => {
    const result = createMockResult('no-savings', {
      originalTokenEstimate: 500,
      windowedTokenEstimate: 500,
      tokensSaved: 0,
      windowingApplied: false,
    });
    
    const headers = generateDebugHeaders(result, DEFAULT_CONFIG);
    
    expect(headers['X-SlimClaw-Tokens-Saved']).toBe('0');
    expect(headers['X-SlimClaw-Savings-Percent']).toBe('0.0');
    expect(headers['X-SlimClaw-Windowing']).toBe('skipped');
  });

  it('should omit optional fields when not applicable', () => {
    const result = createMockResult('minimal-test', {
      trimmedMessages: 0,
      cacheBreakpointsInjected: 0,
    });
    
    const headers = generateDebugHeaders(result, DEFAULT_CONFIG);
    
    expect('X-SlimClaw-Trimmed-Messages' in headers).toBe(false);
    expect('X-SlimClaw-Cache-Breakpoints' in headers).toBe(false);
    expect(headers['X-SlimClaw-Caching']).toBe('skipped');
  });

  it('should handle null latency', () => {
    const result = createMockResult('null-latency', {
      latencyMs: null,
    });
    
    const headers = generateDebugHeaders(result, DEFAULT_CONFIG);
    
    expect('X-SlimClaw-Latency-Ms' in headers).toBe(false);
  });

  it('should format correlation ID for HTTP headers', () => {
    // Test with various correlation ID formats
    const testIds = [
      'a1b2c3d4',
      'request-123',
      'correlation-id-456',
    ];

    testIds.forEach(requestId => {
      const result = createMockResult(requestId);
      const headers = generateDebugHeaders(result, DEFAULT_CONFIG);
      
      expect(headers['X-SlimClaw-Request-Id']).toBe(requestId);
      // Should be safe for HTTP headers (no spaces, special chars)
      expect(headers['X-SlimClaw-Request-Id']).toMatch(/^[a-zA-Z0-9-]+$/);
    });
  });
});