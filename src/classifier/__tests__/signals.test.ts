/**
 * Tests for complexity signals detection
 */

import { describe, expect, test } from 'vitest';
import { 
  extractKeywords, 
  analyzeStructuralSignals, 
  COMPLEXITY_SIGNALS,
  STRUCTURAL_WEIGHTS,
  type ComplexityTier 
} from '../signals.js';

describe('extractKeywords', () => {
  test('should extract simple keywords', () => {
    const text = "Hello! Yes, thanks for your help.";
    const keywords = extractKeywords(text);
    
    expect(keywords).toContain('hello');
    expect(keywords).toContain('yes');
    expect(keywords).toContain('thanks');
  });

  test('should extract complex keywords', () => {
    const text = "I need to debug this architecture issue and optimize the performance";
    const keywords = extractKeywords(text);
    
    expect(keywords).toContain('debug');
    expect(keywords).toContain('architecture');
    expect(keywords).toContain('optimize');
    expect(keywords).toContain('performance');
  });

  test('should extract reasoning keywords', () => {
    const text = "Can you prove this theorem and analyze the ethical implications?";
    const keywords = extractKeywords(text);
    
    expect(keywords).toContain('prove');
    expect(keywords).toContain('theorem');
    expect(keywords).toContain('analyze');
    expect(keywords).toContain('ethical');
  });

  test('should be case insensitive', () => {
    const text = "HELLO WORLD! Please EXPLAIN this DEBUG issue.";
    const keywords = extractKeywords(text);
    
    expect(keywords).toContain('hello');
    expect(keywords).toContain('explain');
    expect(keywords).toContain('debug');
  });

  test('should deduplicate keywords', () => {
    const text = "Debug this debug issue with debugging tools";
    const keywords = extractKeywords(text);
    
    const debugCount = keywords.filter(k => k === 'debug').length;
    expect(debugCount).toBe(1);
  });

  test('should handle empty text', () => {
    const keywords = extractKeywords('');
    expect(keywords).toEqual([]);
  });
});

describe('analyzeStructuralSignals', () => {
  test('should detect code blocks', () => {
    const messages = [{
      role: 'user' as const,
      content: 'Here is my code:\n```javascript\nfunction test() { return 42; }\n```'
    }];
    
    const signals = analyzeStructuralSignals(messages);
    
    expect(signals.hasCodeBlocks).toBe(true);
    expect(signals.messageLength).toBeGreaterThan(50);
  });

  test('should detect inline code', () => {
    const messages = [{
      role: 'user' as const,
      content: 'The `console.log()` function is not working'
    }];
    
    const signals = analyzeStructuralSignals(messages);
    
    expect(signals.hasCodeBlocks).toBe(true);
  });

  test('should detect tool calls in message', () => {
    const messages = [{
      role: 'user' as const,
      content: 'Help me with this',
      tool_calls: [{ id: '1', type: 'function', function: { name: 'test' } }]
    }];
    
    const signals = analyzeStructuralSignals(messages);
    
    expect(signals.hasToolCalls).toBe(true);
  });

  test('should detect tool role messages', () => {
    const messages = [
      { role: 'user' as const, content: 'Run a search' },
      { role: 'tool' as const, content: 'Search results: ...' }
    ];
    
    const signals = analyzeStructuralSignals(messages);
    
    expect(signals.hasToolCalls).toBe(true);
  });

  test('should count questions', () => {
    const messages = [{
      role: 'user' as const,
      content: 'What is this? How does it work? Can you help?'
    }];
    
    const signals = analyzeStructuralSignals(messages);
    
    expect(signals.questionCount).toBe(3);
  });

  test('should handle complex content blocks', () => {
    const messages = [{
      role: 'user' as const,
      content: [
        { type: 'text', text: 'Here is some text with keywords: debug and architecture' },
        { type: 'image', url: 'test.jpg' }
      ]
    }];
    
    const signals = analyzeStructuralSignals(messages);
    
    expect(signals.complexityIndicators).toContain('debug');
    expect(signals.complexityIndicators).toContain('architecture');
  });

  test('should handle empty messages', () => {
    const signals = analyzeStructuralSignals([]);
    
    expect(signals.hasCodeBlocks).toBe(false);
    expect(signals.hasToolCalls).toBe(false);
    expect(signals.messageLength).toBe(0);
    expect(signals.questionCount).toBe(0);
  });

  test('should extract complexity indicators', () => {
    const messages = [{
      role: 'user' as const,
      content: 'I need to debug and optimize this complex algorithm'
    }];
    
    const signals = analyzeStructuralSignals(messages);
    
    expect(signals.complexityIndicators).toContain('debug');
    expect(signals.complexityIndicators).toContain('optimize');
    expect(signals.complexityIndicators.length).toBeGreaterThan(1);
  });
});

