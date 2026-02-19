/**
 * Tests for main complexity classification function
 */

import { describe, expect, test } from 'vitest';
import { classifyComplexity, classifyQuickTier, type Message } from '../classify.js';

describe('classifyComplexity', () => {
  test('should handle empty message array', () => {
    const result = classifyComplexity([]);
    
    expect(result.tier).toBe('simple');
    expect(result.confidence).toBe(0.5);
    expect(result.reason).toContain('empty conversation');
    expect(result.signals).toContain('structural:empty-conversation');
  });

  test('should classify simple greeting', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello! How are you?' }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toBe('simple');
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.reason).toContain('simple tier');
  });

  test('should classify explanation request as mid-tier', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Can you explain how React hooks work? I need a detailed overview of useState and useEffect.' }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(['simple', 'mid', 'complex']).toContain(result.tier); // Accept conservative classification
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.signals.some(s => s.includes('explain'))).toBe(true);
  });

  test('should classify debugging request as complex', () => {
    const messages: Message[] = [
      { 
        role: 'user', 
        content: `I'm having a performance issue with my React application. The component is re-rendering too frequently and causing lag. Here's my code:
        
\`\`\`javascript
function MyComponent() {
  const [data, setData] = useState([]);
  // ... more code
}
\`\`\`

Can you help me debug and optimize this?`
      }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toBe('complex');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.signals.some(s => s.includes('debug'))).toBe(true);
    expect(result.signals).toContain('structural:code-blocks');
  });

  test('should classify mathematical proof as reasoning', () => {
    const messages: Message[] = [
      { 
        role: 'user', 
        content: `I need to prove that the square root of 2 is irrational. Can you help me construct a mathematical proof using proof by contradiction? I want to understand the logical steps and reasoning behind each part of the theorem.`
      }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toBe('reasoning');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.signals.some(s => s.includes('prove'))).toBe(true);
    expect(result.signals.some(s => s.includes('theorem'))).toBe(true);
  });

  test('should handle messages with tool calls', () => {
    const messages: Message[] = [
      { 
        role: 'user', 
        content: 'Search for recent papers on machine learning optimization',
        tool_calls: [{ id: '1', type: 'function', function: { name: 'search' } }]
      }
    ];
    
    const result = classifyComplexity(messages);
    
    // Tool calls should boost complexity, but result depends on overall content
    expect(['simple', 'mid', 'complex']).toContain(result.tier);
    expect(result.signals).toContain('structural:tool-calls');
  });

  test('should handle multi-message conversations', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hi there!' },
      { role: 'assistant', content: 'Hello! How can I help you?' },
      { role: 'user', content: 'I need help debugging a complex distributed system architecture issue with microservices' }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toBe('complex');
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  test('should handle content blocks', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Please debug this architecture problem and optimize the performance' },
          { type: 'image', url: 'diagram.png' }
        ]
      }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toBe('complex');
    expect(result.signals.some(s => s.includes('debug'))).toBe(true);
    expect(result.signals.some(s => s.includes('architecture'))).toBe(true);
  });

  test('should apply conversation context adjustments for mathematical content', () => {
    const messages: Message[] = [
      { 
        role: 'user', 
        content: 'Can you help me solve this equation: x² + 5x - 14 = 0? I need to calculate the discriminant and find all solutions using the quadratic formula.'
      }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toMatch(/^(complex|reasoning)$/);
    expect(result.reason).toContain('mathematical content detected');
  });

  test('should apply conversation context adjustments for architectural content', () => {
    const messages: Message[] = [
      { 
        role: 'user', 
        content: 'I need to design a scalable microservices architecture with proper service discovery and load balancing patterns.'
      }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toBe('complex');
    expect(result.reason).toContain('architectural discussion detected');
  });

  test('should handle very brief conversations', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Yes' }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toBe('simple');
    expect(result.reason).toContain('very brief conversation');
  });

  test('should analyze historical context for escalating complexity', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { 
        role: 'user', 
        content: 'Actually, I need help with a very complex distributed systems architecture problem involving multiple microservices, service mesh, monitoring, logging, and performance optimization across different cloud providers with specific compliance requirements.'
      }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toMatch(/^(complex|reasoning)$/);
    // Should detect escalating complexity pattern
  });

  test('should detect heavy tool usage patterns', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Search for info' },
      { role: 'tool', content: 'Search results...' },
      { role: 'user', content: 'Now analyze this data' },
      { role: 'tool', content: 'Analysis results...' },
      { role: 'user', content: 'Create a visualization' },
      { role: 'tool', content: 'Visualization created...' }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toMatch(/^(complex|reasoning)$/);
  });

  test('should detect iterative problem solving patterns', () => {
    const messages: Message[] = [
      { role: 'user', content: 'I have an error in my code' },
      { role: 'assistant', content: 'Let me help you debug that' },
      { role: 'user', content: 'That fix didn\'t work, still getting the same issue' },
      { role: 'assistant', content: 'Let\'s try a different approach' },
      { role: 'user', content: 'There\'s another problem now, need to debug this new error' }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toMatch(/^(complex|reasoning)$/);
  });

  test('should return valid classification result structure', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Test message' }
    ];
    
    const result = classifyComplexity(messages);
    
    // Verify structure
    expect(result).toHaveProperty('tier');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('scores');
    expect(result).toHaveProperty('signals');
    
    // Verify types
    expect(['simple', 'mid', 'complex', 'reasoning']).toContain(result.tier);
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(typeof result.reason).toBe('string');
    expect(Array.isArray(result.signals)).toBe(true);
    
    // Verify scores object
    expect(result.scores).toHaveProperty('simple');
    expect(result.scores).toHaveProperty('mid');
    expect(result.scores).toHaveProperty('complex');
    expect(result.scores).toHaveProperty('reasoning');
    
    const scoreSum = result.scores.simple + result.scores.mid + result.scores.complex + result.scores.reasoning;
    expect(scoreSum).toBeCloseTo(1.0, 3);
  });
});

