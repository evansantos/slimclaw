import { describe, test, expect } from 'vitest';
import { classifyPromptFast } from '../fast-classifier.js';

describe('Fast Classifier', () => {
  describe('Simple tier', () => {
    test('should classify greetings as simple', () => {
      const result = classifyPromptFast('hi');
      expect(result.tier).toBe('simple');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.signals).toContain('greeting');
    });

    test('should classify "what time is it?" as simple', () => {
      const result = classifyPromptFast('what time is it?');
      expect(result.tier).toBe('simple');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.signals).toContain('simple-question');
    });

    test('should classify short yes/no as simple', () => {
      const result = classifyPromptFast('yes');
      expect(result.tier).toBe('simple');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Mid tier', () => {
    test('should classify "explain how TCP works" as mid', () => {
      const result = classifyPromptFast('explain how TCP works');
      expect(result.tier).toBe('mid');
      expect(result.confidence).toBeGreaterThanOrEqual(0.6); // Short explanation requests get moderate confidence
      expect(result.signals).toContain('explanation-request');
    });

    test('should classify description requests as mid', () => {
      const result = classifyPromptFast('describe the difference between REST and GraphQL');
      expect(result.tier).toBe('mid');
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Complex tier', () => {
    test('should classify implementation tasks as complex', () => {
      const result = classifyPromptFast('implement a binary search tree in TypeScript');
      expect(result.tier).toBe('complex');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.signals).toContain('implementation-task');
    });

    test('should classify debugging tasks as complex', () => {
      const result = classifyPromptFast('debug this React component that keeps re-rendering');
      expect(result.tier).toBe('complex');
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Reasoning tier', () => {
    test('should classify "design a distributed cache" as reasoning', () => {
      const result = classifyPromptFast('design a distributed cache with consistency guarantees');
      expect(result.tier).toBe('reasoning');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.signals).toContain('reasoning-task');
    });

    test('should classify architecture questions as reasoning', () => {
      const result = classifyPromptFast(
        'architect a scalable microservices system with high availability',
      );
      expect(result.tier).toBe('reasoning');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('should classify analysis with multiple technical terms as reasoning', () => {
      const result = classifyPromptFast(
        'analyze the consensus protocol for distributed replication',
      );
      expect(result.tier).toBe('reasoning');
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Edge cases', () => {
    test('should handle empty text', () => {
      const result = classifyPromptFast('');
      expect(result.tier).toBe('mid');
      expect(result.confidence).toBeLessThan(0.5);
    });

    test('should handle mixed signals with reasonable confidence', () => {
      const result = classifyPromptFast('explain how to design a cache');
      // Should pick one tier, confidence may vary
      expect(['mid', 'complex', 'reasoning']).toContain(result.tier);
      expect(result.confidence).toBeGreaterThan(0);
    });
  });
});