describe('COMPLEXITY_SIGNALS configuration', () => {
  test('should have all required tiers', () => {
    const expectedTiers: ComplexityTier[] = ['simple', 'mid', 'complex', 'reasoning'];
    
    for (const tier of expectedTiers) {
      expect(COMPLEXITY_SIGNALS[tier]).toBeDefined();
      expect(Array.isArray(COMPLEXITY_SIGNALS[tier])).toBe(true);
      expect(COMPLEXITY_SIGNALS[tier].length).toBeGreaterThan(0);
    }
  });

  test('should have valid signal structures', () => {
    for (const tier of Object.keys(COMPLEXITY_SIGNALS) as ComplexityTier[]) {
      for (const signal of COMPLEXITY_SIGNALS[tier]) {
        expect(signal.keywords).toBeDefined();
        expect(Array.isArray(signal.keywords)).toBe(true);
        expect(signal.keywords.length).toBeGreaterThan(0);
        
        expect(typeof signal.weight).toBe('number');
        expect(signal.weight).toBeGreaterThan(0);
        
        expect(typeof signal.description).toBe('string');
        expect(signal.description.length).toBeGreaterThan(0);
      }
    }
  });

  test('should have reasoning tier with highest weights', () => {
    const reasoningWeights = COMPLEXITY_SIGNALS.reasoning.map(s => s.weight);
    const complexWeights = COMPLEXITY_SIGNALS.complex.map(s => s.weight);
    
    const maxReasoningWeight = Math.max(...reasoningWeights);
    const maxComplexWeight = Math.max(...complexWeights);
    
    expect(maxReasoningWeight).toBeGreaterThanOrEqual(maxComplexWeight);
  });
});

describe('STRUCTURAL_WEIGHTS configuration', () => {
  test('should have all required weight categories', () => {
    expect(STRUCTURAL_WEIGHTS.codeBlock).toBeDefined();
    expect(STRUCTURAL_WEIGHTS.toolCalls).toBeDefined();
    expect(STRUCTURAL_WEIGHTS.messageLength).toBeDefined();
    expect(STRUCTURAL_WEIGHTS.questionCount).toBeDefined();
  });

  test('should have weights for all tiers', () => {
    const expectedTiers: ComplexityTier[] = ['simple', 'mid', 'complex', 'reasoning'];
    
    for (const tier of expectedTiers) {
      expect(STRUCTURAL_WEIGHTS.codeBlock[tier]).toBeDefined();
      expect(typeof STRUCTURAL_WEIGHTS.codeBlock[tier]).toBe('number');
      
      expect(STRUCTURAL_WEIGHTS.toolCalls[tier]).toBeDefined();
      expect(typeof STRUCTURAL_WEIGHTS.toolCalls[tier]).toBe('number');
    }
  });

  test('should have logical weight progressions', () => {
    // Code blocks should boost complex more than simple
    expect(STRUCTURAL_WEIGHTS.codeBlock.complex).toBeGreaterThan(STRUCTURAL_WEIGHTS.codeBlock.simple);
    
    // Tool calls should boost complex more than simple
    expect(STRUCTURAL_WEIGHTS.toolCalls.complex).toBeGreaterThan(STRUCTURAL_WEIGHTS.toolCalls.simple);
  });

  test('should have message length thresholds in ascending order', () => {
    const thresholds = STRUCTURAL_WEIGHTS.messageLength.thresholds;
    
    expect(thresholds.veryShort).toBeLessThan(thresholds.short);
    expect(thresholds.short).toBeLessThan(thresholds.medium);
    expect(thresholds.medium).toBeLessThan(thresholds.long);
  });
});