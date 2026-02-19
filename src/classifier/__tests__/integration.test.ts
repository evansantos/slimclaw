/**
 * Integration tests for the complete classification pipeline
 */

import { describe, expect, test } from 'vitest';
import { classifyComplexity } from '../index.js';
import type { Message } from '../classify.js';

describe('Classification Integration Tests', () => {
  
  test('Real-world scenario: Simple chat interaction', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hey there!' },
      { role: 'assistant', content: 'Hello! How can I help you today?' },
      { role: 'user', content: 'Thanks, just wanted to say hi' }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toBe('simple');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.signals.some(s => s.includes('hello') || s.includes('thanks'))).toBe(true);
  });

  test('Real-world scenario: Learning request', () => {
    const messages: Message[] = [
      { role: 'user', content: 'I\'m new to React. Can you explain what components are and how to create them? Maybe show me a simple example?' }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toBe('mid');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.reason).toContain('requests explanation');
    expect(result.signals.some(s => s.includes('explain'))).toBe(true);
  });

  test('Real-world scenario: Code debugging', () => {
    const messages: Message[] = [
      { 
        role: 'user', 
        content: `I'm getting this weird error in my Node.js application:

\`\`\`
TypeError: Cannot read property 'map' of undefined
  at UserController.getUsers (/app/controllers/user.js:15:32)
\`\`\`

The code looks like this:

\`\`\`javascript
async getUsers(req, res) {
  const users = await User.find();
  return users.map(user => ({
    id: user.id,
    name: user.name
  }));
}
\`\`\`

Can you help me debug this issue? I think it might be related to the database connection or the async/await pattern.`
      }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toBe('complex');
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.signals).toContain('structural:code-blocks');
    expect(result.signals.some(s => s.includes('debug'))).toBe(true);
    expect(result.reason).toContain('complex technical task');
  });

  test('Real-world scenario: Architecture design', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: `I need to design a scalable microservices architecture for an e-commerce platform. Requirements:

- Handle 100k+ concurrent users
- Multiple payment providers (Stripe, PayPal, etc.)
- Real-time inventory management
- Event-driven communication between services
- GDPR compliance for EU users
- Multi-region deployment

I'm thinking about using:
- Kubernetes for orchestration
- Redis for caching
- RabbitMQ for message queuing
- PostgreSQL for transactional data
- MongoDB for product catalog

What patterns should I implement for service discovery, load balancing, and fault tolerance? How should I handle distributed transactions and ensure data consistency across services?`
      }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toBe('complex');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.signals.some(s => s.includes('architecture'))).toBe(true);
    expect(result.signals.some(s => s.includes('architecture') || s.includes('scalability'))).toBe(true);
    expect(result.reason).toContain('architectural discussion detected');
  });

  test('Real-world scenario: Mathematical proof', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: `I need to prove that √2 is irrational using proof by contradiction. Here's what I'm thinking:

1. Assume √2 is rational, so √2 = a/b where a, b are integers with no common factors
2. Then 2 = a²/b², so 2b² = a²
3. This means a² is even, therefore a is even
4. Since a is even, we can write a = 2k for some integer k
5. Substituting: 2b² = (2k)² = 4k²
6. So b² = 2k², meaning b² is even, therefore b is even

But if both a and b are even, they share a common factor of 2, contradicting our assumption that they have no common factors.

Is this reasoning sound? Can you help me make sure each logical step is valid and help me present this more rigorously?`
      }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toBe('reasoning');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.signals.some(s => s.includes('prove'))).toBe(true);
    expect(result.signals.some(s => s.includes('theorem') || s.includes('mathematical') || s.includes('proof'))).toBe(true);
    expect(result.reason).toContain('deep reasoning');
  });

  test('Real-world scenario: Ethical dilemma', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: `I'm facing an ethical dilemma in my role as a data scientist. My company wants me to build a predictive model that would help optimize hiring decisions by analyzing candidate resumes and social media profiles.

The model performs well in terms of accuracy, but I've discovered it shows bias against certain demographic groups. When I raised this concern, management said the bias reflects "real-world patterns" and that we should deploy it anyway since it improves hiring efficiency.

I'm torn between:
1. My professional obligation to deliver results that benefit the company
2. My ethical responsibility to avoid perpetuating discrimination
3. The potential positive impact of more efficient hiring
4. The harm this could cause to underrepresented groups

What ethical framework should I use to analyze this situation? How do I weigh competing moral principles? Are there compromise solutions that could address both business needs and ethical concerns?`
      }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toBe('reasoning');
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.signals.some(s => s.includes('ethical'))).toBe(true);
    expect(result.reason).toContain('deep reasoning');
  });

  test('Real-world scenario: Tool-heavy workflow', () => {
    const messages: Message[] = [
      { role: 'user', content: 'I need to analyze the performance metrics of our web application' },
      { role: 'assistant', content: 'I\'ll help you gather and analyze the performance data.' },
      { 
        role: 'user', 
        content: 'First, get the latest performance data from our monitoring dashboard',
        tool_calls: [{ id: '1', type: 'function', function: { name: 'fetch_metrics' } }]
      },
      { role: 'tool', content: 'Performance metrics retrieved: latency, throughput, error rates...' },
      {
        role: 'user', 
        content: 'Now create a visualization showing trends over the past month',
        tool_calls: [{ id: '2', type: 'function', function: { name: 'create_chart' } }]
      },
      { role: 'tool', content: 'Chart created showing performance trends...' },
      { 
        role: 'user', 
        content: 'Analyze the data to identify bottlenecks and recommend optimizations',
        tool_calls: [{ id: '3', type: 'function', function: { name: 'analyze_performance' } }]
      }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toMatch(/^(complex|reasoning)$/);
    expect(result.signals).toContain('structural:tool-calls');
    expect(result.signals.some(s => s.includes('tool usage') || s.includes('tool-calls'))).toBe(true);
  });

  test('Real-world scenario: Escalating complexity', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello! How can I help?' },
      { role: 'user', content: 'I have a question about JavaScript' },
      { role: 'assistant', content: 'Sure, what would you like to know?' },
      {
        role: 'user',
        content: `Actually, it's quite complex. I'm building a real-time collaborative editing application similar to Google Docs, and I'm struggling with conflict resolution in the operational transform algorithm. 

The issue is that when multiple users are editing simultaneously, I'm getting inconsistent states across clients. I've implemented basic OT with insert/delete operations, but I think I need to handle more complex scenarios like:

1. Concurrent insertions at the same position
2. Deletions that overlap with other operations
3. Undo/redo functionality that interacts with remote operations
4. Maintaining cursor positions across transformations

I've read about using tombstones and vector clocks, but I'm not sure how to implement them correctly in this context. The mathematical foundation of OT is quite complex and I want to make sure I understand the theory before implementing.

Can you help me understand the formal properties that need to be maintained (like TP1 and TP2) and how to prove that my implementation preserves them?`
      }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toMatch(/^(complex|reasoning)$/);
    expect(result.confidence).toBeGreaterThan(0.6);
    // Should detect the escalating pattern
    expect(result.signals.some(s => 
      s.includes('algorithm') || 
      s.includes('concurrent') || 
      s.includes('conflict') ||
      s.includes('transform') ||
      s.includes('complex') ||
      s.includes('implement')
    )).toBe(true);
  });

  test('Edge case: Mixed content with images and code', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'I need help debugging this architecture diagram and the corresponding code implementation:' },
          { type: 'image', url: 'architecture-diagram.png' },
          { 
            type: 'text', 
            text: `\`\`\`python
class ServiceMesh:
    def __init__(self):
        self.services = {}
        self.load_balancer = LoadBalancer()
    
    def register_service(self, name, instances):
        self.services[name] = instances
\`\`\``
          }
        ]
      }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toBe('complex');
    expect(result.signals).toContain('structural:code-blocks');
    expect(result.signals.some(s => s.includes('debug'))).toBe(true);
    expect(result.signals.some(s => s.includes('architecture'))).toBe(true);
  });

  test('Performance: Classification should complete quickly', () => {
    const longMessage = `${'This is a performance test message. '.repeat(200)}
    Debug this complex architecture issue with multiple microservices and optimize performance.
    \`\`\`javascript
    function complexFunction() {
      // Complex code here
      return result;
    }
    \`\`\``;
    
    const messages: Message[] = [
      { role: 'user', content: longMessage }
    ];
    
    const startTime = Date.now();
    const result = classifyComplexity(messages);
    const endTime = Date.now();
    
    expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
    expect(result.tier).toBe('complex');
    expect(result.confidence).toBeGreaterThan(0);
  });

  test('Robustness: Handles malformed messages gracefully', () => {
    const messages: Message[] = [
      { role: 'user', content: null as any },
      { role: 'user', content: undefined as any },
      { role: 'user', content: '' },
      { role: 'user', content: [] },
      { role: 'user', content: [{ type: 'unknown', data: 'test' }] as any }
    ];
    
    const result = classifyComplexity(messages);
    
    expect(result.tier).toBeDefined();
    expect(['simple', 'mid', 'complex', 'reasoning']).toContain(result.tier);
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test('Consistency: Same input produces same output', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Help me debug this architecture issue with microservices optimization' }
    ];
    
    const result1 = classifyComplexity(messages);
    const result2 = classifyComplexity(messages);
    const result3 = classifyComplexity(messages);
    
    expect(result1.tier).toBe(result2.tier);
    expect(result2.tier).toBe(result3.tier);
    expect(result1.confidence).toBeCloseTo(result2.confidence, 3);
    expect(result2.confidence).toBeCloseTo(result3.confidence, 3);
  });
});