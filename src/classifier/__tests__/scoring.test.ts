/**
 * Tests for complexity scoring system
 */

import { describe, expect, test } from 'vitest';
import {
  calculateKeywordScores,
  applyStructuralAdjustments,
  normalizeScores,
  resolveTier,
  generateReason,
  scoreComplexity,
  type TierScores
} from '../scoring.js';
import { type StructuralSignals } from '../signals.js';

describe('calculateKeywordScores', () => {
  test('should score simple keywords correctly', () => {
    const keywords = ['hello', 'yes', 'thanks'];
    const scores = calculateKeywordScores(keywords);
    
    expect(scores.simple).toBeGreaterThan(0);
    expect(scores.simple).toBeGreaterThan(scores.complex);
  });

  test('should score complex keywords correctly', () => {
    const keywords = ['debug', 'architecture', 'optimize'];
    const scores = calculateKeywordScores(keywords);
    
    expect(scores.complex).toBeGreaterThan(0);
    expect(scores.complex).toBeGreaterThan(scores.simple);
  });

  test('should score reasoning keywords correctly', () => {
    const keywords = ['prove', 'theorem', 'ethical'];
    const scores = calculateKeywordScores(keywords);
    
    expect(scores.reasoning).toBeGreaterThan(0);
    expect(scores.reasoning).toBeGreaterThan(scores.complex);
  });

  test('should handle empty keywords', () => {
    const scores = calculateKeywordScores([]);
    
    expect(scores.simple).toBe(0);
    expect(scores.mid).toBe(0);
    expect(scores.complex).toBe(0);
    expect(scores.reasoning).toBe(0);
  });

  test('should accumulate multiple keyword scores', () => {
    const keywords = ['debug', 'optimize', 'performance'];
    const scores = calculateKeywordScores(keywords);
    
    // Should have cumulative score from multiple complex keywords
    expect(scores.complex).toBeGreaterThan(1.0);
  });
});

describe('applyStructuralAdjustments', () => {
  const baseScores: TierScores = {
    simple: 1.0,
    mid: 0.5,
    complex: 0.3,
    reasoning: 0.1
  };

  test('should boost complex for code blocks', () => {
    const structuralSignals: StructuralSignals = {
      hasCodeBlocks: true,
      hasToolCalls: false,
      messageLength: 500,
      questionCount: 1,
      complexityIndicators: []
    };
    
    const adjusted = applyStructuralAdjustments(baseScores, structuralSignals);
    
    expect(adjusted.complex).toBeGreaterThan(baseScores.complex);
    expect(adjusted.simple).toBeLessThan(baseScores.simple);
  });

  test('should boost complex for tool calls', () => {
    const structuralSignals: StructuralSignals = {
      hasCodeBlocks: false,
      hasToolCalls: true,
      messageLength: 500,
      questionCount: 1,
      complexityIndicators: []
    };
    
    const adjusted = applyStructuralAdjustments(baseScores, structuralSignals);
    
    expect(adjusted.complex).toBeGreaterThan(baseScores.complex);
    expect(adjusted.simple).toBeLessThan(baseScores.simple);
  });

  test('should adjust for very short messages', () => {
    const structuralSignals: StructuralSignals = {
      hasCodeBlocks: false,
      hasToolCalls: false,
      messageLength: 30, // very short
      questionCount: 1,
      complexityIndicators: []
    };
    
    const adjusted = applyStructuralAdjustments(baseScores, structuralSignals);
    
    expect(adjusted.simple).toBeGreaterThan(baseScores.simple);
    expect(adjusted.reasoning).toBeLessThan(baseScores.reasoning);
  });

  test('should adjust for very long messages', () => {
    const structuralSignals: StructuralSignals = {
      hasCodeBlocks: false,
      hasToolCalls: false,
      messageLength: 4000, // very long
      questionCount: 1,
      complexityIndicators: []
    };
    
    const adjusted = applyStructuralAdjustments(baseScores, structuralSignals);
    
    expect(adjusted.reasoning).toBeGreaterThan(baseScores.reasoning);
    expect(adjusted.simple).toBeLessThan(baseScores.simple);
  });

  test('should adjust for multiple questions', () => {
    const structuralSignals: StructuralSignals = {
      hasCodeBlocks: false,
      hasToolCalls: false,
      messageLength: 500,
      questionCount: 3, // multiple questions
      complexityIndicators: []
    };
    
    const adjusted = applyStructuralAdjustments(baseScores, structuralSignals);
    
    expect(adjusted.complex).toBeGreaterThan(baseScores.complex);
  });
});

describe('normalizeScores', () => {
  test('should normalize positive scores to sum to 1', () => {
    const scores: TierScores = {
      simple: 2.0,
      mid: 1.0,
      complex: 3.0,
      reasoning: 1.0
    };
    
    const normalized = normalizeScores(scores);
    const sum = normalized.simple + normalized.mid + normalized.complex + normalized.reasoning;
    
    expect(sum).toBeCloseTo(1.0, 5);
  });

  test('should handle negative scores', () => {
    const scores: TierScores = {
      simple: -1.0,
      mid: 2.0,
      complex: 1.0,
      reasoning: 0.5
    };
    
    const normalized = normalizeScores(scores);
    const sum = normalized.simple + normalized.mid + normalized.complex + normalized.reasoning;
    
    expect(sum).toBeCloseTo(1.0, 5);
    expect(normalized.simple).toBeGreaterThan(0);
  });

  test('should handle zero scores', () => {
    const scores: TierScores = {
      simple: 0,
      mid: 0,
      complex: 0,
      reasoning: 0
    };
    
    const normalized = normalizeScores(scores);
    const sum = normalized.simple + normalized.mid + normalized.complex + normalized.reasoning;
    
    expect(sum).toBeCloseTo(1.0, 5);
    // Should give equal weights when all zero
    expect(normalized.simple).toBeCloseTo(0.25, 2);
  });
});

