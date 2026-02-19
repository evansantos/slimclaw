/**
 * Task 7: Integration Tests - Cache
 * 
 * Tests cache breakpoint injection scenarios:
 * - Cache breakpoints in system prompts
 * - Cache breakpoints in long messages (>1000 chars)
 * - Penultimate message caching (conversation pivot)
 * - Correct format for Anthropic API compliance
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  injectCacheBreakpoints, 
  injectCacheBreakpointsSimple,
  createMessage,
  DEFAULT_CACHE_CONFIG,
  type CacheableMessage,
  type CacheInjectionConfig,
  type CacheInjectionResult 
} from '../../cache/breakpoints.js';

// Helper function available throughout the test file
function createLongMessage(role: string, baseText: string, targetLength: number = 1200): CacheableMessage {
  const repeatedText = baseText.repeat(Math.ceil(targetLength / baseText.length));
  return createMessage(role, repeatedText.substring(0, targetLength));
}

describe('Cache Integration Tests', () => {
  let baseConfig: CacheInjectionConfig;

  beforeEach(() => {
    baseConfig = {
      enabled: true,
      minContentLength: 1000,
    };
  });

  describe('System Prompt Cache Breakpoints', () => {
    it('should always cache system prompts regardless of length', () => {
      const shortSystemPrompt = createMessage('system', 'You are helpful.');
      const longSystemPrompt = createMessage('system', 'You are a helpful assistant. '.repeat(100));

      // Test short system prompt
      const shortResult = injectCacheBreakpoints([shortSystemPrompt], baseConfig);
      expect(shortResult.messages[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(shortResult.stats.breakpointsInjected).toBe(1);

      // Test long system prompt
      const longResult = injectCacheBreakpoints([longSystemPrompt], baseConfig);
      expect(longResult.messages[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(longResult.stats.breakpointsInjected).toBe(1);
    });

    it('should cache system prompts with ContentBlock[] format', () => {
      const systemMessage: CacheableMessage = {
        role: 'system',
        content: [
          { type: 'text', text: 'You are a helpful AI assistant.' },
          { type: 'text', text: ' You should provide accurate information.' },
        ]
      };

      const result = injectCacheBreakpoints([systemMessage], baseConfig);
      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(result.stats.breakpointsInjected).toBe(1);
    });

    it('should not duplicate cache_control if already present', () => {
      const systemMessage = createMessage('system', 'You are helpful.', { type: 'ephemeral' });

      const result = injectCacheBreakpoints([systemMessage], baseConfig);
      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(result.stats.breakpointsInjected).toBe(0); // No new breakpoints
      expect(result.stats.eligibleMessages).toBe(1);
    });

    it('should cache complex system prompts with instructions', () => {
      const complexSystemPrompt = `You are Claude, an AI assistant created by Anthropic. You are helpful, harmless, and honest.

Guidelines for your responses:
1. Be helpful and try to answer questions accurately
2. Admit when you're not sure about something
3. Avoid harmful, biased, or inappropriate content
4. Be conversational but professional
5. Ask clarifying questions when needed

Current context: The user is asking about programming concepts and needs detailed technical explanations.

Your personality: Be encouraging, thorough in explanations, and provide practical examples when possible.`;

      const systemMessage = createMessage('system', complexSystemPrompt);
      const result = injectCacheBreakpoints([systemMessage], baseConfig);

      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(result.stats.breakpointsInjected).toBe(1);
      expect(result.stats.eligibleMessages).toBe(1);
    });
  });

  describe('Long Message Cache Breakpoints', () => {

    it('should cache user messages longer than threshold', () => {
      const longUserMessage = createLongMessage('user', 'This is a very detailed question about programming. ', 1200);
      const shortUserMessage = createMessage('user', 'Short question');

      const messages = [longUserMessage, shortUserMessage];
      const result = injectCacheBreakpoints(messages, baseConfig);

      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(result.messages[1].cache_control).toBeUndefined();
      expect(result.stats.breakpointsInjected).toBe(1);
      expect(result.stats.eligibleMessages).toBe(1);
    });

    it('should cache assistant messages longer than threshold', () => {
      const longAssistantMessage = createLongMessage('assistant', 'Here is a comprehensive explanation of the concept. ', 1500);
      const shortAssistantMessage = createMessage('assistant', 'Brief answer');

      const messages = [longAssistantMessage, shortAssistantMessage];
      const result = injectCacheBreakpoints(messages, baseConfig);

      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(result.messages[1].cache_control).toBeUndefined();
      expect(result.stats.breakpointsInjected).toBe(1);
    });

    it('should handle mixed content types in long messages', () => {
      const longMixedMessage: CacheableMessage = {
        role: 'user',
        content: [
          { type: 'text', text: 'This is a long text block. '.repeat(50) }, // ~1400 chars
          { type: 'image', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' },
          { type: 'text', text: 'And here is more text explaining the image.' }
        ]
      };

      const result = injectCacheBreakpoints([longMixedMessage], baseConfig);
      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(result.stats.breakpointsInjected).toBe(1);
    });

    it('should respect different content length thresholds', () => {
      const messages = [
        createLongMessage('user', 'Medium message ', 800),  // Below default threshold
        createLongMessage('user', 'Long message ', 1200),   // Above default threshold
        createLongMessage('user', 'Very long message ', 2000), // Well above threshold
      ];

      // Test default threshold (1000)
      const defaultResult = injectCacheBreakpoints(messages, baseConfig);
      expect(defaultResult.stats.breakpointsInjected).toBe(2); // Last two messages

      // Test lower threshold (500)
      const lowThresholdResult = injectCacheBreakpoints(messages, {
        enabled: true,
        minContentLength: 500,
      });
      expect(lowThresholdResult.stats.breakpointsInjected).toBe(3); // All messages

      // Test higher threshold (1500)
      const highThresholdResult = injectCacheBreakpoints(messages, {
        enabled: true,
        minContentLength: 1500,
      });
      expect(highThresholdResult.stats.breakpointsInjected).toBe(2); // System prompt + one long message over 1500 chars
    });

    it('should cache code blocks and technical content appropriately', () => {
      const codeMessage = createMessage('assistant', `
Here's a comprehensive React component example:

\`\`\`typescript
import React, { useState, useEffect, useCallback } from 'react';
import { fetchUserData, updateUserProfile } from '../api/users';

interface User {
  id: string;
  name: string;
  email: string;
  preferences: UserPreferences;
}

interface UserPreferences {
  theme: 'light' | 'dark';
  notifications: boolean;
  language: string;
}

const UserProfile: React.FC<{ userId: string }> = ({ userId }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        setLoading(true);
        const userData = await fetchUserData(userId);
        setUser(userData);
        setError(null);
      } catch (err) {
        setError('Failed to load user data');
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [userId]);

  const handleSave = useCallback(async (updatedUser: User) => {
    try {
      await updateUserProfile(updatedUser);
      setUser(updatedUser);
      setEditing(false);
    } catch (err) {
      setError('Failed to save user data');
    }
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!user) return <div>User not found</div>;

  return (
    <div className="user-profile">
      <h2>{user.name}</h2>
      <p>{user.email}</p>
      {editing ? (
        <EditForm user={user} onSave={handleSave} onCancel={() => setEditing(false)} />
      ) : (
        <ViewMode user={user} onEdit={() => setEditing(true)} />
      )}
    </div>
  );
};

export default UserProfile;
\`\`\`

This component demonstrates several React best practices:
1. Proper TypeScript typing for props and state
2. useEffect for data loading with cleanup
3. useCallback for performance optimization  
4. Error handling and loading states
5. Conditional rendering patterns
`.trim());

      const result = injectCacheBreakpoints([codeMessage], baseConfig);
      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(result.stats.breakpointsInjected).toBe(1);
    });
  });

  describe('Penultimate Message Caching', () => {
    it('should cache penultimate message in 3+ message conversations', () => {
      const messages = [
        createMessage('user', 'First message'),
        createMessage('assistant', 'Second message'),  // This should be cached (penultimate)
        createMessage('user', 'Third message'),
      ];

      const result = injectCacheBreakpoints(messages, baseConfig);
      
      expect(result.messages[0].cache_control).toBeUndefined(); // First
      expect(result.messages[1].cache_control).toEqual({ type: 'ephemeral' }); // Penultimate
      expect(result.messages[2].cache_control).toBeUndefined(); // Last
      expect(result.stats.breakpointsInjected).toBe(1);
    });

    it('should not cache penultimate message in conversations with <3 messages', () => {
      const twoMessages = [
        createMessage('user', 'First message'),
        createMessage('assistant', 'Second message'),
      ];

      const result = injectCacheBreakpoints(twoMessages, baseConfig);
      expect(result.messages.every(msg => !msg.cache_control)).toBe(true);
      expect(result.stats.breakpointsInjected).toBe(0);
    });

    it('should cache penultimate message in longer conversations', () => {
      const messages = [
        createMessage('system', 'System prompt'),
        createMessage('user', 'Message 1'),
        createMessage('assistant', 'Message 2'),
        createMessage('user', 'Message 3'),
        createMessage('assistant', 'Message 4'),
        createMessage('user', 'Message 5'),      // Penultimate
        createMessage('assistant', 'Message 6'), // Last
      ];

      const result = injectCacheBreakpoints(messages, baseConfig);
      
      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' }); // System prompt
      expect(result.messages[5].cache_control).toEqual({ type: 'ephemeral' }); // Penultimate
      expect(result.messages[6].cache_control).toBeUndefined(); // Last
      expect(result.stats.breakpointsInjected).toBe(2);
      expect(result.stats.eligibleMessages).toBe(2);
    });

    it('should handle penultimate caching with ContentBlock format', () => {
      const messages: CacheableMessage[] = [
        { role: 'user', content: 'First message' },
        { 
          role: 'assistant', 
          content: [
            { type: 'text', text: 'This is the penultimate message with content blocks.' }
          ]
        },
        { role: 'user', content: 'Last message' },
      ];

      const result = injectCacheBreakpoints(messages, baseConfig);
      expect(result.messages[1].cache_control).toEqual({ type: 'ephemeral' });
      expect(result.stats.breakpointsInjected).toBe(1);
    });
  });

  describe('Anthropic API Format Compliance', () => {
    it('should produce messages in correct Anthropic format', () => {
      const messages = [
        createMessage('system', 'You are helpful.'),
        createLongMessage('user', 'Long user message ', 1200),
        createMessage('assistant', 'Response'),
        createMessage('user', 'Follow-up'),
      ];

      const result = injectCacheBreakpoints(messages, baseConfig);

      result.messages.forEach(message => {
        // Verify required fields
        expect(message).toHaveProperty('role');
        expect(message).toHaveProperty('content');
        expect(['system', 'user', 'assistant', 'tool']).toContain(message.role);

        // Verify content format
        if (typeof message.content === 'string') {
          expect(typeof message.content).toBe('string');
        } else {
          expect(Array.isArray(message.content)).toBe(true);
          message.content.forEach(block => {
            expect(block).toHaveProperty('type');
            expect(typeof block.type).toBe('string');
          });
        }

        // Verify cache_control format when present
        if (message.cache_control) {
          expect(message.cache_control).toEqual({ type: 'ephemeral' });
        }
      });
    });

    it('should maintain message order and integrity', () => {
      const originalMessages = [
        createMessage('system', 'System prompt'),
        createMessage('user', 'User 1'),
        createMessage('assistant', 'Assistant 1'),
        createLongMessage('user', 'Long user message ', 1200),
        createMessage('assistant', 'Assistant 2'),
        createMessage('user', 'User 3'),
      ];

      const result = injectCacheBreakpoints(originalMessages, baseConfig);

      expect(result.messages).toHaveLength(originalMessages.length);
      
      result.messages.forEach((message, index) => {
        const original = originalMessages[index];
        expect(message.role).toBe(original.role);
        expect(message.content).toEqual(original.content);
        
        // Only cache_control should be added, nothing else modified
        const { cache_control, ...messageWithoutCache } = message;
        const { cache_control: _, ...originalWithoutCache } = original;
        expect(messageWithoutCache).toEqual(originalWithoutCache);
      });
    });

    it('should handle tool messages appropriately', () => {
      const messages: CacheableMessage[] = [
        createMessage('system', 'You can use tools.'),
        createMessage('user', 'Call a tool for me.'),
        {
          role: 'assistant',
          content: 'I\'ll call the calculator tool.',
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'calculator', arguments: '{"expression": "2+2"}' } }]
        },
        {
          role: 'tool',
          content: '4',
          tool_call_id: 'call_1'
        },
        createMessage('assistant', 'The result is 4.'),
      ];

      const result = injectCacheBreakpoints(messages, baseConfig);

      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' }); // System
      expect(result.messages[3].cache_control).toEqual({ type: 'ephemeral' }); // Penultimate (tool message)
      expect(result.stats.breakpointsInjected).toBe(2);
    });

    it('should preserve additional message properties', () => {
      const messagesWithExtras: CacheableMessage[] = [
        {
          role: 'system',
          content: 'System prompt',
          metadata: { source: 'config' },
        },
        {
          role: 'user', 
          content: 'User message',
          timestamp: Date.now(),
          userId: 'user123',
        },
        {
          role: 'assistant',
          content: 'Assistant response',
          model: 'claude-3',
          usage: { input_tokens: 100, output_tokens: 50 },
        }
      ];

      const result = injectCacheBreakpoints(messagesWithExtras, baseConfig);

      result.messages.forEach((message, index) => {
        const original = messagesWithExtras[index];
        
        // All original properties should be preserved
        Object.keys(original).forEach(key => {
          if (key !== 'cache_control') {
            expect(message[key]).toEqual(original[key]);
          }
        });
      });
    });
  });

  describe('Configuration and Edge Cases', () => {
    it('should respect disabled cache configuration', () => {
      const messages = [
        createMessage('system', 'System prompt'),
        createLongMessage('user', 'Long message ', 1200),
        createMessage('assistant', 'Response'),
        createMessage('user', 'Follow-up'),
      ];

      const disabledConfig: CacheInjectionConfig = {
        enabled: false,
        minContentLength: 1000,
      };

      const result = injectCacheBreakpoints(messages, disabledConfig);

      expect(result.messages.every(msg => !msg.cache_control)).toBe(true);
      expect(result.stats.breakpointsInjected).toBe(0);
      expect(result.stats.eligibleMessages).toBe(0);
    });

    it('should handle empty message array', () => {
      const result = injectCacheBreakpoints([], baseConfig);

      expect(result.messages).toHaveLength(0);
      expect(result.stats.breakpointsInjected).toBe(0);
      expect(result.stats.eligibleMessages).toBe(0);
    });

    it('should use simple injection function correctly', () => {
      const messages = [
        createMessage('system', 'System prompt'),
        createLongMessage('user', 'Long message ', 1200),
      ];

      const simpleResult = injectCacheBreakpointsSimple(messages, baseConfig);
      const fullResult = injectCacheBreakpoints(messages, baseConfig);

      expect(simpleResult).toEqual(fullResult.messages);
    });

    it('should handle default configuration correctly', () => {
      const messages = [
        createMessage('system', 'System prompt'),
        createLongMessage('user', 'Message over default threshold ', 1200),
        createMessage('user', 'Short message'),
      ];

      // Test with default config
      const defaultResult = injectCacheBreakpoints(messages);
      expect(defaultResult.messages[0].cache_control).toEqual({ type: 'ephemeral' }); // System
      expect(defaultResult.messages[1].cache_control).toEqual({ type: 'ephemeral' }); // Long message
      expect(defaultResult.messages[2].cache_control).toBeUndefined(); // Short message
      expect(defaultResult.stats.breakpointsInjected).toBe(2);
    });
  });

  describe('Cache Strategy Integration', () => {
    it('should apply all cache strategies in a realistic conversation', () => {
      const conversation: CacheableMessage[] = [
        // System prompt - should be cached
        createMessage('system', `You are a senior software engineer helping with code review and architecture decisions. 
                     You have expertise in React, TypeScript, Node.js, and cloud architecture.`),
        
        // Regular conversation
        createMessage('user', 'I need help reviewing this React component.'),
        createMessage('assistant', 'I\'d be happy to help with your React component review.'),
        
        // Long code message - should be cached due to length
        createMessage('user', `
Here's the component I'd like you to review:

\`\`\`typescript
import React, { useState, useEffect, useMemo } from 'react';
import { debounce } from 'lodash';

interface SearchResult {
  id: string;
  title: string;
  description: string;
  category: string;
  relevance: number;
}

interface SearchComponentProps {
  onResultSelect: (result: SearchResult) => void;
  placeholder?: string;
  categories?: string[];
}

const SearchComponent: React.FC<SearchComponentProps> = ({
  onResultSelect,
  placeholder = 'Search...',
  categories = []
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const debouncedSearch = useMemo(
    () => debounce(async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery, categories })
        });
        
        if (!response.ok) throw new Error('Search failed');
        
        const data = await response.json();
        setResults(data.results || []);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300),
    [categories]
  );

  useEffect(() => {
    debouncedSearch(query);
    return () => debouncedSearch.cancel();
  }, [query, debouncedSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      onResultSelect(results[selectedIndex]);
    }
  };

  return (
    <div className="search-component">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="search-input"
      />
      {loading && <div className="loading">Searching...</div>}
      {results.length > 0 && (
        <div className="results-container">
          {results.map((result, index) => (
            <div
              key={result.id}
              className={\`result-item \${index === selectedIndex ? 'selected' : ''}\`}
              onClick={() => onResultSelect(result)}
            >
              <h4>{result.title}</h4>
              <p>{result.description}</p>
              <span className="category">{result.category}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchComponent;
\`\`\`

What are your thoughts on this implementation?`),
        
        // Long response - should be cached due to length
        createMessage('assistant', `
This is a solid React component implementation! Here's my detailed review:

**Strengths:**
1. **Type Safety**: Excellent use of TypeScript interfaces for props and data structures
2. **Performance**: Good use of useMemo for debounced function and proper cleanup
3. **User Experience**: Keyboard navigation support (arrow keys, enter)
4. **Error Handling**: Proper try-catch and loading states
5. **Accessibility**: Clear component structure and meaningful class names

**Areas for Improvement:**

1. **Error State Display**: Currently errors are only logged to console
   \`\`\`typescript
   const [error, setError] = useState<string | null>(null);
   
   // In the catch block:
   setError('Failed to search. Please try again.');
   
   // In the render:
   {error && <div className="error">{error}</div>}
   \`\`\`

2. **Accessibility Enhancements**: Add ARIA attributes for better screen reader support
   \`\`\`typescript
   <input
     type="text"
     role="combobox"
     aria-expanded={results.length > 0}
     aria-activedescendant={selectedIndex >= 0 ? \`result-\${selectedIndex}\` : undefined}
     // ... other props
   />
   \`\`\`

3. **Performance**: Consider virtualizing results for large result sets
4. **Loading State**: Add skeleton loading for better UX
5. **Debounce Timing**: 300ms might be too aggressive for some use cases

**Minor Issues:**
- Template literal escaping in className could be cleaner
- Consider extracting the fetch logic to a custom hook for reusability

Overall, this is well-architected code that follows React best practices!`),
        
        // Penultimate message - should be cached by position
        createMessage('user', 'Thanks for the review! One more question about the debouncing.'),
        
        // Last message - should not be cached
        createMessage('assistant', 'Sure, what would you like to know about the debouncing implementation?'),
      ];

      const result = injectCacheBreakpoints(conversation, {
        enabled: true,
        minContentLength: 800, // Lower threshold to catch the long messages
      });

      // Verify expected cache breakpoints
      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' }); // System prompt
      expect(result.messages[1].cache_control).toBeUndefined(); // Short user message
      expect(result.messages[2].cache_control).toBeUndefined(); // Short assistant message  
      expect(result.messages[3].cache_control).toEqual({ type: 'ephemeral' }); // Long user code message
      expect(result.messages[4].cache_control).toEqual({ type: 'ephemeral' }); // Long assistant review
      expect(result.messages[5].cache_control).toEqual({ type: 'ephemeral' }); // Penultimate message
      expect(result.messages[6].cache_control).toBeUndefined(); // Last message

      expect(result.stats.breakpointsInjected).toBe(4);
      expect(result.stats.eligibleMessages).toBe(4);
    });

    it('should optimize cache strategy for different conversation patterns', () => {
      // Test conversation with multiple long technical exchanges
      const technicalConversation: CacheableMessage[] = [
        createMessage('system', 'You are a database architect.'),
        createLongMessage('user', 'Detailed database design question ', 1200),
        createLongMessage('assistant', 'Comprehensive database architecture response ', 1500),
        createLongMessage('user', 'Follow-up technical question ', 1100),
        createLongMessage('assistant', 'Detailed technical explanation ', 1400),
        createMessage('user', 'Quick question'),
        createMessage('assistant', 'Quick answer'),
      ];

      const result = injectCacheBreakpoints(technicalConversation, baseConfig);

      // System + 4 long messages + penultimate = 6 cache breakpoints expected
      expect(result.stats.breakpointsInjected).toBe(6);
      
      // Verify that all long messages got cached
      const longMessages = [1, 2, 3, 4]; // Indices of long messages
      longMessages.forEach(index => {
        expect(result.messages[index].cache_control).toEqual({ type: 'ephemeral' });
      });
    });
  });
});