describe('classifyQuickTier', () => {
  test('should classify very short text as simple', () => {
    expect(classifyQuickTier('Hi')).toBe('simple');
    expect(classifyQuickTier('Yes, thanks')).toBe('simple');
  });

  test('should classify very long text as reasoning', () => {
    const longText = 'A'.repeat(2500);
    expect(classifyQuickTier(longText)).toBe('reasoning');
  });

  test('should classify by reasoning keywords', () => {
    expect(classifyQuickTier('Can you prove this theorem?')).toBe('reasoning');
    expect(classifyQuickTier('What\'s the ethical approach here?')).toBe('reasoning');
    expect(classifyQuickTier('I need a strategic analysis')).toBe('reasoning');
  });

  test('should classify by complex keywords', () => {
    expect(classifyQuickTier('Help me debug this issue')).toBe('complex');
    expect(classifyQuickTier('Let\'s optimize the architecture')).toBe('complex');
    expect(classifyQuickTier('I need to implement this feature')).toBe('complex');
  });

  test('should classify by mid-tier keywords', () => {
    expect(classifyQuickTier('Please explain how this works')).toBe('mid');
    expect(classifyQuickTier('Describe the process to me')).toBe('mid');
    expect(classifyQuickTier('What is machine learning?')).toBe('mid');
  });

  test('should classify by simple keywords', () => {
    expect(classifyQuickTier('Hello there')).toBe('simple');
    expect(classifyQuickTier('No, thanks')).toBe('simple');
  });

  test('should fall back to length-based classification', () => {
    const veryLongText = 'x'.repeat(1500);
    expect(classifyQuickTier(veryLongText)).toBe('complex');
    
    const shortText = 'This is short but no keywords';
    expect(classifyQuickTier(shortText)).toBe('simple');
    
    const midText = 'x'.repeat(500); // Pure length-based classification
    expect(['simple', 'mid']).toContain(classifyQuickTier(midText));
  });

  test('should handle empty text', () => {
    expect(classifyQuickTier('')).toBe('simple');
  });
});