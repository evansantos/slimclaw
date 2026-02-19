/**
 * Tests for conversation summarization functionality
 */

import { describe, it, expect } from 'vitest';
import { extractKeyPoints, generateSummary } from '../summarizer.js';
import type { Message } from '../token-counter.js';

describe('extractKeyPoints', () => {
  it('should extract key points from assistant messages', () => {
    const messages: Message[] = [
      { role: 'user', content: 'How do I create a function in JavaScript?' },
      { 
        role: 'assistant', 
        content: 'You can create a function using the function keyword. The basic syntax is: function name() { // code here }. This creates a reusable block of code.' 
      },
      { role: 'user', content: 'What about arrow functions?' },
      { 
        role: 'assistant', 
        content: 'Arrow functions provide a shorter syntax: const name = () => { // code }. They have different behavior with the "this" keyword.' 
      },
    ];

    const summary = extractKeyPoints(messages);
    
    expect(summary).toBeTruthy();
    expect(summary).toContain('Previous context:');
    expect(summary?.toLowerCase()).toContain('function');
  });

  it('should extract key points from user requests', () => {
    const messages: Message[] = [
      { role: 'user', content: 'I need help with React component state management in my e-commerce application.' },
      { role: 'assistant', content: 'I can help with React state management.' },
      { role: 'user', content: 'Can you explain useState and useEffect hooks for handling shopping cart data?' },
      { role: 'assistant', content: 'useState manages component state, useEffect handles side effects.' },
    ];

    const summary = extractKeyPoints(messages);
    
    expect(summary).toBeTruthy();
    expect(summary?.toLowerCase()).toContain('react');
  });

  it('should return null for empty messages', () => {
    const summary = extractKeyPoints([]);
    expect(summary).toBeNull();
  });

  it('should return null for messages without significant content', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
    ];

    const summary = extractKeyPoints(messages);
    // Should return null or very minimal summary for trivial content
    expect(summary).toBeFalsy();
  });

  it('should filter out filler phrases', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Can you help me with Python?' },
      { 
        role: 'assistant', 
        content: 'Let me help you with that. I can help you understand Python programming. Python is a powerful language for data science.' 
      },
    ];

    const summary = extractKeyPoints(messages);
    
    expect(summary).toBeTruthy();
    // Should not contain filler phrases like "Let me help"
    expect(summary).not.toContain('Let me help');
    expect(summary?.toLowerCase()).toContain('python');
  });

  it('should prioritize technical and factual content', () => {
    const messages: Message[] = [
      { role: 'user', content: 'How do databases work?' },
      { 
        role: 'assistant', 
        content: 'Of course! I\'d be happy to help. Databases store structured data in tables. SQL is used for querying. The main types are relational and NoSQL databases.' 
      },
    ];

    const summary = extractKeyPoints(messages);
    
    expect(summary).toBeTruthy();
    expect(summary?.toLowerCase()).toContain('database');
    expect(summary).not.toContain('Of course!');
    expect(summary).not.toContain('I\'d be happy');
  });

  it('should limit number of key points', () => {
    const messages: Message[] = [];
    
    // Create many messages to test limiting
    for (let i = 0; i < 20; i++) {
      messages.push(
        { role: 'user', content: `Question ${i}: Can you explain concept ${i}?` },
        { role: 'assistant', content: `The solution for concept ${i} is to implement approach ${i}. This is important for understanding ${i}.` }
      );
    }

    const summary = extractKeyPoints(messages);
    
    expect(summary).toBeTruthy();
    
    // Should be limited in length and number of points
    const points = summary?.split(';') || [];
    expect(points.length).toBeLessThanOrEqual(6); // Should be limited
  });

  it('should handle ContentBlock[] format', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'How do I use React hooks?' }] },
      { 
        role: 'assistant', 
        content: [
          { type: 'text', text: 'React hooks let you use state in functional components.' },
          { type: 'text', text: 'useState is the most common hook for managing state.' }
        ]
      },
    ];

    const summary = extractKeyPoints(messages);
    
    expect(summary).toBeTruthy();
    expect(summary?.toLowerCase()).toContain('react');
    expect(summary?.toLowerCase()).toContain('hooks');
  });

  it('should deduplicate similar points', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Tell me about Python functions' },
      { role: 'assistant', content: 'Python functions are defined with def keyword. Functions help organize code.' },
      { role: 'user', content: 'More about functions please' },
      { role: 'assistant', content: 'Python functions are created using def. Functions make code reusable.' },
    ];

    const summary = extractKeyPoints(messages);
    
    expect(summary).toBeTruthy();
    
    // Should not have very similar points repeated
    const lowerSummary = summary?.toLowerCase() || '';
    const pythonMatches = (lowerSummary.match(/python functions/g) || []).length;
    expect(pythonMatches).toBeLessThanOrEqual(1); // Should deduplicate
  });
});

