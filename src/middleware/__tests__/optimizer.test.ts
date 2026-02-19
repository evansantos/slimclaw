import { describe, it, test, expect, beforeEach, vi } from 'vitest';
/**
 * Tests for SlimClaw Optimizer Middleware
 * Testa a integração de windowing + cache injection
 */

import {
  inferenceOptimizer,
  generateDebugHeaders,
  shouldOptimize,
  createOptimizationContext,
  type OptimizedResult,
  type OptimizationContext,
  type Message,
} from '../optimizer.js';
import { createMetrics, MetricsCollector } from '../metrics.js';
import type { SlimClawConfig } from '../../config.js';

// ============================================================
// Mock Data
// ============================================================

const mockConfig: SlimClawConfig = {
  enabled: true,
  mode: 'active',
  windowing: {
    enabled: true,
    maxMessages: 5,
    maxTokens: 2000,
    summarizeThreshold: 4,
  },
  routing: {
    enabled: false,
    allowDowngrade: true,
    minConfidence: 0.4,
    tiers: {},
  },
  caching: {
    enabled: true,
    injectBreakpoints: true,
    minContentLength: 500,
  },
  metrics: {
    enabled: true,
    logPath: 'test-metrics',
    flushIntervalMs: 5000,
  },
};

const mockMessages: Message[] = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello!' },
  { role: 'assistant', content: 'Hi there! How can I help you?' },
  { role: 'user', content: 'What is 2+2?' },
  { role: 'assistant', content: '2+2 equals 4.' },
  { role: 'user', content: 'What about 3+3?' },
  { role: 'assistant', content: '3+3 equals 6.' },
  { role: 'user', content: 'Tell me about machine learning.' },
];

const mockLongMessages: Message[] = [
  { role: 'system', content: 'You are a helpful assistant that provides detailed explanations.' },
  { role: 'user', content: 'Explain quantum computing in detail.'.repeat(50) }, // Long content for cache
  { role: 'assistant', content: 'Quantum computing is a fascinating field...'.repeat(30) },
  { role: 'user', content: 'What about artificial intelligence?' },
  { role: 'assistant', content: 'AI is another complex topic...'.repeat(25) },
];

// ============================================================
// Unit Tests
// ============================================================

