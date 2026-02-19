/**
 * Testes para o módulo de Cache Injection
 */

import { describe, test, expect } from 'vitest';
import {
  injectCacheBreakpoints,
  injectCacheBreakpointsSimple,
  createMessage,
  type CacheableMessage,
  type CacheInjectionConfig,
  DEFAULT_CACHE_CONFIG,
} from '../breakpoints.js';

describe('Cache Injection Module', () => {
  describe('injectCacheBreakpoints', () => {
    test('deve retornar array vazio quando não há mensagens', () => {
      const result = injectCacheBreakpoints([]);
      
      expect(result.messages).toEqual([]);
      expect(result.stats).toEqual({
        breakpointsInjected: 0,
        eligibleMessages: 0,
      });
    });

    test('deve cachear system prompts sempre', () => {
      const messages: CacheableMessage[] = [
        createMessage('system', 'You are a helpful assistant.'),
        createMessage('user', 'Hello'),
      ];

      const result = injectCacheBreakpoints(messages);

      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(result.messages[1].cache_control).toBeUndefined();
      expect(result.stats.breakpointsInjected).toBe(1);
      expect(result.stats.eligibleMessages).toBe(1);
    });

    test('deve cachear mensagens longas baseado no threshold', () => {
      const shortContent = 'Short message';
      const longContent = 'x'.repeat(1500); // > 1000 chars (default threshold)

      const messages: CacheableMessage[] = [
        createMessage('user', shortContent),
        createMessage('assistant', longContent),
        createMessage('user', 'Another short message'),
      ];

      const result = injectCacheBreakpoints(messages);

      expect(result.messages[0].cache_control).toBeUndefined();
      expect(result.messages[1].cache_control).toEqual({ type: 'ephemeral' });
      expect(result.messages[2].cache_control).toBeUndefined();
      expect(result.stats.breakpointsInjected).toBe(1);
    });

    test('deve cachear penúltima mensagem em conversas com 3+ mensagens', () => {
      const messages: CacheableMessage[] = [
        createMessage('user', 'Message 1'),
        createMessage('assistant', 'Message 2'),
        createMessage('user', 'Message 3'), // penúltima
        createMessage('assistant', 'Message 4'), // última
      ];

      const result = injectCacheBreakpoints(messages);

      expect(result.messages[0].cache_control).toBeUndefined();
      expect(result.messages[1].cache_control).toBeUndefined();
      expect(result.messages[2].cache_control).toEqual({ type: 'ephemeral' }); // penúltima
      expect(result.messages[3].cache_control).toBeUndefined();
      expect(result.stats.breakpointsInjected).toBe(1);
    });

    test('não deve cachear penúltima mensagem se há menos de 3 mensagens', () => {
      const messages: CacheableMessage[] = [
        createMessage('user', 'Message 1'),
        createMessage('assistant', 'Message 2'),
      ];

      const result = injectCacheBreakpoints(messages);

      expect(result.messages[0].cache_control).toBeUndefined();
      expect(result.messages[1].cache_control).toBeUndefined();
      expect(result.stats.breakpointsInjected).toBe(0);
    });

    test('deve respeitar threshold customizado', () => {
      const config: CacheInjectionConfig = {
        enabled: true,
        minContentLength: 500,
      };

      const mediumContent = 'x'.repeat(600); // > 500 but < 1000
      const messages: CacheableMessage[] = [
        createMessage('user', mediumContent),
      ];

      const result = injectCacheBreakpoints(messages, config);

      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(result.stats.breakpointsInjected).toBe(1);
    });

    test('não deve injetar cache quando disabled', () => {
      const config: CacheInjectionConfig = {
        enabled: false,
        minContentLength: 1000,
      };

      const messages: CacheableMessage[] = [
        createMessage('system', 'System prompt'),
        createMessage('user', 'x'.repeat(2000)), // longa
      ];

      const result = injectCacheBreakpoints(messages, config);

      expect(result.messages[0].cache_control).toBeUndefined();
      expect(result.messages[1].cache_control).toBeUndefined();
      expect(result.stats.breakpointsInjected).toBe(0);
      expect(result.stats.eligibleMessages).toBe(0);
    });

    test('não deve substituir cache_control existente', () => {
      const messages: CacheableMessage[] = [
        createMessage('system', 'System prompt', { type: 'ephemeral' }),
      ];

      const result = injectCacheBreakpoints(messages);

      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(result.stats.breakpointsInjected).toBe(0); // não injetou novo
      expect(result.stats.eligibleMessages).toBe(1); // mas era elegível
    });

    test('deve processar content blocks complexos', () => {
      const complexContent = [
        { type: 'text', text: 'x'.repeat(800) },
        { type: 'image', url: 'data:image/png;base64,xyz' },
        { type: 'text', text: 'x'.repeat(300) },
      ];

      const messages: CacheableMessage[] = [
        createMessage('user', complexContent),
      ];

      const result = injectCacheBreakpoints(messages);

      // Total length > 1000, deve cachear
      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(result.stats.breakpointsInjected).toBe(1);
    });

    test('cenário completo: system + conversa longa + mensagens variadas', () => {
      const messages: CacheableMessage[] = [
        createMessage('system', 'You are a helpful coding assistant.'),
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi! How can I help?'),
        createMessage('user', 'x'.repeat(1200)), // longa
        createMessage('assistant', 'Sure, I can help with that.'),
        createMessage('user', 'Thanks'), // penúltima
        createMessage('assistant', 'You\'re welcome!'), // última
      ];

      const result = injectCacheBreakpoints(messages);

      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' }); // system
      expect(result.messages[1].cache_control).toBeUndefined();
      expect(result.messages[2].cache_control).toBeUndefined();
      expect(result.messages[3].cache_control).toEqual({ type: 'ephemeral' }); // longa
      expect(result.messages[4].cache_control).toBeUndefined();
      expect(result.messages[5].cache_control).toEqual({ type: 'ephemeral' }); // penúltima
      expect(result.messages[6].cache_control).toBeUndefined();

      expect(result.stats.breakpointsInjected).toBe(3);
      expect(result.stats.eligibleMessages).toBe(3);
    });

    test('deve usar configuração padrão quando não fornecida', () => {
      const longContent = 'x'.repeat(1500);
      const messages: CacheableMessage[] = [
        createMessage('user', longContent),
      ];

      const result = injectCacheBreakpoints(messages);

      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(result.stats.breakpointsInjected).toBe(1);
    });
  });

  describe('injectCacheBreakpointsSimple', () => {
    test('deve retornar apenas as mensagens processadas', () => {
      const messages: CacheableMessage[] = [
        createMessage('system', 'System prompt'),
        createMessage('user', 'Hello'),
      ];

      const result = injectCacheBreakpointsSimple(messages);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(result[1].cache_control).toBeUndefined();
    });
  });

  describe('createMessage helper', () => {
    test('deve criar mensagem básica', () => {
      const message = createMessage('user', 'Hello world');
      
      expect(message).toEqual({
        role: 'user',
        content: 'Hello world',
      });
    });

    test('deve criar mensagem com cache_control', () => {
      const message = createMessage('system', 'Prompt', { type: 'ephemeral' });
      
      expect(message).toEqual({
        role: 'system',
        content: 'Prompt',
        cache_control: { type: 'ephemeral' },
      });
    });

    test('deve aceitar content blocks', () => {
      const contentBlocks = [
        { type: 'text', text: 'Hello' },
        { type: 'image', url: 'image.png' },
      ];
      
      const message = createMessage('user', contentBlocks);
      
      expect(message.content).toBe(contentBlocks);
    });
  });

  describe('DEFAULT_CACHE_CONFIG', () => {
    test('deve ter valores padrão corretos', () => {
      expect(DEFAULT_CACHE_CONFIG).toEqual({
        enabled: true,
        minContentLength: 1000,
      });
    });
  });

  describe('edge cases', () => {
    test('deve lidar com content vazio', () => {
      const messages: CacheableMessage[] = [
        createMessage('user', ''),
      ];

      const result = injectCacheBreakpoints(messages);

      expect(result.messages[0].cache_control).toBeUndefined();
      expect(result.stats.breakpointsInjected).toBe(0);
    });

    test('deve lidar com array de content blocks vazio', () => {
      const messages: CacheableMessage[] = [
        createMessage('user', []),
      ];

      const result = injectCacheBreakpoints(messages);

      expect(result.messages[0].cache_control).toBeUndefined();
      expect(result.stats.breakpointsInjected).toBe(0);
    });

    test('deve preservar propriedades adicionais da mensagem', () => {
      const message: CacheableMessage = {
        role: 'assistant',
        content: 'x'.repeat(1500),
        tool_calls: [{ id: '123', type: 'function', function: { name: 'test' } }],
        extra_prop: 'should be preserved',
      };

      const result = injectCacheBreakpoints([message]);

      expect(result.messages[0].tool_calls).toEqual(message.tool_calls);
      expect((result.messages[0] as any).extra_prop).toBe('should be preserved');
      expect(result.messages[0].cache_control).toEqual({ type: 'ephemeral' });
    });
  });
});