describe('generateSummary', () => {
  it('should return summary with metadata', () => {
    const messages: Message[] = [
      { role: 'user', content: 'I want to learn about machine learning algorithms for classification problems.' },
      { 
        role: 'assistant', 
        content: 'For classification, you can use algorithms like logistic regression, decision trees, and support vector machines. Each has different strengths.' 
      },
      { role: 'user', content: 'Which one should I start with?' },
      { role: 'assistant', content: 'I recommend starting with logistic regression as it\'s simpler to understand and implement.' },
    ];

    const result = generateSummary(messages);

    expect(result.method).toBe('heuristic');
    expect(result.keyPointsCount).toBeGreaterThan(0);
    expect(result.tokensSaved).toBeGreaterThan(0);
    expect(result.summary).toBeTruthy();
  });

  it('should handle empty messages', () => {
    const result = generateSummary([]);

    expect(result.method).toBe('heuristic');
    expect(result.keyPointsCount).toBe(0);
    expect(result.tokensSaved).toBe(0);
    expect(result.summary).toBe('');
  });

  it('should calculate tokens saved correctly', () => {
    const longMessages: Message[] = [
      { 
        role: 'user', 
        content: 'This is a very long user message that contains a lot of detailed information about a complex topic that needs to be summarized efficiently.' 
      },
      { 
        role: 'assistant', 
        content: 'This is an equally long assistant response that provides detailed explanations and examples to help the user understand the complex topic better.' 
      },
    ];

    const result = generateSummary(longMessages);

    // Should save tokens by creating shorter summary
    expect(result.tokensSaved).toBeGreaterThan(0);
    
    // Summary should be shorter than original
    const originalLength = longMessages.reduce((sum, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return sum + content.length;
    }, 0);
    
    expect(result.summary.length).toBeLessThan(originalLength);
  });
});

describe('summarization patterns', () => {
  it('should prioritize decisions and recommendations', () => {
    const messages: Message[] = [
      { role: 'user', content: 'What framework should I use for my web app?' },
      { 
        role: 'assistant', 
        content: 'Let me think about this. I recommend using React for your web app. React has great ecosystem support and is widely adopted.' 
      },
    ];

    const summary = extractKeyPoints(messages);
    
    expect(summary).toBeTruthy();
    expect(summary?.toLowerCase()).toContain('recommend');
    expect(summary?.toLowerCase()).toContain('react');
  });

  it('should capture technical implementation details', () => {
    const messages: Message[] = [
      { role: 'user', content: 'How do I implement authentication?' },
      { 
        role: 'assistant', 
        content: 'For authentication, you should use JWT tokens stored in httpOnly cookies. This prevents XSS attacks while maintaining session state.' 
      },
    ];

    const summary = extractKeyPoints(messages);
    
    expect(summary).toBeTruthy();
    expect(summary?.toLowerCase()).toContain('jwt');
    expect(summary?.toLowerCase()).toContain('authentication');
  });

  it('should identify user goals and constraints', () => {
    const messages: Message[] = [
      { role: 'user', content: 'I need to build a real-time chat app with React and Node.js for my startup. The budget is limited.' },
      { role: 'assistant', content: 'For real-time functionality, you can use Socket.io with Node.js.' },
    ];

    const summary = extractKeyPoints(messages);
    
    expect(summary).toBeTruthy();
    expect(summary?.toLowerCase()).toContain('chat');
    expect(summary?.toLowerCase()).toContain('real-time');
  });

  it('should maintain conversation context across multiple turns', () => {
    const messages: Message[] = [
      { role: 'user', content: 'I\'m building a todo app' },
      { role: 'assistant', content: 'Great! Todo apps are perfect for learning CRUD operations.' },
      { role: 'user', content: 'I want to add user authentication' },
      { role: 'assistant', content: 'Adding auth to your todo app will require user registration and login endpoints.' },
      { role: 'user', content: 'What about data persistence?' },
      { role: 'assistant', content: 'For your todo app with auth, I recommend using a database like PostgreSQL.' },
    ];

    const summary = extractKeyPoints(messages);
    
    expect(summary).toBeTruthy();
    expect(summary?.toLowerCase()).toContain('todo');
    expect(summary?.toLowerCase()).toContain('auth');
  });
});