describe('SlimClaw Optimizer', () => {
  let mockContext: OptimizationContext;

  beforeEach(() => {
    mockContext = createOptimizationContext(
      'test-req-123',
      'test-agent',
      'test-session'
    );
  });

  describe('inferenceOptimizer', () => {
    test('should return original messages when disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      
      const result = await inferenceOptimizer(mockMessages, disabledConfig, mockContext);
      
      expect(result.messages).toEqual(mockMessages);
      expect(result.metrics.savings).toBe(0);
      expect(result.metrics.windowingApplied).toBe(false);
      expect(result.metrics.cacheInjected).toBe(false);
    });

    test('should return original messages when bypassed', async () => {
      const bypassContext = { ...mockContext, bypassOptimization: true };
      
      const result = await inferenceOptimizer(mockMessages, mockConfig, bypassContext);
      
      expect(result.messages).toEqual(mockMessages);
      expect(result.metrics.savings).toBe(0);
      expect(result.metrics.windowingApplied).toBe(false);
      expect(result.metrics.cacheInjected).toBe(false);
    });

    test('should apply windowing when message count exceeds threshold', async () => {
      const result = await inferenceOptimizer(mockMessages, mockConfig, mockContext);
      
      expect(result.metrics.windowingApplied).toBe(true);
      expect(result.messages.length).toBeLessThan(mockMessages.length);
      expect(result.metrics.originalTokens).toBeGreaterThan(result.metrics.optimizedTokens);
      expect(result.metrics.savings).toBeGreaterThan(0);
      expect(result.metrics.trimmedMessages).toBeGreaterThan(0);
    });

    test('should inject cache breakpoints on long messages', async () => {
      const result = await inferenceOptimizer(mockLongMessages, mockConfig, mockContext);
      
      expect(result.metrics.cacheInjected).toBe(true);
      expect(result.metrics.cacheBreakpointsInjected).toBeGreaterThan(0);
      
      // Check that cache_control was added to appropriate messages
      const messagesWithCache = result.messages.filter(msg => msg.cache_control);
      expect(messagesWithCache.length).toBeGreaterThan(0);
    });

    test('should apply both windowing and caching optimizations', async () => {
      const result = await inferenceOptimizer(mockLongMessages, mockConfig, mockContext);
      
      expect(result.metrics.windowingApplied).toBe(true);
      expect(result.metrics.cacheInjected).toBe(true);
      expect(result.metrics.savings).toBeGreaterThan(0);
      expect(result.messages.length).toBeLessThan(mockLongMessages.length);
    });

    test('should handle empty message array gracefully', async () => {
      const result = await inferenceOptimizer([], mockConfig, mockContext);
      
      expect(result.messages).toEqual([]);
      expect(result.metrics.originalTokens).toBe(0);
      expect(result.metrics.optimizedTokens).toBe(0);
      expect(result.metrics.savings).toBe(0);
    });

    test('should preserve system prompt in windowed messages', async () => {
      const result = await inferenceOptimizer(mockMessages, mockConfig, mockContext);
      
      // System message should still exist (possibly with context summary)
      const systemMessage = result.messages.find(msg => msg.role === 'system');
      expect(systemMessage).toBeDefined();
      expect(systemMessage?.content).toContain('helpful assistant');
    });
  });

  describe('generateDebugHeaders', () => {
    test('should generate appropriate debug headers', async () => {
      const result = await inferenceOptimizer(mockMessages, mockConfig, mockContext);
      const headers = generateDebugHeaders(result, mockConfig);
      
      expect(headers['X-SlimClaw-Enabled']).toBe('true');
      expect(headers['X-SlimClaw-Mode']).toBe('active');
      expect(headers['X-SlimClaw-Original-Tokens']).toBe(result.metrics.originalTokens.toString());
      expect(headers['X-SlimClaw-Optimized-Tokens']).toBe(result.metrics.optimizedTokens.toString());
      expect(headers['X-SlimClaw-Windowing']).toBe('applied');
      
      if (result.metrics.trimmedMessages !== undefined) {
        expect(headers['X-SlimClaw-Trimmed-Messages']).toBe(result.metrics.trimmedMessages.toString());
      }
    });

    test('should show disabled state in headers', () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const mockResult: OptimizedResult = {
        messages: mockMessages,
        metrics: {
          originalTokens: 1000,
          optimizedTokens: 1000,
          savings: 0,
          windowingApplied: false,
          cacheInjected: false,
        }
      };
      
      const headers = generateDebugHeaders(mockResult, disabledConfig);
      
      expect(headers['X-SlimClaw-Enabled']).toBe('false');
      expect(headers['X-SlimClaw-Windowing']).toBe('skipped');
      expect(headers['X-SlimClaw-Caching']).toBe('skipped');
    });
  });

  describe('shouldOptimize', () => {
    test('should return false when bypass header is set', () => {
      const headers = { 'X-SlimClaw-Bypass': 'true' };
      const result = shouldOptimize(mockContext, headers);
      
      expect(result).toBe(false);
    });

    test('should return false when context has bypassOptimization flag', () => {
      const bypassContext = { ...mockContext, bypassOptimization: true };
      const result = shouldOptimize(bypassContext);
      
      expect(result).toBe(false);
    });

    test('should return true for normal optimization', () => {
      const result = shouldOptimize(mockContext);
      
      expect(result).toBe(true);
    });
  });

  describe('createOptimizationContext', () => {
    test('should create context with proper defaults', () => {
      const context = createOptimizationContext('req-123', 'agent-1', 'session-1');
      
      expect(context.requestId).toBe('req-123');
      expect(context.agentId).toBe('agent-1');
      expect(context.sessionKey).toBe('session-1');
      expect(context.bypassOptimization).toBe(false);
      expect(context.debugHeaders).toBe(false);
    });

    test('should handle optional parameters', () => {
      const context = createOptimizationContext('req-123', undefined, undefined, {
        bypassOptimization: true,
        debugHeaders: true,
      });
      
      expect(context.agentId).toBe('unknown');
      expect(context.sessionKey).toBe('unknown');
      expect(context.bypassOptimization).toBe(true);
      expect(context.debugHeaders).toBe(true);
    });
  });
});

