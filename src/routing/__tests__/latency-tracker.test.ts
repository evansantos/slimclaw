import { describe, test, expect, beforeEach } from 'vitest';
import { 
  LatencyTracker,
  type LatencyTrackerConfig 
} from '../latency-tracker.js';

describe('LatencyTracker', () => {
  let tracker: LatencyTracker;
  let config: LatencyTrackerConfig;

  beforeEach(() => {
    config = {
      enabled: true,
      windowSize: 50,
      outlierThresholdMs: 60000
    };
    tracker = new LatencyTracker(config);
  });

  describe('constructor', () => {
    test('should initialize with empty tracking', () => {
      const stats = tracker.getLatencyStats('openai/gpt-4.1-nano');
      expect(stats).toBeNull();
    });

    test('should accept custom configuration', () => {
      const customConfig = {
        enabled: true,
        windowSize: 25,
        outlierThresholdMs: 30000
      };
      const customTracker = new LatencyTracker(customConfig);
      expect(customTracker).toBeDefined();
    });
  });

  describe('recordLatency', () => {
    test('should record single latency measurement', () => {
      tracker.recordLatency('openai/gpt-4.1-nano', 2500, 100);
      
      const stats = tracker.getLatencyStats('openai/gpt-4.1-nano');
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(1);
      expect(stats!.avg).toBe(2500);
      expect(stats!.p50).toBe(2500);
      expect(stats!.p95).toBe(2500);
      expect(stats!.tokensPerSecond).toBeCloseTo(40.0, 1); // 100 tokens / 2.5 seconds
    });

    test('should record multiple latency measurements', () => {
      const latencies = [1000, 2000, 3000, 4000, 5000];
      const tokens = [50, 100, 150, 200, 250];
      
      for (let i = 0; i < latencies.length; i++) {
        tracker.recordLatency('openai/gpt-4.1-nano', latencies[i], tokens[i]);
      }
      
      const stats = tracker.getLatencyStats('openai/gpt-4.1-nano');
      expect(stats!.count).toBe(5);
      expect(stats!.avg).toBe(3000); // Average of 1000-5000
      expect(stats!.p50).toBe(3000); // Median
      expect(stats!.p95).toBe(5000); // 95th percentile
      expect(stats!.tokensPerSecond).toBeGreaterThan(0);
    });

    test('should filter out outliers beyond threshold', () => {
      // Normal latencies
      tracker.recordLatency('openai/gpt-4.1-nano', 1000, 100);
      tracker.recordLatency('openai/gpt-4.1-nano', 2000, 100);
      
      // Outlier (beyond 60s threshold)
      tracker.recordLatency('openai/gpt-4.1-nano', 70000, 100);
      
      const stats = tracker.getLatencyStats('openai/gpt-4.1-nano');
      expect(stats!.count).toBe(2); // Outlier excluded
      expect(stats!.avg).toBe(1500); // Average of 1000, 2000
    });

    test('should maintain circular buffer with window size limit', () => {
      const windowSize = 3;
      const smallTracker = new LatencyTracker({
        enabled: true,
        windowSize,
        outlierThresholdMs: 60000
      });

      // Add more samples than window size
      for (let i = 1; i <= 5; i++) {
        smallTracker.recordLatency('test-model', i * 1000, 100);
      }
      
      const stats = smallTracker.getLatencyStats('test-model');
      expect(stats!.count).toBe(windowSize); // Only keeps last 3
      expect(stats!.avg).toBe(4000); // Average of 3000, 4000, 5000
    });

    test('should track multiple models independently', () => {
      tracker.recordLatency('openai/gpt-4.1-nano', 1000, 100);
      tracker.recordLatency('anthropic/claude-sonnet-4', 2000, 150);
      tracker.recordLatency('google/gemini-2.5-flash', 1500, 120);
      
      const stats1 = tracker.getLatencyStats('openai/gpt-4.1-nano');
      const stats2 = tracker.getLatencyStats('anthropic/claude-sonnet-4');
      const stats3 = tracker.getLatencyStats('google/gemini-2.5-flash');
      
      expect(stats1!.avg).toBe(1000);
      expect(stats2!.avg).toBe(2000);
      expect(stats3!.avg).toBe(1500);
      
      expect(stats1!.tokensPerSecond).toBeCloseTo(100.0, 1);
      expect(stats2!.tokensPerSecond).toBeCloseTo(75.0, 1);
      expect(stats3!.tokensPerSecond).toBeCloseTo(80.0, 1);
    });

    test('should handle zero output tokens gracefully', () => {
      tracker.recordLatency('openai/gpt-4.1-nano', 2000, 0);
      
      const stats = tracker.getLatencyStats('openai/gpt-4.1-nano');
      expect(stats!.count).toBe(1);
      expect(stats!.tokensPerSecond).toBe(0);
    });

    test('should ignore records when disabled', () => {
      const disabledTracker = new LatencyTracker({
        enabled: false,
        windowSize: 50,
        outlierThresholdMs: 60000
      });

      disabledTracker.recordLatency('test-model', 1000, 100);
      
      const stats = disabledTracker.getLatencyStats('test-model');
      expect(stats).toBeNull();
    });
  });

  describe('getLatencyStats', () => {
    test('should return null for unknown models', () => {
      const stats = tracker.getLatencyStats('unknown/model');
      expect(stats).toBeNull();
    });

    test('should calculate percentiles correctly', () => {
      // Add sorted data for predictable percentiles
      const latencies = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      
      for (let i = 0; i < latencies.length; i++) {
        tracker.recordLatency('test-model', latencies[i], 100);
      }
      
      const stats = tracker.getLatencyStats('test-model');
      expect(stats!.p50).toBe(500); // Median (5th element in 0-indexed array)
      expect(stats!.p95).toBe(950); // 95th percentile
      expect(stats!.avg).toBe(550); // Arithmetic mean
    });

    test('should calculate tokens per second accurately', () => {
      // 2000ms latency, 100 tokens = 50 tokens/second
      tracker.recordLatency('test-model', 2000, 100);
      // 1000ms latency, 200 tokens = 200 tokens/second  
      tracker.recordLatency('test-model', 1000, 200);
      
      const stats = tracker.getLatencyStats('test-model');
      // Average: (50 + 200) / 2 = 125 tokens/second
      expect(stats!.tokensPerSecond).toBeCloseTo(125.0, 1);
    });

    test('should handle single sample edge case', () => {
      tracker.recordLatency('test-model', 1500, 75);
      
      const stats = tracker.getLatencyStats('test-model');
      expect(stats!.count).toBe(1);
      expect(stats!.p50).toBe(1500);
      expect(stats!.p95).toBe(1500);
      expect(stats!.avg).toBe(1500);
      expect(stats!.tokensPerSecond).toBeCloseTo(50.0, 1);
    });
  });

  describe('getAllLatencyStats', () => {
    test('should return empty map when no models tracked', () => {
      const allStats = tracker.getAllLatencyStats();
      expect(allStats.size).toBe(0);
    });

    test('should return stats for all tracked models', () => {
      tracker.recordLatency('model1', 1000, 100);
      tracker.recordLatency('model2', 2000, 200);
      tracker.recordLatency('model3', 1500, 150);
      
      const allStats = tracker.getAllLatencyStats();
      expect(allStats.size).toBe(3);
      expect(allStats.has('model1')).toBe(true);
      expect(allStats.has('model2')).toBe(true);
      expect(allStats.has('model3')).toBe(true);
      
      expect(allStats.get('model1')?.avg).toBe(1000);
      expect(allStats.get('model2')?.avg).toBe(2000);
      expect(allStats.get('model3')?.avg).toBe(1500);
    });
  });

  describe('resetLatency', () => {
    beforeEach(() => {
      tracker.recordLatency('model1', 1000, 100);
      tracker.recordLatency('model2', 2000, 200);
      tracker.recordLatency('model3', 1500, 150);
    });

    test('should reset specific model when modelId provided', () => {
      tracker.resetLatency('model1');
      
      expect(tracker.getLatencyStats('model1')).toBeNull();
      expect(tracker.getLatencyStats('model2')).not.toBeNull();
      expect(tracker.getLatencyStats('model3')).not.toBeNull();
    });

    test('should reset all models when no modelId provided', () => {
      tracker.resetLatency();
      
      expect(tracker.getLatencyStats('model1')).toBeNull();
      expect(tracker.getLatencyStats('model2')).toBeNull();
      expect(tracker.getLatencyStats('model3')).toBeNull();
      expect(tracker.getAllLatencyStats().size).toBe(0);
    });

    test('should handle resetting non-existent model gracefully', () => {
      tracker.resetLatency('nonexistent');
      
      // Other models should remain
      expect(tracker.getLatencyStats('model1')).not.toBeNull();
      expect(tracker.getLatencyStats('model2')).not.toBeNull();
      expect(tracker.getLatencyStats('model3')).not.toBeNull();
    });
  });

  describe('edge cases', () => {
    test('should handle negative latency gracefully', () => {
      tracker.recordLatency('test-model', -100, 50);
      
      // Should ignore negative latency
      const stats = tracker.getLatencyStats('test-model');
      expect(stats).toBeNull();
    });

    test('should handle very large latencies', () => {
      tracker.recordLatency('test-model', 300000, 100); // 5 minutes
      
      // Should be filtered as outlier
      const stats = tracker.getLatencyStats('test-model');
      expect(stats).toBeNull();
    });

    test('should handle zero latency edge case', () => {
      tracker.recordLatency('test-model', 0, 100);
      
      const stats = tracker.getLatencyStats('test-model');
      expect(stats!.count).toBe(1);
      expect(stats!.avg).toBe(0);
      expect(stats!.tokensPerSecond).toBe(Infinity);
    });
  });
});