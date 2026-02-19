/**
 * Full Pipeline Integration Tests
 * 
 * Tests the complete SlimClaw optimization pipeline:
 * - Windowing + Cache integration
 * - End-to-end optimization flow
 * - Real-world conversation scenarios
 * - Performance metrics validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { inferenceOptimizer, createOptimizationContext, generateDebugHeaders } from '../../middleware/optimizer.js';
import { estimateTokens } from '../../windowing/token-counter.js';
import type { Message, OptimizedResult } from '../../middleware/optimizer.js';
import type { SlimClawConfig } from '../../config.js';

describe('Full Pipeline Integration Tests', () => {
  let baseConfig: SlimClawConfig;
  let context: ReturnType<typeof createOptimizationContext>;

  beforeEach(() => {
    baseConfig = {
      enabled: true,
      mode: 'active',
      windowing: {
        enabled: true,
        maxMessages: 10,
        maxTokens: 4000,
        summarizeThreshold: 8,
      },
      caching: {
        enabled: true,
        injectBreakpoints: true,
        minContentLength: 1000,
      },
      metrics: {
        enabled: true,
      },
    };

    context = createOptimizationContext(
      'test-request-123',
      'test-agent',
      'test-session',
      { debugHeaders: true }
    );
  });

  function generateLongConversation(size: number, includeCode: boolean = false): Message[] {
    const messages: Message[] = [
      { 
        role: 'system', 
        content: 'You are a senior full-stack developer helping with React, TypeScript, and Node.js development. Provide detailed, practical solutions with code examples when appropriate.' 
      }
    ];

    const topics = [
      'React component optimization',
      'TypeScript type safety',
      'Node.js performance tuning',
      'Database query optimization',
      'API design patterns',
      'Testing strategies',
      'Deployment automation',
      'Error handling patterns',
      'Security best practices',
      'Code architecture'
    ];

    for (let i = 1; i < size; i++) {
      const isUser = i % 2 === 1;
      const topicIndex = Math.floor((i - 1) / 2) % topics.length;
      const topic = topics[topicIndex];

      if (isUser) {
        let content = `I need help with ${topic}. `;
        
        if (includeCode && i > 5 && i % 6 === 1) {
          // Add long code message every 6 messages
          content += `Here's my current implementation:

\`\`\`typescript
interface UserData {
  id: string;
  name: string;
  email: string;
  profile: UserProfile;
  preferences: UserPreferences;
}

interface UserProfile {
  avatar: string;
  bio: string;
  skills: string[];
  experience: number;
  location: string;
}

interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  privacy: {
    profileVisible: boolean;
    emailVisible: boolean;
    activityTracking: boolean;
  };
  language: string;
  timezone: string;
}

class UserManager {
  private users: Map<string, UserData> = new Map();
  private cache: Map<string, { data: UserData; expires: number }> = new Map();

  async getUser(id: string): Promise<UserData | null> {
    // Check cache first
    const cached = this.cache.get(id);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    // Fetch from database
    try {
      const user = await this.fetchUserFromDatabase(id);
      if (user) {
        // Cache for 5 minutes
        this.cache.set(id, {
          data: user,
          expires: Date.now() + 5 * 60 * 1000
        });
        this.users.set(id, user);
      }
      return user;
    } catch (error) {
      console.error('Failed to fetch user:', error);
      return null;
    }
  }

  async updateUser(id: string, updates: Partial<UserData>): Promise<boolean> {
    try {
      const existingUser = await this.getUser(id);
      if (!existingUser) return false;

      const updatedUser = { ...existingUser, ...updates };
      await this.saveUserToDatabase(updatedUser);
      
      // Update cache and local storage
      this.users.set(id, updatedUser);
      this.cache.set(id, {
        data: updatedUser,
        expires: Date.now() + 5 * 60 * 1000
      });
      
      return true;
    } catch (error) {
      console.error('Failed to update user:', error);
      return false;
    }
  }

  private async fetchUserFromDatabase(id: string): Promise<UserData | null> {
    // Simulate database call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          id,
          name: 'John Doe',
          email: 'john@example.com',
          profile: {
            avatar: '/avatars/default.png',
            bio: 'Software developer',
            skills: ['React', 'TypeScript', 'Node.js'],
            experience: 5,
            location: 'San Francisco, CA'
          },
          preferences: {
            theme: 'dark',
            notifications: { email: true, push: false, sms: false },
            privacy: { profileVisible: true, emailVisible: false, activityTracking: true },
            language: 'en',
            timezone: 'America/Los_Angeles'
          }
        });
      }, 100);
    });
  }

  private async saveUserToDatabase(user: UserData): Promise<void> {
    // Simulate database save
    return new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
}
\`\`\`

What are the potential issues with this code and how can I improve it?`;
        } else {
          content += `Can you provide specific guidance and examples? (Message ${i})`;
        }

        messages.push({ role: 'user', content });
      } else {
        let content = `Great question about ${topic}! `;
        
        if (includeCode && i > 6 && i % 6 === 2) {
          // Add long response with code examples
          content += `Here are several improvements you can make:

**1. Type Safety Improvements**
\`\`\`typescript
// Use branded types for better ID safety
type UserId = string & { readonly brand: unique symbol };
type Email = string & { readonly brand: unique symbol };

// Better error handling with Result type
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };
\`\`\`

**2. Performance Optimizations**
- Implement proper cache invalidation strategies
- Use connection pooling for database calls
- Add request deduplication for concurrent calls
- Consider using Redis for distributed caching

**3. Memory Management**
- Set maximum cache size limits
- Implement LRU eviction policy
- Add memory usage monitoring

**4. Error Handling**
\`\`\`typescript
class UserError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'UserError';
  }
}

// Usage
if (!user) {
  throw new UserError('User not found', 'USER_NOT_FOUND', 404);
}
\`\`\`

**5. Testing Considerations**
- Mock the database layer for unit tests
- Add integration tests for the full flow
- Test cache hit/miss scenarios
- Verify error propagation

This approach provides better maintainability, performance, and reliability.`;
        } else {
          content += `Here are the key points to consider:

1. **Architecture**: Focus on separation of concerns and clean interfaces
2. **Performance**: Consider caching, lazy loading, and efficient data structures  
3. **Maintainability**: Write self-documenting code with clear naming
4. **Testing**: Ensure good test coverage with unit and integration tests
5. **Error Handling**: Implement graceful error handling and recovery

Let me know if you need more specific guidance on any of these areas! (Response ${i/2})`;
        }

        messages.push({ role: 'assistant', content });
      }
    }

    return messages;
  }

  describe('Windowing + Cache Integration', () => {
    it('should apply both windowing and cache optimizations', async () => {
      const messages = generateLongConversation(25, true);
      const result = await inferenceOptimizer(messages, baseConfig, context);

      // Should apply windowing
      expect(result.metrics.windowingApplied).toBe(true);
      expect(result.metrics.trimmedMessages).toBeGreaterThan(0);

      // Should apply cache breakpoints
      expect(result.metrics.cacheInjected).toBe(true);
      expect(result.metrics.cacheBreakpointsInjected).toBeGreaterThan(0);

      // Should achieve significant token savings
      expect(result.metrics.savings).toBeGreaterThan(40);

      // Verify optimized messages have proper format
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages.length).toBeLessThan(messages.length);

      // System message should exist and have cache breakpoint
      const systemMessage = result.messages.find(m => m.role === 'system');
      expect(systemMessage).toBeTruthy();
      expect(systemMessage?.cache_control).toEqual({ type: 'ephemeral' });

      // Should contain context summary
      if (systemMessage?.content && typeof systemMessage.content === 'string') {
        expect(systemMessage.content).toContain('<context_summary>');
      }
    });

    it('should preserve important context through windowing while optimizing cache', async () => {
      const technicalConversation: Message[] = [
        { 
          role: 'system', 
          content: 'You are helping with a critical production issue in a React application deployed on AWS. The app uses TypeScript, GraphQL, and PostgreSQL.' 
        },
        { role: 'user', content: 'We\'re seeing 500 errors on our GraphQL endpoint. CPU usage is at 90%.' },
        { role: 'assistant', content: 'High CPU with GraphQL errors suggests a query performance issue. Let\'s investigate the database queries first.' },
        { role: 'user', content: 'Here are the slow queries from our PostgreSQL logs: SELECT * FROM users WHERE created_at > NOW() - INTERVAL \'1 day\' ORDER BY created_at DESC LIMIT 10000;' },
        { role: 'assistant', content: 'That query is scanning a large dataset without proper indexing. The LIMIT 10000 is also excessive.' },
        { role: 'user', content: `The query is generated by this GraphQL resolver:

\`\`\`typescript
const resolvers = {
  Query: {
    recentUsers: async (parent, args, context) => {
      const { limit = 10000, offset = 0 } = args;
      
      const users = await context.db.query(
        'SELECT * FROM users WHERE created_at > $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [new Date(Date.now() - 24 * 60 * 60 * 1000), limit, offset]
      );
      
      return users.map(user => ({
        ...user,
        posts: () => getUserPosts(user.id), // N+1 query problem!
        profile: () => getUserProfile(user.id), // Another N+1!
      }));
    }
  }
};

async function getUserPosts(userId) {
  return await db.query('SELECT * FROM posts WHERE user_id = $1', [userId]);
}

async function getUserProfile(userId) {
  return await db.query('SELECT * FROM profiles WHERE user_id = $1', [userId]);
}
\`\`\`

This resolver is called frequently by our frontend.` },
        { role: 'assistant', content: `I see multiple critical issues here that explain your performance problems:

**1. Massive Default Limit (10000)**
- Reduce default limit to 50-100 users max
- Add pagination instead of large offsets

**2. N+1 Query Problem** 
- Use DataLoader to batch related queries
- Implement proper field-level data loading

**3. Missing Database Indexes**
- Add index on \`users.created_at\`
- Consider composite indexes for common query patterns

**4. Over-fetching with SELECT ***
- Only select needed columns
- Use GraphQL field analysis to determine required fields

Here's the optimized solution:

\`\`\`typescript
// Add DataLoader for efficient batching
const userPostsLoader = new DataLoader(async (userIds) => {
  const posts = await db.query(
    'SELECT user_id, id, title, content FROM posts WHERE user_id = ANY($1)',
    [userIds]
  );
  return userIds.map(userId => 
    posts.filter(post => post.user_id === userId)
  );
});

const resolvers = {
  Query: {
    recentUsers: async (parent, args, context) => {
      const { limit = 50, offset = 0 } = args; // Reduced default
      
      // Only select needed fields
      const users = await context.db.query(
        'SELECT id, name, email, created_at FROM users WHERE created_at > $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [new Date(Date.now() - 24 * 60 * 60 * 1000), Math.min(limit, 100), offset]
      );
      
      return users;
    }
  },
  User: {
    posts: (user) => userPostsLoader.load(user.id),
    profile: (user) => userProfileLoader.load(user.id),
  }
};
\`\`\`

**Database Indexes Needed:**
\`\`\`sql
CREATE INDEX CONCURRENTLY idx_users_created_at ON users (created_at DESC);
CREATE INDEX CONCURRENTLY idx_posts_user_id ON posts (user_id);
CREATE INDEX CONCURRENTLY idx_profiles_user_id ON profiles (user_id);
\`\`\`

This should reduce your CPU usage significantly.` },
        { role: 'user', content: 'Great! We also need to handle the existing high load. Should we add rate limiting?' },
        { role: 'assistant', content: 'Absolutely! Rate limiting is crucial for production stability. Implement both API-level and user-level rate limiting.' },
        { role: 'user', content: 'What about caching strategies for GraphQL?' },
        { role: 'assistant', content: 'GraphQL caching requires a multi-layer approach: query-level caching, field-level caching, and CDN caching for static data.' },
        { role: 'user', content: 'One more question about monitoring.' },
      ];

      const result = await inferenceOptimizer(technicalConversation, {
        ...baseConfig,
        windowing: {
          enabled: true,
          maxMessages: 8,
          summarizeThreshold: 6,
        }
      }, context);

      // Verify windowing applied
      expect(result.metrics.windowingApplied).toBe(true);
      
      const systemMessage = result.messages[0];
      expect(systemMessage.role).toBe('system');
      
      const systemContent = typeof systemMessage.content === 'string' 
        ? systemMessage.content 
        : JSON.stringify(systemMessage.content);

      // Critical production context should be preserved
      expect(systemContent).toMatch(/production|critical|issue|React|AWS|TypeScript|GraphQL|PostgreSQL/i);
      expect(systemContent).toMatch(/500.*error|CPU.*90|performance/i);
      
      // Recent messages should contain monitoring question
      const lastMessage = result.messages[result.messages.length - 1];
      expect(lastMessage.content).toContain('monitoring');

      // Cache breakpoints should be applied
      expect(result.metrics.cacheInjected).toBe(true);
      expect(systemMessage.cache_control).toEqual({ type: 'ephemeral' });
    });

    it('should handle disable scenarios gracefully', async () => {
      const messages = generateLongConversation(20);
      
      // Test disabled windowing
      const windowingDisabledResult = await inferenceOptimizer(messages, {
        ...baseConfig,
        windowing: { ...baseConfig.windowing, enabled: false }
      }, context);

      expect(windowingDisabledResult.metrics.windowingApplied).toBe(false);
      expect(windowingDisabledResult.metrics.cacheInjected).toBe(true);
      expect(windowingDisabledResult.messages.length).toBe(messages.length);

      // Test disabled caching
      const cachingDisabledResult = await inferenceOptimizer(messages, {
        ...baseConfig,
        caching: { ...baseConfig.caching, enabled: false }
      }, context);

      expect(cachingDisabledResult.metrics.windowingApplied).toBe(true);
      expect(cachingDisabledResult.metrics.cacheInjected).toBe(false);
      expect(cachingDisabledResult.messages.every(m => !m.cache_control)).toBe(true);

      // Test both disabled
      const bothDisabledResult = await inferenceOptimizer(messages, {
        ...baseConfig,
        windowing: { ...baseConfig.windowing, enabled: false },
        caching: { ...baseConfig.caching, enabled: false }
      }, context);

      expect(bothDisabledResult.metrics.windowingApplied).toBe(false);
      expect(bothDisabledResult.metrics.cacheInjected).toBe(false);
      expect(bothDisabledResult.metrics.savings).toBe(0);
      expect(bothDisabledResult.messages).toEqual(messages);
    });
  });

  describe('Shadow Mode Testing', () => {
    it('should measure optimization potential without applying changes', async () => {
      const messages = generateLongConversation(30, true);
      const shadowConfig: SlimClawConfig = {
        ...baseConfig,
        mode: 'shadow' // Key difference
      };

      const result = await inferenceOptimizer(messages, shadowConfig, context);

      // Should calculate metrics but not modify messages
      expect(result.messages).toEqual(messages); // Original messages unchanged
      expect(result.metrics.originalTokens).toBeGreaterThan(0);
      expect(result.metrics.optimizedTokens).toBeLessThan(result.metrics.originalTokens);
      expect(result.metrics.savings).toBeGreaterThan(0);
      expect(result.metrics.windowingApplied).toBe(false); // Not actually applied
      expect(result.metrics.cacheInjected).toBe(false); // Not actually applied
    });

    it('should provide accurate shadow metrics for decision making', async () => {
      const testCases = [
        { size: 10, expectedMinSavings: 0 },   // Small conversation
        { size: 20, expectedMinSavings: 30 },  // Medium conversation
        { size: 40, expectedMinSavings: 50 },  // Large conversation
      ];

      for (const testCase of testCases) {
        const messages = generateLongConversation(testCase.size, true);
        
        const shadowResult = await inferenceOptimizer(messages, {
          ...baseConfig,
          mode: 'shadow'
        }, context);

        expect(shadowResult.messages).toEqual(messages);
        
        if (testCase.expectedMinSavings > 0) {
          expect(shadowResult.metrics.savings).toBeGreaterThanOrEqual(testCase.expectedMinSavings);
        }
      }
    });
  });

  describe('Debug Headers Generation', () => {
    it('should generate comprehensive debug headers', async () => {
      const messages = generateLongConversation(25);
      const result = await inferenceOptimizer(messages, baseConfig, context);
      const headers = generateDebugHeaders(result, baseConfig);

      // Verify all expected headers are present
      expect(headers['X-SlimClaw-Enabled']).toBe('true');
      expect(headers['X-SlimClaw-Mode']).toBe('active');
      expect(headers['X-SlimClaw-Original-Tokens']).toBe(result.metrics.originalTokens.toString());
      expect(headers['X-SlimClaw-Optimized-Tokens']).toBe(result.metrics.optimizedTokens.toString());
      expect(headers['X-SlimClaw-Tokens-Saved']).toBe((result.metrics.originalTokens - result.metrics.optimizedTokens).toString());
      expect(headers['X-SlimClaw-Savings-Percent']).toBe(result.metrics.savings.toFixed(1));
      expect(headers['X-SlimClaw-Windowing']).toBe(result.metrics.windowingApplied ? 'applied' : 'skipped');
      expect(headers['X-SlimClaw-Caching']).toBe(result.metrics.cacheInjected ? 'applied' : 'skipped');

      if (result.metrics.trimmedMessages !== undefined) {
        expect(headers['X-SlimClaw-Trimmed-Messages']).toBe(result.metrics.trimmedMessages.toString());
      }

      if (result.metrics.cacheBreakpointsInjected !== undefined) {
        expect(headers['X-SlimClaw-Cache-Breakpoints']).toBe(result.metrics.cacheBreakpointsInjected.toString());
      }
    });

    it('should handle disabled state in headers', async () => {
      const messages = generateLongConversation(10);
      const disabledConfig: SlimClawConfig = {
        ...baseConfig,
        enabled: false
      };

      const result = await inferenceOptimizer(messages, disabledConfig, context);
      const headers = generateDebugHeaders(result, disabledConfig);

      expect(headers['X-SlimClaw-Enabled']).toBe('false');
      expect(Object.keys(headers)).toEqual(['X-SlimClaw-Enabled', 'X-SlimClaw-Mode']);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle graceful fallback on optimization errors', async () => {
      // Create malformed messages to trigger errors
      const malformedMessages: Message[] = [
        { role: 'system', content: null as any }, // Invalid content
        { role: 'user' as any, content: 'Valid message' }
      ];

      const result = await inferenceOptimizer(malformedMessages as any, baseConfig, context);

      // Should fallback to original messages
      expect(result.messages).toEqual(malformedMessages);
      expect(result.metrics.savings).toBe(0);
      expect(result.metrics.windowingApplied).toBe(false);
      expect(result.metrics.cacheInjected).toBe(false);
    });

    it('should handle empty message arrays', async () => {
      const result = await inferenceOptimizer([], baseConfig, context);

      expect(result.messages).toEqual([]);
      expect(result.metrics.originalTokens).toBe(0);
      expect(result.metrics.optimizedTokens).toBe(0);
      expect(result.metrics.savings).toBe(0);
    });

    it('should respect bypass flags', async () => {
      const messages = generateLongConversation(20);
      const bypassContext = createOptimizationContext(
        'test-request',
        'test-agent',
        'test-session',
        { bypassOptimization: true }
      );

      const result = await inferenceOptimizer(messages, baseConfig, bypassContext);

      expect(result.messages).toEqual(messages);
      expect(result.metrics.savings).toBe(0);
      expect(result.metrics.windowingApplied).toBe(false);
      expect(result.metrics.cacheInjected).toBe(false);
    });
  });

  describe('Performance Validation', () => {
    it('should maintain reasonable processing speed', async () => {
      const messages = generateLongConversation(50, true);
      const startTime = Date.now();
      
      const result = await inferenceOptimizer(messages, baseConfig, context);
      
      const processingTime = Date.now() - startTime;
      
      // Should process within reasonable time (target: <100ms for 50 messages)
      expect(processingTime).toBeLessThan(200); // Allow some buffer for CI
      expect(result.metrics.savings).toBeGreaterThan(50);
    });

    it('should scale linearly with message count', async () => {
      const messageSizes = [10, 20, 40];
      const processingTimes: number[] = [];

      for (const size of messageSizes) {
        const messages = generateLongConversation(size);
        const startTime = Date.now();
        
        await inferenceOptimizer(messages, baseConfig, context);
        
        processingTimes.push(Date.now() - startTime);
      }

      // Processing time should not grow exponentially
      const timeRatio1 = processingTimes[1] / processingTimes[0];
      const timeRatio2 = processingTimes[2] / processingTimes[1];

      // Allow for some variance but should be roughly linear
      expect(timeRatio1).toBeLessThan(3); // 2x messages shouldn't take 3x+ time
      expect(timeRatio2).toBeLessThan(3); // 2x messages shouldn't take 3x+ time
    });
  });

  describe('Real-world Scenario Testing', () => {
    it('should optimize a realistic technical support conversation', async () => {
      const supportConversation: Message[] = [
        { 
          role: 'system', 
          content: 'You are a technical support engineer for a SaaS platform. Help users troubleshoot issues with deployment, scaling, and performance.' 
        },
        { role: 'user', content: 'My application deployment is failing with a "out of memory" error in Kubernetes.' },
        { role: 'assistant', content: 'Let me help you troubleshoot the memory issue. Can you share your deployment configuration?' },
        { role: 'user', content: `Here's my deployment.yaml:

\`\`\`yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  labels:
    app: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: my-app
        image: my-app:latest
        ports:
        - containerPort: 8080
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        resources:
          limits:
            cpu: "500m"
            memory: "256Mi"
          requests:
            cpu: "250m" 
            memory: "128Mi"
\`\`\`

The pods keep getting OOMKilled.` },
        { role: 'assistant', content: `I can see the issue. Your memory limits are too restrictive for a production Node.js application. Here's what's happening:

**Problem**: 256Mi memory limit is insufficient for most Node.js apps, especially in production with full optimization.

**Solution**:
1. **Increase memory limits** to at least 512Mi-1Gi for Node.js
2. **Add resource monitoring** to understand actual usage
3. **Optimize your application** for better memory efficiency

Here's the corrected deployment:

\`\`\`yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  labels:
    app: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: my-app
        image: my-app:latest
        ports:
        - containerPort: 8080
        env:
        - name: NODE_ENV
          value: "production"
        - name: NODE_OPTIONS
          value: "--max-old-space-size=768" # Set Node.js heap size
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        resources:
          limits:
            cpu: "1000m"
            memory: "1Gi"      # Increased
          requests:
            cpu: "500m"        # Increased
            memory: "512Mi"    # Increased
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
\`\`\`

Also add these monitoring tools to track resource usage.` },
        { role: 'user', content: 'Thanks! That fixed the OOM issue. Now I\'m seeing high CPU usage. The application is a React SSR app with Express backend.' },
        { role: 'assistant', content: 'High CPU in React SSR typically indicates rendering performance issues. Let\'s optimize both the server-side rendering and the Express setup.' },
        { role: 'user', content: 'What about horizontal pod autoscaling? Should I set that up?' },
        { role: 'assistant', content: 'Absolutely! HPA is perfect for handling variable load in React SSR applications. Here\'s how to set it up properly.' },
        { role: 'user', content: 'One last question about logging and observability.' },
      ];

      const result = await inferenceOptimizer(supportConversation, baseConfig, context);

      // Should optimize effectively
      expect(result.metrics.windowingApplied).toBe(true);
      expect(result.metrics.cacheInjected).toBe(true);
      expect(result.metrics.savings).toBeGreaterThan(25);

      // Should preserve technical context
      const systemMessage = result.messages[0];
      const systemContent = typeof systemMessage.content === 'string' 
        ? systemMessage.content 
        : JSON.stringify(systemMessage.content);

      expect(systemContent).toMatch(/technical support|SaaS|deployment|Kubernetes|memory.*error/i);
      
      // Recent conversation should be about logging
      const lastMessage = result.messages[result.messages.length - 1];
      expect(lastMessage.content).toContain('logging');
    });

    it('should handle code review scenarios with large diffs', async () => {
      const codeReviewConversation = generateLongConversation(35, true);
      const result = await inferenceOptimizer(codeReviewConversation, baseConfig, context);

      expect(result.metrics.savings).toBeGreaterThan(50);
      expect(result.metrics.windowingApplied).toBe(true);
      expect(result.metrics.cacheInjected).toBe(true);

      // Should have cached several code blocks
      expect(result.metrics.cacheBreakpointsInjected).toBeGreaterThan(5);

      // Verify code context is preserved
      const hasCodeContext = result.messages.some(msg => {
        const content = typeof msg.content === 'string' 
          ? msg.content 
          : JSON.stringify(msg.content);
        return content.includes('```') || content.includes('typescript') || content.includes('React');
      });
      expect(hasCodeContext).toBe(true);
    });
  });
});