// ============================================================
// Metrics Tests
// ============================================================

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector(5); // Small buffer for testing
  });

  test('should record and retrieve metrics', () => {
    const metrics = createMetrics(
      'req-1', 'agent-1', 'session-1', 1000, 10, 800, 8, true, true, 50
    );
    
    collector.record(metrics);
    
    const all = collector.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(metrics);
  });

  test('should maintain ring buffer size', () => {
    // Add more metrics than buffer size
    for (let i = 0; i < 10; i++) {
      const metrics = createMetrics(
        `req-${i}`, 'agent-1', 'session-1', 1000, 10, 800, 8, true, false, 50
      );
      collector.record(metrics);
    }
    
    const all = collector.getAll();
    expect(all).toHaveLength(5); // Should maintain max size
  });

  test('should calculate aggregate stats correctly', () => {
    const metrics1 = createMetrics('req-1', 'agent-1', 'session-1', 1000, 10, 800, 8, true, false, 50);
    const metrics2 = createMetrics('req-2', 'agent-1', 'session-1', 2000, 20, 1600, 16, false, true, 75);
    
    collector.record(metrics1);
    collector.record(metrics2);
    
    const stats = collector.getStats();
    
    expect(stats.totalRequests).toBe(2);
    expect(stats.averageOriginalTokens).toBe(1500); // (1000 + 2000) / 2
    expect(stats.averageOptimizedTokens).toBe(1200); // (800 + 1600) / 2
    expect(stats.windowingUsagePercent).toBe(50); // 1 out of 2
    expect(stats.cacheUsagePercent).toBe(50); // 1 out of 2
  });

  test('should handle empty buffer in stats', () => {
    const stats = collector.getStats();
    
    expect(stats.totalRequests).toBe(0);
    expect(stats.averageOriginalTokens).toBe(0);
    expect(stats.averageOptimizedTokens).toBe(0);
    expect(stats.averageSavings).toBe(0);
  });

  test('should clear buffer', () => {
    const metrics = createMetrics('req-1', 'agent-1', 'session-1', 1000, 10, 800, 8, true, false, 50);
    collector.record(metrics);
    
    expect(collector.getAll()).toHaveLength(1);
    
    collector.clear();
    
    expect(collector.getAll()).toHaveLength(0);
  });
});

// ============================================================
// Integration Tests
// ============================================================

describe('SlimClaw Integration', () => {
  test('should optimize conversation end-to-end', async () => {
    const context = createOptimizationContext('integration-test', 'test-agent', 'test-session');
    
    const result = await inferenceOptimizer(mockMessages, mockConfig, context);
    
    // Verify optimization was applied
    expect(result.metrics.originalTokens).toBeGreaterThan(result.metrics.optimizedTokens);
    expect(result.metrics.savings).toBeGreaterThan(0);
    
    // Verify message structure is preserved
    expect(result.messages).toHaveLength.lessThan(mockMessages.length);
    
    // Verify system message exists and has context summary
    const systemMsg = result.messages.find(m => m.role === 'system');
    expect(systemMsg).toBeDefined();
    
    // Generate debug headers and verify
    const headers = generateDebugHeaders(result, mockConfig);
    expect(headers['X-SlimClaw-Enabled']).toBe('true');
    expect(parseInt(headers['X-SlimClaw-Tokens-Saved'])).toBeGreaterThan(0);
  });

  test('should handle error gracefully', async () => {
    // Mock a config that might cause errors
    const badConfig = {
      ...mockConfig,
      windowing: { ...mockConfig.windowing, maxMessages: -1 }, // Invalid config
    };
    
    const result = await inferenceOptimizer(mockMessages, badConfig, mockContext);
    
    // Should fallback to original messages
    expect(result.messages).toEqual(mockMessages);
    expect(result.metrics.savings).toBe(0);
  });
});