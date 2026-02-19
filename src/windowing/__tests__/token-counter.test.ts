/**
 * Tests for token estimation functionality
 */

import { describe, it, expect } from 'vitest';
import { 
  estimateTokens, 
  estimateMessageTokens, 
  estimateContentTokens, 
  calculateTokenSavings 
} from '../token-counter.js';
import type { Message } from '../token-counter.js';

describe('estimateTokens', () => {
  it('should estimate tokens for simple string content', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello world!' }, // ~3-4 tokens
    ];

    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10); // Should be reasonable estimate
  });

  it('should estimate tokens for multiple messages', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is JavaScript?' },
      { role: 'assistant', content: 'JavaScript is a programming language used for web development.' },
    ];

    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(15); // Should account for all content
    expect(tokens).toBeLessThan(50); // But not excessive
  });

  it('should handle ContentBlock[] format', () => {
    const messages: Message[] = [
      { 
        role: 'user', 
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'World' },
        ]
      },
    ];

    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  it('should account for tool calls in token count', () => {
    const messagesWithoutTools: Message[] = [
      { role: 'user', content: 'Hello' },
    ];

    const messagesWithTools: Message[] = [
      { 
        role: 'user', 
        content: 'Hello',
        tool_calls: [{ function: { name: 'test_function', arguments: '{}' } }]
      },
    ];

    const tokensWithoutTools = estimateTokens(messagesWithoutTools);
    const tokensWithTools = estimateTokens(messagesWithTools);

    expect(tokensWithTools).toBeGreaterThan(tokensWithoutTools);
  });

  it('should handle empty messages array', () => {
    const tokens = estimateTokens([]);
    expect(tokens).toBe(0);
  });

  it('should handle messages with empty content', () => {
    const messages: Message[] = [
      { role: 'user', content: '' },
    ];

    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(0); // Should account for role overhead
    expect(tokens).toBeLessThan(10);
  });
});

describe('estimateMessageTokens', () => {
  it('should estimate tokens for single message', () => {
    const message: Message = {
      role: 'assistant',
      content: 'This is a test message with some content to estimate.',
    };

    const tokens = estimateMessageTokens(message);
    expect(tokens).toBeGreaterThan(10);
    expect(tokens).toBeLessThan(30);
  });

  it('should be equivalent to estimateTokens with single message', () => {
    const message: Message = {
      role: 'user',
      content: 'Test message content.',
    };

    const singleEstimate = estimateMessageTokens(message);
    const arrayEstimate = estimateTokens([message]);

    expect(singleEstimate).toBe(arrayEstimate);
  });
});

describe('estimateContentTokens', () => {
  it('should estimate tokens for short text', () => {
    const tokens = estimateContentTokens('Hello world');
    expect(tokens).toBe(2); // Two words
  });

  it('should estimate tokens for longer text', () => {
    const content = 'This is a longer piece of text that should be estimated more accurately with multiple words and punctuation.';
    const tokens = estimateContentTokens(content);
    
    expect(tokens).toBeGreaterThan(15); // Should account for words
    expect(tokens).toBeLessThan(35); // But not over-estimate
  });

  it('should handle empty string', () => {
    const tokens = estimateContentTokens('');
    expect(tokens).toBe(0);
  });

  it('should account for punctuation', () => {
    const withPunctuation = 'Hello, world! How are you?';
    const withoutPunctuation = 'Hello world How are you';
    
    const tokensWithPunct = estimateContentTokens(withPunctuation);
    const tokensWithoutPunct = estimateContentTokens(withoutPunctuation);
    
    expect(tokensWithPunct).toBeGreaterThan(tokensWithoutPunct);
  });

  it('should handle long words appropriately', () => {
    const shortWords = 'cat dog';
    const longWords = 'concatenation documentation';
    
    const shortTokens = estimateContentTokens(shortWords);
    const longTokens = estimateContentTokens(longWords);
    
    expect(longTokens).toBeGreaterThan(shortTokens);
  });
});

