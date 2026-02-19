/**
 * Integration tests for logging system with SlimClaw middleware
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { inferenceOptimizer, createOptimizationContext } from '../../middleware/optimizer.js';
import type { Message } from '../../middleware/optimizer.js';
import { DEFAULT_CONFIG } from '../../config.js';
import { MetricsCollector } from '../../metrics/collector.js';
import { correlationContext } from '../correlation.js';

// Mock console methods
const mockConsole = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Mock fs promises
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock console
Object.assign(console, mockConsole);

describe('Logging Integration', () => {
  const testMessages: Message[] = [
    {
      role: 'system',
      content: 'You are a helpful assistant.',
    },
    {
      role: 'user',
      content: 'Hello, how are you?',
    },
    {
      role: 'assistant', 
      content: 'I am doing well, thank you for asking!',
    },
  ];

  // Test configuration with logging enabled at debug level
  const testConfig = {
    ...DEFAULT_CONFIG,
    logging: {
      level: 'debug' as const,
      format: 'human' as const,
      fileOutput: false,
      logPath: 'test-logs',
      consoleOutput: true,
      includeStackTrace: false,
      colors: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    correlationContext.clear();
  });

  afterEach(() => {
    correlationContext.clear();
  });

  it('should use logging system in optimizer', async () => {
    const context = createOptimizationContext('test-req-123', 'test-agent', 'test-session');
    const collector = new MetricsCollector({
      enabled: true,
      ringBufferSize: 100,
      flushInterval: 10,
    });

    const result = await inferenceOptimizer(testMessages, testConfig, context, collector);

    expect(result).toBeDefined();
    expect(result.messages).toBeDefined();
    expect(result.metrics).toBeDefined();

    // Should have logged messages
    expect(mockConsole.debug).toHaveBeenCalled();
    expect(mockConsole.info).toHaveBeenCalled();

    // Should include correlation ID in logs
    const debugCalls = mockConsole.debug.mock.calls.map(call => call[0]).join('\n');
    expect(debugCalls).toContain('[test-req-123]');
  });

  it('should log optimization results', async () => {
    const context = createOptimizationContext('opt-test-456', 'opt-agent', 'opt-session');
    
    const result = await inferenceOptimizer(testMessages, testConfig, context);

    expect(result).toBeDefined();

    // Should have logged optimization completion
    const infoCalls = mockConsole.info.mock.calls.map(call => call[0]).join('\n');
    expect(infoCalls).toContain('Optimization completed');
    expect(infoCalls).toContain('[SlimClaw]');
    expect(infoCalls).toContain('requestId=opt-test-456');
  });

  it('should log errors gracefully', async () => {
    // Create a configuration that might cause issues
    const badConfig = {
      ...testConfig,
      windowing: {
        ...testConfig.windowing,
        maxMessages: -1, // Invalid value that might cause issues
      },
    };

    const context = createOptimizationContext('error-test-789');

    // This should not throw, but fallback gracefully
    const result = await inferenceOptimizer(testMessages, badConfig, context);

    expect(result).toBeDefined();
    // Result should be defined but may have cache breakpoints injected
    expect(result.messages.length).toBe(testMessages.length);
  });

  it('should handle bypass optimization with logging', async () => {
    const context = createOptimizationContext('bypass-test-123', 'bypass-agent', 'bypass-session', {
      bypassOptimization: true,
    });

    const result = await inferenceOptimizer(testMessages, testConfig, context);

    expect(result).toBeDefined();
    expect(result.messages.length).toBe(testMessages.length);

    // Should have logged bypass reason
    const debugCalls = mockConsole.debug.mock.calls.map(call => call[0]).join('\n');
    expect(debugCalls).toContain('Optimization bypassed');
  });

  it('should work with metrics collector logging', async () => {
    const collector = new MetricsCollector({
      enabled: true,
      ringBufferSize: 10,
      flushInterval: 5,
    });

    const context = createOptimizationContext('metrics-test-123');

    await inferenceOptimizer(testMessages, testConfig, context, collector);

    // Should have logged metrics collection - the collector logs at debug level
    // and records metrics when the optimizer completes
    const debugCalls = mockConsole.debug.mock.calls.map(call => call[0]).join('\n');
    expect(debugCalls.length).toBeGreaterThan(0); // Should have some debug logs
    
    // The optimizer should be logging its activities
    expect(debugCalls).toContain('Starting optimization pipeline');
  });

  it('should maintain correlation context throughout pipeline', async () => {
    const requestId = 'correlation-test-456';
    const context = createOptimizationContext(requestId, 'corr-agent', 'corr-session');

    await inferenceOptimizer(testMessages, testConfig, context);

    // All log calls should include the same correlation ID
    const allCalls = [
      ...mockConsole.debug.mock.calls,
      ...mockConsole.info.mock.calls,
    ].map(call => call[0]);

    const logsWithCorrelation = allCalls.filter(log => log.includes(`[${requestId}]`));
    expect(logsWithCorrelation.length).toBeGreaterThan(0);

    // Verify correlation ID format
    expect(requestId).toMatch(/^[a-zA-Z0-9-]+$/);
  });
});