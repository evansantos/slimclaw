import { describe, it, expect } from 'vitest';
import { injectCacheBreakpoints, type CacheableMessage } from './breakpoints.js';

// Import the Message type from optimizer to ensure compatibility
import type { Message } from '../middleware/optimizer.js';

describe('Cache Breakpoints - Type Safety', () => {
  it('should accept Message[] without type assertion', () => {
    // This test validates that Message[] is assignable to the expected parameter type
    const messages: Message[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant',
      },
      {
        role: 'user',
        content: 'Hello!',
      },
      {
        role: 'assistant',
        content: 'Hi there! How can I help?',
      },
    ];

    // This should compile without any type assertion (no "as any")
    const result = injectCacheBreakpoints(messages, {
      enabled: true,
      minContentLength: 1000,
    });

    expect(result.messages).toHaveLength(3);
    expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(result.stats.breakpointsInjected).toBe(1); // Only system message
  });

  it('should preserve Message properties through cache injection', () => {
    const messages: Message[] = [
      {
        role: 'system',
        content: 'System prompt',
      },
      {
        role: 'user',
        content: 'x'.repeat(1500), // Long message
      },
      {
        role: 'assistant',
        content: 'Response',
        tool_calls: [{ id: '123', name: 'test' }],
      },
    ];

    const result = injectCacheBreakpoints(messages, {
      enabled: true,
      minContentLength: 1000,
    });

    // Verify tool_calls is preserved
    expect(result.messages[2].tool_calls).toEqual([{ id: '123', name: 'test' }]);

    // Verify system + long message got cache breakpoints
    expect(result.stats.breakpointsInjected).toBe(2);
  });

  it('should handle all Message role types', () => {
    const messages: Message[] = [
      { role: 'system', content: 'System' },
      { role: 'user', content: 'User' },
      { role: 'assistant', content: 'Assistant' },
      { role: 'tool', content: 'Tool result' },
    ];

    const result = injectCacheBreakpoints(messages, {
      enabled: true,
      minContentLength: 1000,
    });

    expect(result.messages).toHaveLength(4);
    expect(result.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
  });
});