describe('resolveTier', () => {
  test('should pick tier with highest score', () => {
    const scores: TierScores = {
      simple: 0.1,
      mid: 0.2,
      complex: 0.6,
      reasoning: 0.1
    };
    
    const { tier, confidence } = resolveTier(scores);
    
    expect(tier).toBe('complex');
    expect(confidence).toBeGreaterThan(0.5);
  });

  test('should calculate confidence based on score margin', () => {
    const closeTie: TierScores = {
      simple: 0.25,
      mid: 0.26,
      complex: 0.24,
      reasoning: 0.25
    };
    
    const clearWinner: TierScores = {
      simple: 0.1,
      mid: 0.1,
      complex: 0.7,
      reasoning: 0.1
    };
    
    const tieResult = resolveTier(closeTie);
    const clearResult = resolveTier(clearWinner);
    
    expect(clearResult.confidence).toBeGreaterThan(tieResult.confidence);
    expect(tieResult.confidence).toBeCloseTo(0.5, 1);
    expect(clearResult.confidence).toBeGreaterThan(0.8);
  });

  test('should handle perfect tie', () => {
    const tie: TierScores = {
      simple: 0.25,
      mid: 0.25,
      complex: 0.25,
      reasoning: 0.25
    };
    
    const { tier, confidence } = resolveTier(tie);
    
    expect(['simple', 'mid', 'complex', 'reasoning']).toContain(tier);
    expect(confidence).toBe(0.5); // Minimum confidence for perfect tie
  });
});

describe('generateReason', () => {
  test('should generate reason for simple tier', () => {
    const structuralSignals: StructuralSignals = {
      hasCodeBlocks: false,
      hasToolCalls: false,
      messageLength: 50,
      questionCount: 1,
      complexityIndicators: []
    };
    
    const reason = generateReason('simple', 0.8, structuralSignals, ['hello', 'yes']);
    
    expect(reason).toContain('simple tier');
    expect(reason).toMatch(/(high|medium) confidence/);
    expect(reason).toContain('very short message');
  });

  test('should generate reason for complex tier with code', () => {
    const structuralSignals: StructuralSignals = {
      hasCodeBlocks: true,
      hasToolCalls: false,
      messageLength: 1200,
      questionCount: 1,
      complexityIndicators: []
    };
    
    const reason = generateReason('complex', 0.7, structuralSignals, ['debug', 'architecture']);
    
    expect(reason).toContain('complex tier');
    expect(reason).toContain('medium confidence');
    expect(reason).toContain('complex technical task');
  });

  test('should generate reason for reasoning tier', () => {
    const structuralSignals: StructuralSignals = {
      hasCodeBlocks: false,
      hasToolCalls: false,
      messageLength: 2500,
      questionCount: 1,
      complexityIndicators: []
    };
    
    const reason = generateReason('reasoning', 0.9, structuralSignals, ['prove', 'ethical']);
    
    expect(reason).toContain('reasoning tier');
    expect(reason).toContain('high confidence');
    expect(reason).toContain('deep reasoning');
  });

  test('should handle low confidence scenarios', () => {
    const structuralSignals: StructuralSignals = {
      hasCodeBlocks: false,
      hasToolCalls: false,
      messageLength: 300,
      questionCount: 1,
      complexityIndicators: []
    };
    
    const reason = generateReason('mid', 0.4, structuralSignals, []);
    
    expect(reason).toContain('low confidence');
  });
});

describe('scoreComplexity', () => {
  test('should provide complete scoring for simple case', () => {
    const keywords = ['hello', 'thanks'];
    const structuralSignals: StructuralSignals = {
      hasCodeBlocks: false,
      hasToolCalls: false,
      messageLength: 30,
      questionCount: 0,
      complexityIndicators: keywords
    };
    
    const result = scoreComplexity(keywords, structuralSignals);
    
    expect(result.tier).toBe('simple');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.scores.simple).toBeGreaterThan(result.scores.complex);
    expect(result.reason).toContain('simple tier');
    expect(result.signals).toContain('keyword:hello');
    expect(result.signals).toContain('structural:short-message');
  });

  test('should provide complete scoring for complex case', () => {
    const keywords = ['debug', 'architecture', 'optimize'];
    const structuralSignals: StructuralSignals = {
      hasCodeBlocks: true,
      hasToolCalls: true,
      messageLength: 1500,
      questionCount: 2,
      complexityIndicators: keywords
    };
    
    const result = scoreComplexity(keywords, structuralSignals);
    
    expect(result.tier).toBe('complex');
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.scores.complex).toBeGreaterThan(result.scores.simple);
    expect(result.reason).toContain('complex tier');
    expect(result.signals).toContain('keyword:debug');
    expect(result.signals).toContain('structural:code-blocks');
    expect(result.signals).toContain('structural:tool-calls');
  });

  test('should provide complete scoring for reasoning case', () => {
    const keywords = ['prove', 'theorem', 'ethical', 'analyze'];
    const structuralSignals: StructuralSignals = {
      hasCodeBlocks: false,
      hasToolCalls: false,
      messageLength: 3000,
      questionCount: 3,
      complexityIndicators: keywords
    };
    
    const result = scoreComplexity(keywords, structuralSignals);
    
    expect(result.tier).toBe('reasoning');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.scores.reasoning).toBeGreaterThan(result.scores.complex);
    expect(result.reason).toContain('reasoning tier');
    expect(result.signals).toContain('keyword:prove');
    expect(result.signals).toContain('structural:very-long-message');
    expect(result.signals).toContain('structural:multiple-questions');
  });
});