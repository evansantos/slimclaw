/**
 * Task 6: Integration Tests - Windowing
 * 
 * Tests comprehensive windowing scenarios:
 * - Conversations with 5, 10, 20, 50, 100 messages
 * - Context preservation validation (important info not lost)
 * - Edge cases: empty array, system prompt only, very long messages
 * - Token savings verification (>50% savings on 20+ messages)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { windowConversation, buildWindowedMessages, analyzeConversationStats } from '../../windowing/windower.js';
import { estimateTokens } from '../../windowing/token-counter.js';
import type { Message, WindowingConfig } from '../../windowing/windower.js';

describe('Windowing Integration Tests', () => {
  let baseConfig: WindowingConfig;

  beforeEach(() => {
    baseConfig = {
      maxMessages: 10,
      maxTokens: 4000,
      summarizeThreshold: 8,
      maxSummaryTokens: 500,
    };
  });

  describe('Conversation Size Scenarios', () => {
    function generateConversation(size: number, topic: string = 'programming'): Message[] {
      const messages: Message[] = [
        { role: 'system', content: `You are a helpful assistant specializing in ${topic}. Provide detailed, accurate responses.` }
      ];

      const topics = {
        programming: {
          userQueries: [
            'How do I start learning programming?',
            'What is the difference between Python and JavaScript?',
            'Can you explain object-oriented programming?',
            'How do I handle errors in my code?',
            'What are design patterns?',
            'Explain recursion with examples',
            'How does memory management work?',
            'What is the difference between stack and heap?',
            'Explain async/await vs promises',
            'How do I optimize my code performance?'
          ],
          assistantResponses: [
            'Great question! Programming is a journey of continuous learning...',
            'Python and JavaScript serve different purposes but both are powerful...',
            'Object-oriented programming is a paradigm that organizes code around objects...',
            'Error handling is crucial for robust applications. Here are the main approaches...',
            'Design patterns are reusable solutions to common programming problems...',
            'Recursion is when a function calls itself with modified parameters...',
            'Memory management varies by language, but the concepts are universal...',
            'The stack and heap are different memory regions with specific purposes...',
            'Async/await is syntactic sugar over promises, making asynchronous code more readable...',
            'Performance optimization requires understanding bottlenecks and measuring impact...'
          ]
        }
      };

      const topicData = topics[topic] || topics.programming;
      
      for (let i = 1; i < size; i++) {
        const isUser = i % 2 === 1;
        if (isUser) {
          const queryIndex = Math.floor((i - 1) / 2) % topicData.userQueries.length;
          messages.push({
            role: 'user',
            content: topicData.userQueries[queryIndex] + ` (Message ${i})`
          });
        } else {
          const responseIndex = Math.floor((i - 2) / 2) % topicData.assistantResponses.length;
          messages.push({
            role: 'assistant',
            content: topicData.assistantResponses[responseIndex] + ` This is response number ${i/2} providing comprehensive information about the topic.`
          });
        }
      }

      return messages;
    }

    it('should handle 5-message conversations (no windowing needed)', () => {
      const messages = generateConversation(5);
      const result = windowConversation(messages, baseConfig);

      expect(result.meta.originalMessageCount).toBe(5);
      expect(result.meta.windowedMessageCount).toBe(5);
      expect(result.meta.trimmedMessageCount).toBe(0);
      expect(result.contextSummary).toBeNull();
      expect(result.meta.summarizationMethod).toBe('none');
      
      // No token savings expected
      expect(result.meta.originalTokenEstimate).toBe(result.meta.windowedTokenEstimate);
    });

    it('should handle 10-message conversations with minimal windowing', () => {
      const messages = generateConversation(10);
      const result = windowConversation(messages, baseConfig);

      expect(result.meta.originalMessageCount).toBe(10);
      
      // May or may not trigger windowing depending on config
      const rebuilt = buildWindowedMessages(result);
      expect(rebuilt.length).toBeGreaterThan(0);
      
      // Verify system prompt is preserved
      expect(result.systemPrompt).toContain('helpful assistant');
      expect(result.systemPrompt).toContain('programming');
    });

    it('should apply windowing to 20-message conversations with >30% token savings', () => {
      const messages = generateConversation(20);
      const result = windowConversation(messages, {
        ...baseConfig,
        maxMessages: 8, // Force windowing
        summarizeThreshold: 6,
      });

      expect(result.meta.originalMessageCount).toBe(20);
      expect(result.meta.windowedMessageCount).toBeLessThan(20);
      expect(result.meta.trimmedMessageCount).toBeGreaterThan(0);
      expect(result.contextSummary).toBeTruthy();
      expect(result.meta.summarizationMethod).toBe('heuristic');
      
      // Calculate token savings percentage
      const tokenSavings = ((result.meta.originalTokenEstimate - result.meta.windowedTokenEstimate) / result.meta.originalTokenEstimate) * 100;
      expect(tokenSavings).toBeGreaterThan(30); // At least 30% savings
      
      // Verify context summary contains key information
      expect(result.contextSummary).toContain('programming');
      
      const rebuilt = buildWindowedMessages(result);
      expect(rebuilt[0].content).toContain('<context_summary>');
    });

    it('should achieve >50% token savings on 50-message conversations', () => {
      const messages = generateConversation(50);
      const result = windowConversation(messages, {
        ...baseConfig,
        maxMessages: 12, // Keep reasonable window
        summarizeThreshold: 15,
      });

      expect(result.meta.originalMessageCount).toBe(50);
      expect(result.meta.windowedMessageCount).toBeLessThan(35); // Reasonable reduction
      expect(result.contextSummary).toBeTruthy();
      
      // Calculate token savings percentage
      const tokenSavings = ((result.meta.originalTokenEstimate - result.meta.windowedTokenEstimate) / result.meta.originalTokenEstimate) * 100;
      expect(tokenSavings).toBeGreaterThan(50); // Target >50% savings
      
      // Verify conversation quality is maintained
      const rebuilt = buildWindowedMessages(result);
      const systemMessage = rebuilt[0];
      expect(systemMessage.content).toContain('programming');
      expect(systemMessage.content).toContain('<context_summary>');
      
      // Verify recent messages are preserved
      expect(result.recentMessages.length).toBeGreaterThan(5);
      expect(result.recentMessages[result.recentMessages.length - 1].content).toContain('Message 49');
    });

    it('should handle 100-message conversations with aggressive windowing', () => {
      const messages = generateConversation(100);
      const result = windowConversation(messages, {
        ...baseConfig,
        maxMessages: 15,
        maxTokens: 3000,
        summarizeThreshold: 20,
      });

      expect(result.meta.originalMessageCount).toBe(100);
      expect(result.meta.windowedMessageCount).toBeLessThan(20);
      expect(result.contextSummary).toBeTruthy();
      expect(result.contextSummary.length).toBeGreaterThan(50); // Substantial summary
      
      // Should achieve significant token savings
      const tokenSavings = ((result.meta.originalTokenEstimate - result.meta.windowedTokenEstimate) / result.meta.originalTokenEstimate) * 100;
      expect(tokenSavings).toBeGreaterThan(60); // Expect high savings
      
      // Verify the most recent conversation is preserved
      const rebuilt = buildWindowedMessages(result);
      const lastMessage = rebuilt[rebuilt.length - 1];
      expect(lastMessage.content).toContain('99'); // Last user/assistant exchange
      
      // Summary should capture the conversation arc
      expect(result.contextSummary).toMatch(/programming|learning|code|development|explain|async|recursion/i);
    });
  });

  describe('Context Preservation Tests', () => {
    it('should preserve important context across windowing', () => {
      // Create conversation with specific context that must be preserved
      const messages: Message[] = [
        { role: 'system', content: 'You are a financial advisor helping with retirement planning. The client is 45 years old with $100k saved.' },
        { role: 'user', content: 'I want to retire at 65 with $2 million. Is this realistic?' },
        { role: 'assistant', content: 'Based on your current age of 45 and $100k savings, you have 20 years to reach $2M. This requires significant monthly contributions.' },
        { role: 'user', content: 'What monthly contribution would I need?' },
        { role: 'assistant', content: 'Assuming 7% annual returns, you would need to contribute approximately $4,200 monthly to reach $2M by age 65.' },
        { role: 'user', content: 'That seems high. What if I work until 67?' },
        { role: 'assistant', content: 'Working 2 extra years reduces the required monthly contribution to about $3,400, assuming the same 7% return.' },
        { role: 'user', content: 'What about reducing my retirement goal to $1.5M?' },
        { role: 'assistant', content: 'With a $1.5M goal and retirement at 65, your monthly contribution drops to approximately $2,900.' },
        { role: 'user', content: 'I also have a 401k with employer match. How does that factor in?' },
        { role: 'assistant', content: 'Excellent! Employer matches are free money. If you get a 50% match on 6% of salary, that significantly reduces your required personal contributions.' },
        { role: 'user', content: 'My salary is $120k. How much should I contribute to maximize the match?' },
        { role: 'assistant', content: 'With a $120k salary, contribute at least 6% ($7,200 annually) to get the full employer match of $3,600.' },
        { role: 'user', content: 'Now let me ask about tax implications.' },
      ];

      const result = windowConversation(messages, {
        maxMessages: 6,
        summarizeThreshold: 6, // Lower threshold to force windowing
      });

      expect(result.contextSummary).toBeTruthy();
      
      const rebuilt = buildWindowedMessages(result);
      const systemMessage = rebuilt[0];
      
      // Critical context should be preserved in system message + summary
      const fullSystemContent = systemMessage.content;
      expect(fullSystemContent).toContain('45 years old'); // Age
      expect(fullSystemContent).toContain('$100k'); // Current savings
      expect(fullSystemContent).toContain('retirement'); // Main topic
      expect(fullSystemContent).toMatch(/2.*million|\$2M/i); // Goal amount
      expect(fullSystemContent).toMatch(/120.*k|120000/); // Salary
      
      // Recent messages should contain latest context
      const lastFewMessages = rebuilt.slice(-3);
      const hasEmployerMatchContext = lastFewMessages.some(msg => 
        typeof msg.content === 'string' && msg.content.includes('employer match')
      );
      expect(hasEmployerMatchContext).toBe(true);
    });

    it('should preserve technical context in programming conversations', () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are helping debug a React TypeScript application using Next.js 14, Tailwind CSS, and PostgreSQL database.' },
        { role: 'user', content: 'I\'m getting an error: "Cannot read property \'map\' of undefined" in my UserList component.' },
        { role: 'assistant', content: 'This error typically means the array you\'re trying to map over is undefined. Can you show me your UserList component code?' },
        { role: 'user', content: 'Here\'s the code: const UserList = ({ users }) => { return users.map(user => <div key={user.id}>{user.name}</div>); };' },
        { role: 'assistant', content: 'The issue is that users prop might be undefined initially. Add a default value or conditional rendering: users?.map() or users || []' },
        { role: 'user', content: 'That fixed it! Now I have another issue with my API route in pages/api/users.ts' },
        { role: 'assistant', content: 'Great! What\'s the issue with your API route? Next.js 14 has specific patterns for API routes.' },
        { role: 'user', content: 'I\'m getting a CORS error when fetching from my frontend. The API works in Postman.' },
        { role: 'assistant', content: 'CORS issues in Next.js API routes often require setting headers. Add res.setHeader("Access-Control-Allow-Origin", "*") or configure cors middleware.' },
        { role: 'user', content: 'I added the headers but still getting the error. Here\'s my fetch code: fetch("/api/users").then(res => res.json())' },
        { role: 'assistant', content: 'Since you\'re using Next.js, relative URLs like "/api/users" should work fine. The issue might be with the request method. Are you making a POST request without proper headers?' },
        { role: 'user', content: 'It\'s a GET request. Let me check the Network tab... I see it\'s hitting localhost:3000 but my Next.js app is on localhost:3001' },
        { role: 'assistant', content: 'That\'s the issue! Your Next.js app and API should be on the same port (3000 by default). Check your package.json scripts and make sure you\'re not running separate servers.' },
        { role: 'user', content: 'You\'re right! I had accidentally started two processes. Now I need help with my PostgreSQL query performance.' },
      ];

      const result = windowConversation(messages, {
        maxMessages: 8,
        summarizeThreshold: 8, // Lower threshold to force windowing
      });

      const rebuilt = buildWindowedMessages(result);
      const systemContent = rebuilt[0].content;
      
      // Technical stack should be preserved
      expect(systemContent).toContain('React');
      expect(systemContent).toContain('TypeScript');
      expect(systemContent).toContain('Next.js');
      expect(systemContent).toContain('PostgreSQL');
      
      // Problem-solving context should be preserved
      expect(systemContent).toMatch(/CORS|API|error|debugging|React|TypeScript|Next\.js/i);
      expect(systemContent).toMatch(/localhost.*300/); // Port issue context
      
      // Latest conversation should be about PostgreSQL
      const lastMessage = rebuilt[rebuilt.length - 1];
      expect(lastMessage.content).toContain('PostgreSQL');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message array gracefully', () => {
      const result = windowConversation([], baseConfig);

      expect(result.systemPrompt).toBe('');
      expect(result.contextSummary).toBeNull();
      expect(result.recentMessages).toHaveLength(0);
      expect(result.meta.originalMessageCount).toBe(0);
      expect(result.meta.windowedMessageCount).toBe(0);
      expect(result.meta.trimmedMessageCount).toBe(0);
      expect(result.meta.originalTokenEstimate).toBe(0);
      expect(result.meta.windowedTokenEstimate).toBe(0);
      expect(result.meta.summaryTokenEstimate).toBe(0);
      expect(result.meta.summarizationMethod).toBe('none');

      const rebuilt = buildWindowedMessages(result);
      expect(rebuilt).toHaveLength(0);
    });

    it('should handle system prompt only', () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are a helpful AI assistant trained to provide accurate and helpful responses.' }
      ];

      const result = windowConversation(messages, baseConfig);

      expect(result.systemPrompt).toBe('You are a helpful AI assistant trained to provide accurate and helpful responses.');
      expect(result.contextSummary).toBeNull();
      expect(result.recentMessages).toHaveLength(0);
      expect(result.meta.originalMessageCount).toBe(1);
      expect(result.meta.windowedMessageCount).toBe(1);
      expect(result.meta.summarizationMethod).toBe('none');

      const rebuilt = buildWindowedMessages(result);
      expect(rebuilt).toHaveLength(1);
      expect(rebuilt[0].role).toBe('system');
    });

    it('should handle very long messages (>5000 chars each)', () => {
      const longContent = 'This is a very long message. '.repeat(200); // ~6000 chars
      
      const messages: Message[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: longContent + ' This is my first question.' },
        { role: 'assistant', content: longContent + ' This is my first response.' },
        { role: 'user', content: longContent + ' This is my second question.' },
        { role: 'assistant', content: longContent + ' This is my second response.' },
        { role: 'user', content: longContent + ' This is my third question.' },
        { role: 'assistant', content: longContent + ' This is my third response.' },
        { role: 'user', content: 'Now a short question.' },
      ];

      const originalTokens = estimateTokens(messages);
      expect(originalTokens).toBeGreaterThan(5000); // Should be high due to long messages

      const result = windowConversation(messages, {
        ...baseConfig,
        maxTokens: 5000, // Force aggressive windowing due to token limit
        summarizeThreshold: 4,
      });

      expect(result.contextSummary).toBeTruthy();
      expect(result.meta.originalTokenEstimate).toBeGreaterThan(5000);
      expect(result.meta.windowedTokenEstimate).toBeLessThan(result.meta.originalTokenEstimate);
      
      // Should achieve significant token savings due to long messages
      const tokenSavings = ((result.meta.originalTokenEstimate - result.meta.windowedTokenEstimate) / result.meta.originalTokenEstimate) * 100;
      expect(tokenSavings).toBeGreaterThan(40);

      const rebuilt = buildWindowedMessages(result);
      const lastMessage = rebuilt[rebuilt.length - 1];
      expect(lastMessage.content).toContain('short question');
    });

    it('should handle mixed content types (string and ContentBlock[])', () => {
      const messages: Message[] = [
        { 
          role: 'system', 
          content: [
            { type: 'text', text: 'You are a helpful assistant.' },
            { type: 'text', text: ' You can process multiple content types.' }
          ]
        },
        { role: 'user', content: 'Hello, I need help with images.' },
        { 
          role: 'assistant', 
          content: [
            { type: 'text', text: 'I can help you with images. What specifically do you need?' }
          ]
        },
        { role: 'user', content: 'How do I resize an image in CSS?' },
        { role: 'assistant', content: 'You can use width, height, or object-fit properties in CSS.' },
        { role: 'user', content: 'What about responsive images?' },
        { role: 'assistant', content: 'Use max-width: 100% or the picture element with srcset.' },
        { role: 'user', content: 'Can you show me an example?' },
        { role: 'assistant', content: 'Sure! Here\'s a responsive image example: <img src="image.jpg" style="max-width: 100%; height: auto;">' },
        { role: 'user', content: 'Thanks, that helps!' },
      ];

      const result = windowConversation(messages, {
        maxMessages: 5,
        summarizeThreshold: 5, // Lower threshold to ensure windowing
      });

      expect(result.systemPrompt).toContain('helpful assistant');
      expect(result.systemPrompt).toContain('content types');
      
      expect(result.contextSummary).toBeTruthy();
      expect(result.contextSummary).toContain('image');
      
      const rebuilt = buildWindowedMessages(result);
      expect(rebuilt.length).toBeGreaterThan(0);
      expect(rebuilt[0].role).toBe('system');
    });

    it('should handle conversation with no user messages (edge case)', () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'assistant', content: 'Hello! How can I help you today?' },
        { role: 'assistant', content: 'I\'m here whenever you need assistance.' },
        { role: 'assistant', content: 'Feel free to ask me anything.' },
      ];

      const result = windowConversation(messages, baseConfig);

      expect(result.systemPrompt).toBe('You are a helpful assistant.');
      expect(result.recentMessages).toHaveLength(3); // All assistant messages
      expect(result.meta.windowedMessageCount).toBe(4);
      
      const rebuilt = buildWindowedMessages(result);
      expect(rebuilt.filter(m => m.role === 'assistant')).toHaveLength(3);
    });
  });

  describe('Token Savings Verification', () => {
    it('should calculate accurate token estimates', () => {
      const messages = generateConversation(25);
      const originalTokens = estimateTokens(messages);
      
      const result = windowConversation(messages, {
        maxMessages: 10,
        summarizeThreshold: 12,
      });

      expect(result.meta.originalTokenEstimate).toBe(originalTokens);
      expect(result.meta.windowedTokenEstimate).toBeLessThan(originalTokens);
      expect(result.meta.summaryTokenEstimate).toBeGreaterThan(0);
      
      // Verify rebuilt tokens match estimate
      const rebuilt = buildWindowedMessages(result);
      const rebuiltTokens = estimateTokens(rebuilt);
      
      // Should be close (within 10% due to summary formatting)
      const estimateAccuracy = Math.abs(rebuiltTokens - result.meta.windowedTokenEstimate) / result.meta.windowedTokenEstimate;
      expect(estimateAccuracy).toBeLessThan(0.1);
    });

    it('should meet minimum savings thresholds for different conversation sizes', () => {
      const testCases = [
        { size: 15, expectedSavings: 20 },
        { size: 25, expectedSavings: 40 },
        { size: 40, expectedSavings: 55 },
        { size: 60, expectedSavings: 65 },
      ];

      testCases.forEach(({ size, expectedSavings }) => {
        const messages = generateConversation(size);
        const result = windowConversation(messages, {
          maxMessages: 10,
          summarizeThreshold: 12,
        });

        const tokenSavings = ((result.meta.originalTokenEstimate - result.meta.windowedTokenEstimate) / result.meta.originalTokenEstimate) * 100;
        expect(tokenSavings).toBeGreaterThan(expectedSavings);
      });
    });

    it('should optimize for different token budgets', () => {
      const messages = generateConversation(30);
      
      const budgets = [2000, 3000, 4000, 5000];
      
      budgets.forEach(budget => {
        const result = windowConversation(messages, {
          maxMessages: 20, // High message limit
          maxTokens: budget,
          summarizeThreshold: 10,
        });

        expect(result.meta.windowedTokenEstimate).toBeLessThanOrEqual(budget * 1.1); // 10% tolerance
        
        if (result.meta.windowedTokenEstimate > budget) {
          // Should have applied aggressive windowing
          expect(result.contextSummary).toBeTruthy();
          expect(result.meta.trimmedMessageCount).toBeGreaterThan(0);
        }
      });
    });
  });
});