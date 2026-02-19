/**
 * Task 8: Performance Testing
 * 
 * Comprehensive performance benchmarks:
 * - Latency benchmarks (<50ms target)
 * - Stress tests with 500+ message conversations
 * - Memory profiling (no leaks)
 * - Throughput testing (requests/second)
 * - Performance regression detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { inferenceOptimizer, createOptimizationContext } from '../../middleware/optimizer.js';
import { windowConversation } from '../../windowing/windower.js';
import { injectCacheBreakpoints } from '../../cache/breakpoints.js';
import { estimateTokens } from '../../windowing/token-counter.js';
import type { Message } from '../../middleware/optimizer.js';
import type { SlimClawConfig } from '../../config.js';

// Performance test configuration
const PERFORMANCE_CONFIG: SlimClawConfig = {
  enabled: true,
  mode: 'active',
  windowing: {
    enabled: true,
    maxMessages: 15,
    maxTokens: 4000,
    summarizeThreshold: 10,
  },
  caching: {
    enabled: true,
    injectBreakpoints: true,
    minContentLength: 800,
  },
  metrics: {
    enabled: true,
  },
};

// Performance metrics collection
interface PerformanceMetrics {
  latency: number[];
  memoryUsage: number[];
  throughput: number;
  memoryLeaks: boolean;
}

let performanceMetrics: PerformanceMetrics;

describe('SlimClaw Performance Benchmarks', () => {
  beforeEach(() => {
    performanceMetrics = {
      latency: [],
      memoryUsage: [],
      throughput: 0,
      memoryLeaks: false,
    };
  });

  afterEach(() => {
    // Force garbage collection if available (for testing)
    if (global.gc) {
      global.gc();
    }
  });

  // Helper functions
  function generatePerformanceTestMessages(count: number, includeVariety: boolean = true): Message[] {
    const messages: Message[] = [
      { 
        role: 'system', 
        content: 'You are a performance-optimized AI assistant handling high-throughput requests with minimal latency.' 
      }
    ];

    const messageVariants = {
      short: [
        'Quick question about React.',
        'How do I optimize this?',
        'What\'s the best approach?',
        'Can you help with this error?',
        'Simple coding question.',
      ],
      medium: [
        'I\'m working on a React application and running into performance issues with state updates. Can you help me identify the bottlenecks?',
        'My Node.js API is experiencing high latency under load. What are the most effective optimization strategies I should implement?',
        'I need to optimize my database queries for better performance. The current queries are taking too long to execute.',
        'Can you review this TypeScript code for performance improvements and potential memory leaks?',
        'I\'m deploying to Kubernetes and need help with resource allocation and scaling strategies.',
      ],
      long: [
        `I'm experiencing severe performance issues with my React application. Here's the component causing problems:

\`\`\`typescript
const UserDashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers().then(data => {
      setUsers(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const filtered = users.filter(user => 
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    const sorted = filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'email': return a.email.localeCompare(b.email);
        case 'date': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default: return 0;
      }
    });
    
    setFilteredUsers(sorted);
  }, [users, searchTerm, sortBy]);

  return (
    <div>
      <input 
        type="text"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        placeholder="Search users..."
      />
      <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
        <option value="name">Name</option>
        <option value="email">Email</option>
        <option value="date">Date</option>
      </select>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div>
          {filteredUsers.map(user => (
            <UserCard key={user.id} user={user} />
          ))}
        </div>
      )}
    </div>
  );
};
\`\`\`

The component re-renders excessively and causes the entire app to slow down. What optimizations should I implement?`,

        `I'm building a high-performance API with Node.js and PostgreSQL. Here's my current implementation:

\`\`\`typescript
// User service with caching and batch operations
class UserService {
  private cache = new Map<string, { data: User; expires: number }>();
  
  async getUsers(filters: UserFilters): Promise<User[]> {
    const cacheKey = JSON.stringify(filters);
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      return cached.data as any;
    }
    
    const query = this.buildQuery(filters);
    const users = await this.db.query(query.sql, query.params);
    
    // Cache for 5 minutes
    this.cache.set(cacheKey, {
      data: users,
      expires: Date.now() + 5 * 60 * 1000
    });
    
    return users;
  }
  
  async getUserById(id: string): Promise<User | null> {
    const cached = this.cache.get(\`user:\${id}\`);
    if (cached && cached.expires > Date.now()) {
      return cached.data as any;
    }
    
    const user = await this.db.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    
    if (user) {
      this.cache.set(\`user:\${id}\`, {
        data: user,
        expires: Date.now() + 10 * 60 * 1000
      });
    }
    
    return user;
  }
  
  private buildQuery(filters: UserFilters) {
    let sql = 'SELECT * FROM users WHERE 1=1';
    const params: any[] = [];
    
    if (filters.name) {
      params.push(\`%\${filters.name}%\`);
      sql += \` AND name ILIKE $\${params.length}\`;
    }
    
    if (filters.email) {
      params.push(\`%\${filters.email}%\`);
      sql += \` AND email ILIKE $\${params.length}\`;
    }
    
    if (filters.status) {
      params.push(filters.status);
      sql += \` AND status = $\${params.length}\`;
    }
    
    sql += ' ORDER BY created_at DESC LIMIT 100';
    
    return { sql, params };
  }
}
\`\`\`

The API is handling about 1000 requests/second but I need it to scale to 5000+ rps. What performance improvements should I implement?`,

        `I need help optimizing this complex database query that's causing performance issues:

\`\`\`sql
SELECT 
  u.id,
  u.name,
  u.email,
  u.created_at,
  COUNT(DISTINCT p.id) as post_count,
  COUNT(DISTINCT c.id) as comment_count,
  COUNT(DISTINCT l.id) as like_count,
  AVG(r.rating) as avg_rating,
  STRING_AGG(DISTINCT t.name, ', ') as tags
FROM users u
LEFT JOIN posts p ON u.id = p.user_id AND p.status = 'published'
LEFT JOIN comments c ON u.id = c.user_id AND c.status = 'approved'
LEFT JOIN likes l ON u.id = l.user_id
LEFT JOIN ratings r ON u.id = r.user_id
LEFT JOIN user_tags ut ON u.id = ut.user_id
LEFT JOIN tags t ON ut.tag_id = t.id
WHERE u.status = 'active'
  AND u.created_at >= NOW() - INTERVAL '1 year'
GROUP BY u.id, u.name, u.email, u.created_at
HAVING COUNT(DISTINCT p.id) > 5
ORDER BY post_count DESC, avg_rating DESC
LIMIT 50;
\`\`\`

This query takes 15+ seconds to execute with 100K users. The query plan shows multiple sequential scans and expensive sorting operations. What indexing strategy and query optimizations should I implement?`
      ]
    };

    for (let i = 1; i < count; i++) {
      const isUser = i % 2 === 1;
      let content: string;

      if (includeVariety) {
        // Mix of message lengths for realistic testing
        if (i < count * 0.3) {
          // 30% short messages
          content = messageVariants.short[i % messageVariants.short.length];
        } else if (i < count * 0.7) {
          // 40% medium messages  
          content = messageVariants.medium[i % messageVariants.medium.length];
        } else {
          // 30% long messages
          content = messageVariants.long[i % messageVariants.long.length];
        }
      } else {
        // Uniform length for consistent benchmarking
        content = messageVariants.medium[i % messageVariants.medium.length];
      }

      messages.push({
        role: isUser ? 'user' : 'assistant',
        content: content + ` (Message ${i})`
      });
    }

    return messages;
  }

  function measureLatency<T>(fn: () => T): { result: T; latency: number } {
    const start = process.hrtime.bigint();
    const result = fn();
    const end = process.hrtime.bigint();
    const latency = Number(end - start) / 1_000_000; // Convert to milliseconds
    return { result, latency };
  }

  async function measureAsyncLatency<T>(fn: () => Promise<T>): Promise<{ result: T; latency: number }> {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    const latency = Number(end - start) / 1_000_000; // Convert to milliseconds
    return { result, latency };
  }

  function getMemoryUsage(): number {
    const usage = process.memoryUsage();
    return usage.heapUsed / 1024 / 1024; // MB
  }

  function calculatePercentiles(values: number[]): { p50: number; p95: number; p99: number } {
    const sorted = [...values].sort((a, b) => a - b);
    const len = sorted.length;
    
    return {
      p50: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
    };
  }

  describe('Latency Benchmarks', () => {
    it('should process small conversations (<10 messages) within 10ms', async () => {
      const testSizes = [3, 5, 8];
      const latencies: number[] = [];

      for (const size of testSizes) {
        const messages = generatePerformanceTestMessages(size, false);
        const context = createOptimizationContext('perf-test', 'bench', 'latency');

        const { latency } = await measureAsyncLatency(() =>
          inferenceOptimizer(messages, PERFORMANCE_CONFIG, context)
        );

        latencies.push(latency);
        expect(latency).toBeLessThan(10); // Target: <10ms for small conversations
      }

      const avg = latencies.reduce((a, b) => a + b) / latencies.length;
      console.log(`Small conversation average latency: ${avg.toFixed(2)}ms`);
    });

    it('should process medium conversations (10-25 messages) within 25ms', async () => {
      const testSizes = [12, 18, 25];
      const latencies: number[] = [];

      for (const size of testSizes) {
        const messages = generatePerformanceTestMessages(size, true);
        const context = createOptimizationContext('perf-test', 'bench', 'latency');

        const { latency } = await measureAsyncLatency(() =>
          inferenceOptimizer(messages, PERFORMANCE_CONFIG, context)
        );

        latencies.push(latency);
        expect(latency).toBeLessThan(25); // Target: <25ms for medium conversations
      }

      const percentiles = calculatePercentiles(latencies);
      console.log(`Medium conversation latencies - p50: ${percentiles.p50.toFixed(2)}ms, p95: ${percentiles.p95.toFixed(2)}ms`);
    });

    it('should process large conversations (25-50 messages) within 50ms', async () => {
      const testSizes = [30, 40, 50];
      const latencies: number[] = [];

      for (const size of testSizes) {
        const messages = generatePerformanceTestMessages(size, true);
        const context = createOptimizationContext('perf-test', 'bench', 'latency');

        const { latency } = await measureAsyncLatency(() =>
          inferenceOptimizer(messages, PERFORMANCE_CONFIG, context)
        );

        latencies.push(latency);
        expect(latency).toBeLessThan(50); // Target: <50ms for large conversations
      }

      const percentiles = calculatePercentiles(latencies);
      console.log(`Large conversation latencies - p50: ${percentiles.p50.toFixed(2)}ms, p95: ${percentiles.p95.toFixed(2)}ms, p99: ${percentiles.p99.toFixed(2)}ms`);
    });

    it('should maintain consistent latency across multiple runs', async () => {
      const messages = generatePerformanceTestMessages(30, true);
      const context = createOptimizationContext('perf-test', 'bench', 'consistency');
      const latencies: number[] = [];

      // Run multiple iterations
      for (let i = 0; i < 20; i++) {
        const { latency } = await measureAsyncLatency(() =>
          inferenceOptimizer(messages, PERFORMANCE_CONFIG, context)
        );
        latencies.push(latency);
      }

      const percentiles = calculatePercentiles(latencies);
      const avg = latencies.reduce((a, b) => a + b) / latencies.length;
      const stdDev = Math.sqrt(latencies.reduce((sum, lat) => sum + Math.pow(lat - avg, 2), 0) / latencies.length);

      console.log(`Consistency test - avg: ${avg.toFixed(2)}ms, stddev: ${stdDev.toFixed(2)}ms, p99: ${percentiles.p99.toFixed(2)}ms`);

      // Verify consistency
      expect(stdDev).toBeLessThan(avg * 0.3); // Standard deviation should be <30% of average
      expect(percentiles.p99).toBeLessThan(avg * 2); // P99 should be <2x average
    });

    it('should benchmark individual component latencies', async () => {
      const messages = generatePerformanceTestMessages(40, true);
      const context = createOptimizationContext('perf-test', 'bench', 'components');

      // Benchmark windowing only
      const { latency: windowingLatency } = measureLatency(() =>
        windowConversation(messages, PERFORMANCE_CONFIG.windowing)
      );

      // Benchmark cache injection only
      const { latency: cacheLatency } = measureLatency(() =>
        injectCacheBreakpoints(messages as any, PERFORMANCE_CONFIG.caching)
      );

      // Benchmark token counting
      const { latency: tokenLatency } = measureLatency(() =>
        estimateTokens(messages)
      );

      // Benchmark full pipeline
      const { latency: fullLatency } = await measureAsyncLatency(() =>
        inferenceOptimizer(messages, PERFORMANCE_CONFIG, context)
      );

      console.log(`Component latencies - windowing: ${windowingLatency.toFixed(2)}ms, cache: ${cacheLatency.toFixed(2)}ms, tokens: ${tokenLatency.toFixed(2)}ms, full: ${fullLatency.toFixed(2)}ms`);

      // Individual components should be fast
      expect(windowingLatency).toBeLessThan(30);
      expect(cacheLatency).toBeLessThan(5);
      expect(tokenLatency).toBeLessThan(10);

      // Full pipeline should be sum of components + overhead
      expect(fullLatency).toBeLessThan(windowingLatency + cacheLatency + tokenLatency + 20);
    });
  });

  describe('Stress Testing', () => {
    it('should handle 500+ message conversations efficiently', async () => {
      const messageSizes = [500, 750, 1000];
      const results: Array<{ size: number; latency: number; savings: number }> = [];

      for (const size of messageSizes) {
        const messages = generatePerformanceTestMessages(size, true);
        const context = createOptimizationContext('stress-test', 'bench', `size-${size}`);

        const memoryBefore = getMemoryUsage();
        const { result, latency } = await measureAsyncLatency(() =>
          inferenceOptimizer(messages, PERFORMANCE_CONFIG, context)
        );
        const memoryAfter = getMemoryUsage();

        results.push({
          size,
          latency,
          savings: result.metrics.savings
        });

        console.log(`Stress test ${size} messages - latency: ${latency.toFixed(2)}ms, memory delta: ${(memoryAfter - memoryBefore).toFixed(2)}MB, savings: ${result.metrics.savings.toFixed(1)}%`);

        // Should handle large conversations
        expect(latency).toBeLessThan(500); // <500ms for very large conversations
        expect(result.metrics.savings).toBeGreaterThan(70); // Should achieve high savings
        expect(memoryAfter - memoryBefore).toBeLessThan(50); // <50MB memory increase
      }

      // Verify scaling characteristics
      const latencyGrowth = results[2].latency / results[0].latency; // 1000 vs 500 messages
      expect(latencyGrowth).toBeLessThan(3); // Should scale sub-linearly
    });

    it('should maintain performance under concurrent load', async () => {
      const messages = generatePerformanceTestMessages(100, true);
      const context = createOptimizationContext('concurrent-test', 'bench', 'concurrent');
      const concurrentRequests = 10;

      const memoryBefore = getMemoryUsage();
      const startTime = Date.now();

      // Run multiple requests concurrently
      const promises = Array(concurrentRequests).fill(0).map(async () => {
        const { result, latency } = await measureAsyncLatency(() =>
          inferenceOptimizer(messages, PERFORMANCE_CONFIG, context)
        );
        return { latency, savings: result.metrics.savings };
      });

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      const memoryAfter = getMemoryUsage();

      const latencies = results.map(r => r.latency);
      const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;
      const throughput = (concurrentRequests * 1000) / totalTime; // requests/second

      console.log(`Concurrent test - avg latency: ${avgLatency.toFixed(2)}ms, throughput: ${throughput.toFixed(1)} req/s, memory delta: ${(memoryAfter - memoryBefore).toFixed(2)}MB`);

      // Performance under load
      expect(avgLatency).toBeLessThan(100); // Should maintain reasonable latency
      expect(throughput).toBeGreaterThan(50); // Should achieve reasonable throughput
      expect(memoryAfter - memoryBefore).toBeLessThan(100); // Memory usage should be reasonable
    });

    it('should handle edge case stress scenarios', async () => {
      const edgeCases = [
        { name: 'Empty messages', messages: [] },
        { name: 'Single system message', messages: [{ role: 'system' as const, content: 'System prompt only' }] },
        { name: 'Very long single message', messages: [
          { role: 'system' as const, content: 'You are helpful.' },
          { role: 'user' as const, content: 'Long message: ' + 'x'.repeat(50000) }
        ]},
        { name: 'Many tiny messages', messages: Array(200).fill(0).map((_, i) => ({
          role: (i % 2 === 0 ? 'user' : 'assistant') as const,
          content: `Msg ${i}`
        }))},
      ];

      for (const testCase of edgeCases) {
        const context = createOptimizationContext('edge-case', 'bench', testCase.name);
        
        const { result, latency } = await measureAsyncLatency(() =>
          inferenceOptimizer(testCase.messages, PERFORMANCE_CONFIG, context)
        );

        console.log(`Edge case "${testCase.name}" - latency: ${latency.toFixed(2)}ms, input: ${testCase.messages.length} msgs, output: ${result.messages.length} msgs`);

        // Should handle edge cases gracefully
        expect(latency).toBeLessThan(100);
        expect(result.messages).toBeDefined();
        expect(result.metrics).toBeDefined();
      }
    });
  });

  describe('Memory Profiling', () => {
    it('should not have memory leaks during repeated operations', async () => {
      const messages = generatePerformanceTestMessages(50, true);
      const context = createOptimizationContext('memory-test', 'bench', 'leak-detection');
      const iterations = 100;
      const memoryReadings: number[] = [];

      // Baseline memory
      if (global.gc) global.gc();
      const baselineMemory = getMemoryUsage();
      memoryReadings.push(baselineMemory);

      // Run many iterations
      for (let i = 0; i < iterations; i++) {
        await inferenceOptimizer(messages, PERFORMANCE_CONFIG, context);
        
        // Take memory reading every 10 iterations
        if (i % 10 === 9) {
          if (global.gc) global.gc(); // Force GC
          memoryReadings.push(getMemoryUsage());
        }
      }

      const finalMemory = memoryReadings[memoryReadings.length - 1];
      const memoryGrowth = finalMemory - baselineMemory;
      const maxMemory = Math.max(...memoryReadings);

      console.log(`Memory leak test - baseline: ${baselineMemory.toFixed(2)}MB, final: ${finalMemory.toFixed(2)}MB, growth: ${memoryGrowth.toFixed(2)}MB, peak: ${maxMemory.toFixed(2)}MB`);

      // Should not have significant memory growth
      expect(memoryGrowth).toBeLessThan(10); // <10MB growth over 100 iterations
      expect(maxMemory - baselineMemory).toBeLessThan(50); // <50MB peak usage increase
    });

    it('should efficiently handle memory for large conversations', async () => {
      const messageSizes = [100, 300, 500];
      
      for (const size of messageSizes) {
        const messages = generatePerformanceTestMessages(size, true);
        const context = createOptimizationContext('memory-size', 'bench', `size-${size}`);

        if (global.gc) global.gc();
        const memoryBefore = getMemoryUsage();

        const result = await inferenceOptimizer(messages, PERFORMANCE_CONFIG, context);

        const memoryAfter = getMemoryUsage();
        const memoryDelta = memoryAfter - memoryBefore;

        // Calculate memory efficiency
        const inputSize = JSON.stringify(messages).length / 1024 / 1024; // MB
        const memoryEfficiency = memoryDelta / inputSize; // Memory overhead ratio

        console.log(`Memory efficiency ${size} messages - input: ${inputSize.toFixed(2)}MB, memory delta: ${memoryDelta.toFixed(2)}MB, efficiency ratio: ${memoryEfficiency.toFixed(2)}`);

        // Should be memory efficient
        expect(memoryDelta).toBeLessThan(100); // <100MB for processing
        expect(memoryEfficiency).toBeLessThan(5); // <5x memory overhead
        expect(result.metrics.savings).toBeGreaterThan(50); // Should provide significant savings
      }
    });

    it('should clean up memory after processing', async () => {
      const messages = generatePerformanceTestMessages(200, true);
      const context = createOptimizationContext('cleanup-test', 'bench', 'cleanup');

      if (global.gc) global.gc();
      const baselineMemory = getMemoryUsage();

      // Process many requests sequentially
      for (let i = 0; i < 20; i++) {
        await inferenceOptimizer(messages, PERFORMANCE_CONFIG, context);
      }

      if (global.gc) global.gc();
      const finalMemory = getMemoryUsage();
      const memoryRetention = finalMemory - baselineMemory;

      console.log(`Memory cleanup test - baseline: ${baselineMemory.toFixed(2)}MB, final: ${finalMemory.toFixed(2)}MB, retention: ${memoryRetention.toFixed(2)}MB`);

      // Should clean up properly
      expect(memoryRetention).toBeLessThan(20); // <20MB retained after processing
    });
  });

  describe('Throughput Testing', () => {
    it('should achieve target throughput for typical workloads', async () => {
      const messages = generatePerformanceTestMessages(30, true);
      const context = createOptimizationContext('throughput-test', 'bench', 'typical');
      const testDurationMs = 5000; // 5 second test
      const startTime = Date.now();
      let requestCount = 0;
      const latencies: number[] = [];

      // Run requests for specified duration
      while (Date.now() - startTime < testDurationMs) {
        const { latency } = await measureAsyncLatency(() =>
          inferenceOptimizer(messages, PERFORMANCE_CONFIG, context)
        );
        latencies.push(latency);
        requestCount++;
      }

      const actualDuration = Date.now() - startTime;
      const throughput = (requestCount * 1000) / actualDuration; // requests/second
      const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;

      console.log(`Throughput test - requests: ${requestCount}, duration: ${actualDuration}ms, throughput: ${throughput.toFixed(1)} req/s, avg latency: ${avgLatency.toFixed(2)}ms`);

      // Should achieve reasonable throughput
      expect(throughput).toBeGreaterThan(20); // Target: >20 req/s for 30-message conversations
      expect(avgLatency).toBeLessThan(50); // Should maintain low latency
    });

    it('should scale throughput with conversation size', async () => {
      const testCases = [
        { size: 10, targetThroughput: 100 },
        { size: 30, targetThroughput: 30 },
        { size: 50, targetThroughput: 15 },
      ];

      const results: Array<{ size: number; throughput: number; avgLatency: number }> = [];

      for (const testCase of testCases) {
        const messages = generatePerformanceTestMessages(testCase.size, false);
        const context = createOptimizationContext('throughput-scale', 'bench', `size-${testCase.size}`);
        const testDurationMs = 3000;
        const startTime = Date.now();
        let requestCount = 0;
        const latencies: number[] = [];

        while (Date.now() - startTime < testDurationMs) {
          const { latency } = await measureAsyncLatency(() =>
            inferenceOptimizer(messages, PERFORMANCE_CONFIG, context)
          );
          latencies.push(latency);
          requestCount++;
        }

        const throughput = (requestCount * 1000) / testDurationMs;
        const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;

        results.push({ size: testCase.size, throughput, avgLatency });

        console.log(`Throughput scaling ${testCase.size} msgs - throughput: ${throughput.toFixed(1)} req/s (target: ${testCase.targetThroughput}), latency: ${avgLatency.toFixed(2)}ms`);

        expect(throughput).toBeGreaterThan(testCase.targetThroughput * 0.7); // Allow 30% variance
      }

      // Verify inverse relationship between size and throughput
      expect(results[0].throughput).toBeGreaterThan(results[1].throughput);
      expect(results[1].throughput).toBeGreaterThan(results[2].throughput);
    });

    it('should maintain stable throughput under sustained load', async () => {
      const messages = generatePerformanceTestMessages(25, true);
      const context = createOptimizationContext('sustained-load', 'bench', 'sustained');
      const testDurationMs = 10000; // 10 second sustained test
      const measurementIntervalMs = 1000; // Measure every second
      
      const throughputReadings: number[] = [];
      const latencyReadings: number[] = [];
      let totalRequests = 0;
      
      const startTime = Date.now();
      let lastMeasurementTime = startTime;
      let requestsSinceLastMeasurement = 0;
      const intervalLatencies: number[] = [];

      while (Date.now() - startTime < testDurationMs) {
        const { latency } = await measureAsyncLatency(() =>
          inferenceOptimizer(messages, PERFORMANCE_CONFIG, context)
        );
        
        totalRequests++;
        requestsSinceLastMeasurement++;
        intervalLatencies.push(latency);
        
        const now = Date.now();
        if (now - lastMeasurementTime >= measurementIntervalMs) {
          const intervalThroughput = (requestsSinceLastMeasurement * 1000) / (now - lastMeasurementTime);
          const avgIntervalLatency = intervalLatencies.reduce((a, b) => a + b) / intervalLatencies.length;
          
          throughputReadings.push(intervalThroughput);
          latencyReadings.push(avgIntervalLatency);
          
          lastMeasurementTime = now;
          requestsSinceLastMeasurement = 0;
          intervalLatencies.length = 0;
        }
      }

      const avgThroughput = throughputReadings.reduce((a, b) => a + b) / throughputReadings.length;
      const throughputStdDev = Math.sqrt(throughputReadings.reduce((sum, t) => sum + Math.pow(t - avgThroughput, 2), 0) / throughputReadings.length);
      const avgLatency = latencyReadings.reduce((a, b) => a + b) / latencyReadings.length;

      console.log(`Sustained load test - avg throughput: ${avgThroughput.toFixed(1)} req/s, stddev: ${throughputStdDev.toFixed(1)}, avg latency: ${avgLatency.toFixed(2)}ms, total requests: ${totalRequests}`);

      // Should maintain stable performance
      expect(throughputStdDev / avgThroughput).toBeLessThan(0.2); // <20% throughput variation
      expect(avgThroughput).toBeGreaterThan(15); // Maintain reasonable throughput
      expect(avgLatency).toBeLessThan(60); // Maintain reasonable latency
    });
  });

  describe('Performance Regression Detection', () => {
    it('should establish performance baselines', async () => {
      const testCases = [
        { name: 'Small conversation', size: 10 },
        { name: 'Medium conversation', size: 25 },
        { name: 'Large conversation', size: 50 },
      ];

      const baselines: Record<string, { latency: number; throughput: number; memory: number }> = {};

      for (const testCase of testCases) {
        const messages = generatePerformanceTestMessages(testCase.size, true);
        const context = createOptimizationContext('baseline', 'bench', testCase.name);
        
        // Measure latency
        const iterations = 10;
        const latencies: number[] = [];
        for (let i = 0; i < iterations; i++) {
          const { latency } = await measureAsyncLatency(() =>
            inferenceOptimizer(messages, PERFORMANCE_CONFIG, context)
          );
          latencies.push(latency);
        }
        const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;

        // Measure throughput
        const throughputTestMs = 3000;
        const startTime = Date.now();
        let requestCount = 0;
        while (Date.now() - startTime < throughputTestMs) {
          await inferenceOptimizer(messages, PERFORMANCE_CONFIG, context);
          requestCount++;
        }
        const throughput = (requestCount * 1000) / throughputTestMs;

        // Measure memory
        if (global.gc) global.gc();
        const memoryBefore = getMemoryUsage();
        await inferenceOptimizer(messages, PERFORMANCE_CONFIG, context);
        const memoryAfter = getMemoryUsage();
        const memoryUsage = memoryAfter - memoryBefore;

        baselines[testCase.name] = {
          latency: avgLatency,
          throughput,
          memory: memoryUsage,
        };

        console.log(`Baseline ${testCase.name} - latency: ${avgLatency.toFixed(2)}ms, throughput: ${throughput.toFixed(1)} req/s, memory: ${memoryUsage.toFixed(2)}MB`);
      }

      // Store baselines for future comparison
      expect(baselines['Small conversation'].latency).toBeLessThan(15);
      expect(baselines['Medium conversation'].latency).toBeLessThan(35);
      expect(baselines['Large conversation'].latency).toBeLessThan(55);
    });

    it('should detect optimization effectiveness', async () => {
      const messages = generatePerformanceTestMessages(40, true);
      
      // Test with optimizations enabled
      const enabledContext = createOptimizationContext('optimization-test', 'enabled', 'test');
      const { result: optimizedResult, latency: optimizedLatency } = await measureAsyncLatency(() =>
        inferenceOptimizer(messages, PERFORMANCE_CONFIG, enabledContext)
      );

      // Test with optimizations disabled
      const disabledConfig: SlimClawConfig = {
        ...PERFORMANCE_CONFIG,
        windowing: { ...PERFORMANCE_CONFIG.windowing, enabled: false },
        caching: { ...PERFORMANCE_CONFIG.caching, enabled: false },
      };
      const disabledContext = createOptimizationContext('optimization-test', 'disabled', 'test');
      const { result: unoptimizedResult, latency: unoptimizedLatency } = await measureAsyncLatency(() =>
        inferenceOptimizer(messages, disabledConfig, disabledContext)
      );

      console.log(`Optimization effectiveness - optimized: ${optimizedResult.metrics.savings.toFixed(1)}% savings, ${optimizedLatency.toFixed(2)}ms latency`);
      console.log(`Optimization effectiveness - unoptimized: ${unoptimizedResult.metrics.savings.toFixed(1)}% savings, ${unoptimizedLatency.toFixed(2)}ms latency`);

      // Verify optimization benefits
      expect(optimizedResult.metrics.savings).toBeGreaterThan(40);
      expect(unoptimizedResult.metrics.savings).toBe(0);
      expect(optimizedResult.messages.length).toBeLessThan(messages.length);
      expect(unoptimizedResult.messages.length).toBe(messages.length);
      
      // Latency may be slightly higher due to processing, but should provide significant token savings
      const tokensavedPerMs = optimizedResult.metrics.savings / optimizedLatency;
      expect(tokensavedPerMs).toBeGreaterThan(1); // Should save >1% tokens per ms of latency
    });
  });
});