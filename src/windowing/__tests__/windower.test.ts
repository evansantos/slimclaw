/**
 * Tests for conversation windowing functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { windowConversation, buildWindowedMessages, analyzeConversationStats } from '../windower.js';
import type { Message, WindowingConfig } from '../windower.js';

describe('windowConversation', () => {
  let sampleMessages: Message[];
  let config: WindowingConfig;

  beforeEach(() => {
    // Create sample conversation
    sampleMessages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello, can you help me?' },
      { role: 'assistant', content: 'Of course! I\'d be happy to help you.' },
      { role: 'user', content: 'I need help with JavaScript.' },
      { role: 'assistant', content: 'Great! JavaScript is a versatile programming language.' },
      { role: 'user', content: 'How do I create a function?' },
      { role: 'assistant', content: 'You can create a function using the function keyword or arrow syntax.' },
      { role: 'user', content: 'Can you show me an example?' },
      { role: 'assistant', content: 'Sure! Here\'s a simple function: function greet(name) { return "Hello " + name; }' },
      { role: 'user', content: 'What about arrow functions?' },
      { role: 'assistant', content: 'Arrow functions use this syntax: const greet = (name) => "Hello " + name;' },
      { role: 'user', content: 'Thanks! That\'s very helpful.' },
      { role: 'assistant', content: 'You\'re welcome! Is there anything else you\'d like to know?' },
    ];

    config = {
      maxMessages: 6,
      summarizeThreshold: 8,
    };
  });

  it('should return unchanged conversation when below threshold', () => {
    const shortMessages = sampleMessages.slice(0, 6); // 6 messages (including system)
    const result = windowConversation(shortMessages, config);

    expect(result.contextSummary).toBeNull();
    expect(result.recentMessages).toHaveLength(5); // 5 non-system messages
    expect(result.meta.originalMessageCount).toBe(6);
    expect(result.meta.windowedMessageCount).toBe(6);
    expect(result.meta.trimmedMessageCount).toBe(0);
    expect(result.meta.originalTokenEstimate).toBeGreaterThan(0);
    expect(result.meta.windowedTokenEstimate).toBe(result.meta.originalTokenEstimate);
    expect(result.meta.summaryTokenEstimate).toBe(0);
    expect(result.meta.summarizationMethod).toBe("none");
  });

  it('should apply windowing when above threshold', () => {
    const result = windowConversation(sampleMessages, config);

    expect(result.contextSummary).toBeTruthy();
    expect(result.recentMessages.length).toBeLessThan(sampleMessages.length - 1); // Less than original (minus system)
    expect(result.meta.originalMessageCount).toBe(sampleMessages.length);
    expect(result.meta.windowedMessageCount).toBeLessThan(sampleMessages.length);
    expect(result.meta.trimmedMessageCount).toBeGreaterThan(0);
    expect(result.meta.originalTokenEstimate).toBeGreaterThan(result.meta.windowedTokenEstimate);
    expect(result.meta.summaryTokenEstimate).toBeGreaterThan(0);
    expect(result.meta.summarizationMethod).toBe("heuristic");
  });

  it('should extract system prompt correctly', () => {
    const result = windowConversation(sampleMessages, config);
    expect(result.systemPrompt).toBe('You are a helpful assistant.');
  });

  it('should handle messages without system prompt', () => {
    const messagesNoSystem = sampleMessages.slice(1); // Remove system message
    const result = windowConversation(messagesNoSystem, config);

    expect(result.systemPrompt).toBe('');
    expect(result.recentMessages.length).toBeGreaterThan(0);
  });

  it('should respect maxMessages configuration', () => {
    const customConfig = { ...config, maxMessages: 4 };
    const result = windowConversation(sampleMessages, customConfig);

    expect(result.recentMessages).toHaveLength(4);
  });

  it('should respect maxTokens configuration', () => {
    const customConfig = { 
      ...config, 
      maxMessages: 10,
      maxTokens: 200, // Very low token limit
    };
    const result = windowConversation(sampleMessages, customConfig);

    // Should force aggressive windowing due to token limit
    expect(result.recentMessages.length).toBeLessThan(6);
    expect(result.contextSummary).toBeTruthy();
  });

  it('should handle empty message array', () => {
    const result = windowConversation([], config);

    expect(result.systemPrompt).toBe('');
    expect(result.contextSummary).toBeNull();
    expect(result.recentMessages).toHaveLength(0);
    expect(result.meta.originalMessageCount).toBe(0);
    expect(result.meta.windowedMessageCount).toBe(0);
    expect(result.meta.trimmedMessageCount).toBe(0);
    expect(result.meta.originalTokenEstimate).toBe(0);
    expect(result.meta.windowedTokenEstimate).toBe(0);
    expect(result.meta.summaryTokenEstimate).toBe(0);
    expect(result.meta.summarizationMethod).toBe("none");
  });

  it('should handle ContentBlock[] format in messages', () => {
    const messagesWithBlocks: Message[] = [
      { role: 'system', content: [{ type: 'text', text: 'You are helpful.' }] },
      { role: 'user', content: [{ type: 'text', text: 'Hello there!' }] },
    ];

    const result = windowConversation(messagesWithBlocks, config);
    expect(result.systemPrompt).toBe('You are helpful.');
    expect(result.recentMessages).toHaveLength(1);
  });
});

describe('buildWindowedMessages', () => {
  it('should reconstruct messages with context summary', () => {
    const windowed = {
      systemPrompt: 'You are a helpful assistant.',
      contextSummary: 'Previous context: User asked about JavaScript; I explained functions.',
      recentMessages: [
        { role: 'user', content: 'What about arrow functions?' },
        { role: 'assistant', content: 'Arrow functions use this syntax: const greet = (name) => "Hello " + name;' },
      ] as Message[],
      meta: {
        originalMessageCount: 10,
        windowedMessageCount: 3,
        trimmedMessageCount: 7,
        originalTokenEstimate: 1000,
        windowedTokenEstimate: 300,
        summaryTokenEstimate: 100,
        summarizationMethod: "heuristic",
      },
    };

    const result = buildWindowedMessages(windowed);

    expect(result).toHaveLength(3); // system + 2 recent messages
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('You are a helpful assistant.');
    expect(result[0].content).toContain('<context_summary>');
    expect(result[0].content).toContain('Previous context: User asked about JavaScript');
    expect(result[1].role).toBe('user');
    expect(result[2].role).toBe('assistant');
  });

  it('should handle windowed conversation without context summary', () => {
    const windowed = {
      systemPrompt: 'You are a helpful assistant.',
      contextSummary: null,
      recentMessages: [
        { role: 'user', content: 'Hello!' },
        { role: 'assistant', content: 'Hi there!' },
      ] as Message[],
      meta: {
        originalMessageCount: 3,
        windowedMessageCount: 3,
        trimmedMessageCount: 0,
        originalTokenEstimate: 200,
        windowedTokenEstimate: 200,
        summaryTokenEstimate: 0,
        summarizationMethod: "none",
      },
    };

    const result = buildWindowedMessages(windowed);

    expect(result).toHaveLength(3);
    expect(result[0].content).not.toContain('<context_summary>');
    expect(result[0].content).toBe('You are a helpful assistant.');
  });

  it('should handle empty system prompt', () => {
    const windowed = {
      systemPrompt: '',
      contextSummary: 'Some context here.',
      recentMessages: [
        { role: 'user', content: 'Hello!' },
      ] as Message[],
      meta: {
        originalMessageCount: 2,
        windowedMessageCount: 2,
        trimmedMessageCount: 0,
        originalTokenEstimate: 150,
        windowedTokenEstimate: 150,
        summaryTokenEstimate: 50,
        summarizationMethod: "heuristic",
      },
    };

    const result = buildWindowedMessages(windowed);

    expect(result).toHaveLength(2); // system (with just context) + user message
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('<context_summary>');
  });

  it('should skip system message when both prompt and summary are empty', () => {
    const windowed = {
      systemPrompt: '',
      contextSummary: null,
      recentMessages: [
        { role: 'user', content: 'Hello!' },
      ] as Message[],
      meta: {
        originalMessageCount: 1,
        windowedMessageCount: 1,
        trimmedMessageCount: 0,
        originalTokenEstimate: 50,
        windowedTokenEstimate: 50,
        summaryTokenEstimate: 0,
        summarizationMethod: "none",
      },
    };

    const result = buildWindowedMessages(windowed);

    expect(result).toHaveLength(1); // Only user message
    expect(result[0].role).toBe('user');
  });
});

describe('analyzeConversationStats', () => {
  it('should calculate correct stats for sample conversation', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hi there! How can I help?' },
      { role: 'user', content: 'I need JavaScript help.' },
    ];

    const stats = analyzeConversationStats(messages);

    expect(stats.totalMessages).toBe(4);
    expect(stats.nonSystemMessages).toBe(3);
    expect(stats.hasSystemPrompt).toBe(true);
    expect(stats.totalTokens).toBeGreaterThan(0);
    expect(stats.averageMessageLength).toBeGreaterThan(0);
  });

  it('should handle empty message array', () => {
    const stats = analyzeConversationStats([]);

    expect(stats.totalMessages).toBe(0);
    expect(stats.nonSystemMessages).toBe(0);
    expect(stats.hasSystemPrompt).toBe(false);
    expect(stats.totalTokens).toBe(0);
    expect(stats.averageMessageLength).toBe(0);
  });

  it('should detect absence of system prompt', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    const stats = analyzeConversationStats(messages);

    expect(stats.hasSystemPrompt).toBe(false);
    expect(stats.nonSystemMessages).toBe(2);
    expect(stats.totalMessages).toBe(2);
  });
});

describe('integration tests', () => {
  it('should handle full windowing pipeline', () => {
    // Create a long conversation that needs windowing
    const longConversation: Message[] = [
      { role: 'system', content: 'You are a coding assistant.' },
      { role: 'user', content: 'I want to learn Python programming.' },
      { role: 'assistant', content: 'Python is a great language to start with!' },
      { role: 'user', content: 'How do I install Python?' },
      { role: 'assistant', content: 'You can download Python from python.org.' },
      { role: 'user', content: 'What about package management?' },
      { role: 'assistant', content: 'Python uses pip for package management.' },
      { role: 'user', content: 'Can you explain virtual environments?' },
      { role: 'assistant', content: 'Virtual environments help isolate project dependencies.' },
      { role: 'user', content: 'How do I create one?' },
      { role: 'assistant', content: 'Use python -m venv myenv to create a virtual environment.' },
      { role: 'user', content: 'Now I want to learn about functions.' },
      { role: 'assistant', content: 'Functions in Python are defined using the def keyword.' },
    ];

    const config: WindowingConfig = {
      maxMessages: 6,
      summarizeThreshold: 8,
    };

    // Apply windowing
    const windowed = windowConversation(longConversation, config);

    expect(windowed.contextSummary).toBeTruthy();
    expect(windowed.recentMessages).toHaveLength(6);
    expect(windowed.meta.originalTokenEstimate).toBeGreaterThan(windowed.meta.windowedTokenEstimate);

    // Rebuild messages
    const rebuiltMessages = buildWindowedMessages(windowed);

    expect(rebuiltMessages.length).toBeGreaterThan(0);
    expect(rebuiltMessages[0].role).toBe('system');
    expect(rebuiltMessages[0].content).toContain('<context_summary>');

    // Verify the conversation flow is preserved
    const userMessages = rebuiltMessages.filter(m => m.role === 'user');
    const assistantMessages = rebuiltMessages.filter(m => m.role === 'assistant');
    
    expect(userMessages.length).toBeGreaterThan(0);
    expect(assistantMessages.length).toBeGreaterThan(0);
  });

  it('should preserve conversation quality after windowing', () => {
    const conversation: Message[] = [
      { role: 'system', content: 'You are a helpful assistant specialized in web development.' },
      { role: 'user', content: 'I\'m building a React application.' },
      { role: 'assistant', content: 'Great! React is excellent for building user interfaces.' },
      { role: 'user', content: 'I need to manage state across components.' },
      { role: 'assistant', content: 'For state management, you can use React Context, Redux, or Zustand.' },
      { role: 'user', content: 'Which one would you recommend for a small app?' },
      { role: 'assistant', content: 'For small apps, React Context or Zustand would be perfect.' },
      { role: 'user', content: 'Can you show me a Context example?' },
      { role: 'assistant', content: 'Sure! Here\'s a basic Context setup: const MyContext = createContext();' },
      { role: 'user', content: 'Now I need to handle form validation.' },
    ];

    const windowed = windowConversation(conversation, {
      maxMessages: 4,
      summarizeThreshold: 6,
    });

    const rebuilt = buildWindowedMessages(windowed);

    // Should maintain the core context about React development
    const systemMessage = rebuilt[0];
    expect(systemMessage.content).toContain('web development');
    expect(systemMessage.content).toContain('context');

    // Recent conversation should be about form validation
    const lastUserMessage = rebuilt[rebuilt.length - 1];
    expect(lastUserMessage.content).toContain('form validation');
  });
});