describe('calculateTokenSavings', () => {
  it('should calculate savings correctly', () => {
    const originalMessages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant with extensive knowledge.' },
      { role: 'user', content: 'I have a very long question about programming.' },
      { role: 'assistant', content: 'Let me provide you with a detailed answer.' },
      { role: 'user', content: 'Can you explain it in more detail?' },
      { role: 'assistant', content: 'Certainly! Here is a comprehensive explanation.' },
    ];

    const windowedMessages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant. Previous: discussed programming.' },
      { role: 'user', content: 'Can you explain it in more detail?' },
      { role: 'assistant', content: 'Certainly! Here is a comprehensive explanation.' },
    ];

    const savings = calculateTokenSavings(originalMessages, windowedMessages);

    expect(savings.originalTokens).toBeGreaterThan(savings.windowedTokens);
    expect(savings.tokensSaved).toBeGreaterThan(0);
    expect(savings.percentageSaved).toBeGreaterThan(0);
    expect(savings.percentageSaved).toBeLessThanOrEqual(100);
  });

  it('should handle no savings scenario', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Short message' },
    ];

    const savings = calculateTokenSavings(messages, messages);

    expect(savings.originalTokens).toBe(savings.windowedTokens);
    expect(savings.tokensSaved).toBe(0);
    expect(savings.percentageSaved).toBe(0);
  });

  it('should handle empty arrays', () => {
    const savings = calculateTokenSavings([], []);

    expect(savings.originalTokens).toBe(0);
    expect(savings.windowedTokens).toBe(0);
    expect(savings.tokensSaved).toBe(0);
    expect(savings.percentageSaved).toBe(0);
  });

  it('should calculate percentage correctly', () => {
    const originalMessages: Message[] = [
      { role: 'user', content: 'A'.repeat(400) }, // ~100 tokens
    ];

    const windowedMessages: Message[] = [
      { role: 'user', content: 'A'.repeat(200) }, // ~50 tokens
    ];

    const savings = calculateTokenSavings(originalMessages, windowedMessages);

    // Should be approximately 50% savings
    expect(savings.percentageSaved).toBeGreaterThan(40);
    expect(savings.percentageSaved).toBeLessThan(60);
  });
});

describe('token estimation accuracy', () => {
  it('should provide reasonable estimates for typical conversation', () => {
    const conversationMessages: Message[] = [
      { role: 'system', content: 'You are Claude, an AI assistant created by Anthropic. You are helpful, harmless, and honest.' },
      { role: 'user', content: 'Can you help me understand how machine learning works?' },
      { role: 'assistant', content: 'I\'d be happy to explain machine learning! At its core, machine learning is a method of teaching computers to recognize patterns in data and make predictions or decisions based on those patterns. Instead of programming explicit rules, we feed the computer lots of examples and let it figure out the patterns on its own.' },
      { role: 'user', content: 'What are the main types of machine learning?' },
      { role: 'assistant', content: 'There are three main types of machine learning:\n\n1. **Supervised Learning**: The algorithm learns from labeled examples\n2. **Unsupervised Learning**: The algorithm finds hidden patterns in data without labels\n3. **Reinforcement Learning**: The algorithm learns through trial and error with rewards and penalties' },
    ];

    const totalTokens = estimateTokens(conversationMessages);

    // This conversation should be around 150-300 tokens based on typical tokenization
    expect(totalTokens).toBeGreaterThan(100);
    expect(totalTokens).toBeLessThan(500);
  });

  it('should scale reasonably with content length', () => {
    const shortContent = 'Hi';
    const mediumContent = 'This is a medium length message with several words.';
    const longContent = 'This is a much longer message that contains significantly more content and should result in a higher token count because it has many more words, punctuation marks, and overall character count than the shorter messages.';

    const shortTokens = estimateContentTokens(shortContent);
    const mediumTokens = estimateContentTokens(mediumContent);
    const longTokens = estimateContentTokens(longContent);

    expect(shortTokens).toBeLessThan(mediumTokens);
    expect(mediumTokens).toBeLessThan(longTokens);

    // Check rough scaling
    expect(longTokens).toBeGreaterThan(shortTokens * 5);
  });
});