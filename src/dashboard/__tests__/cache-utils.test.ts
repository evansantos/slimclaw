/**
 * Tests for cache utility functions
 */
import { describe, it, expect } from 'vitest';
import { calculateCacheHitRate } from '../cache-utils.js';

describe('calculateCacheHitRate', () => {
  it('should return 0 when totalRequests is 0', () => {
    expect(calculateCacheHitRate(0, 0)).toBe(0);
    expect(calculateCacheHitRate(10, 0)).toBe(0);
  });

  it('should calculate correct percentage for whole numbers', () => {
    expect(calculateCacheHitRate(50, 100)).toBe(50);
    expect(calculateCacheHitRate(25, 100)).toBe(25);
    expect(calculateCacheHitRate(100, 100)).toBe(100);
  });

  it('should round to 2 decimal places', () => {
    expect(calculateCacheHitRate(1, 3)).toBe(33.33);
    expect(calculateCacheHitRate(2, 3)).toBe(66.67);
    expect(calculateCacheHitRate(1, 7)).toBe(14.29);
  });

  it('should handle edge cases correctly', () => {
    expect(calculateCacheHitRate(0, 100)).toBe(0);
    expect(calculateCacheHitRate(1, 1)).toBe(100);
    expect(calculateCacheHitRate(999, 1000)).toBe(99.9);
  });

  it('should match old calculation for known values', () => {
    // Old: Math.round((cacheHits / totalRequests) * 10000) / 100
    const testCases = [
      [50, 100],
      [33, 100],
      [1, 3],
      [2, 3],
      [123, 456],
    ];

    testCases.forEach(([hits, total]) => {
      const oldResult = Math.round((hits / total) * 10000) / 100;
      const newResult = calculateCacheHitRate(hits, total);
      expect(newResult).toBe(oldResult);
    });
  });
});
