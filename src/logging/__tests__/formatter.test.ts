/**
 * Tests for log formatter
 */

import { describe, it, expect } from 'vitest';
import {
  LogFormatter,
  createLogEntry,
  Formatters,
  type LogEntry,
} from '../formatter.js';

describe('LogFormatter', () => {
  describe('JSON format', () => {
    const formatter = new LogFormatter({
      format: 'json',
      includeStackTrace: true,
      colors: false,
    });

    it('should format basic entry as JSON', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T10:00:00.000Z',
        level: 'info',
        message: 'test message',
      };

      const result = formatter.format(entry);
      const parsed = JSON.parse(result);

      expect(parsed.timestamp).toBe('2024-01-01T10:00:00.000Z');
      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('test message');
    });

    it('should include optional fields when present', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T10:00:00.000Z',
        level: 'debug',
        message: 'test message',
        correlationId: 'a1b2c3d4',
        agentId: 'test-agent',
        sessionKey: 'test-session',
        component: 'TestComponent',
        metadata: { key1: 'value1', key2: 42 },
        error: {
          name: 'TestError',
          message: 'test error',
          stack: 'stack trace',
        },
      };

      const result = formatter.format(entry);
      const parsed = JSON.parse(result);

      expect(parsed.correlationId).toBe('a1b2c3d4');
      expect(parsed.agentId).toBe('test-agent');
      expect(parsed.sessionKey).toBe('test-session');
      expect(parsed.component).toBe('TestComponent');
      expect(parsed.metadata).toEqual({ key1: 'value1', key2: 42 });
      expect(parsed.error).toEqual({
        name: 'TestError',
        message: 'test error',
        stack: 'stack trace',
      });
    });

    it('should omit undefined fields', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T10:00:00.000Z',
        level: 'warn',
        message: 'test message',
        metadata: {},
      };

      const result = formatter.format(entry);
      const parsed = JSON.parse(result);

      expect('correlationId' in parsed).toBe(false);
      expect('agentId' in parsed).toBe(false);
      expect('metadata' in parsed).toBe(false);
    });
  });

  describe('Human format', () => {
    const formatter = new LogFormatter({
      format: 'human',
      includeStackTrace: true,
      colors: false,
    });

    it('should format basic entry as human-readable', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T10:00:00.000Z',
        level: 'info',
        message: 'test message',
      };

      const result = formatter.format(entry);
      expect(result).toContain('INFO');
      expect(result).toContain('test message');
      // Check for time format but allow for timezone differences
      expect(result).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
    });

    it('should include correlation ID when present', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T10:00:00.000Z',
        level: 'debug',
        message: 'test message',
        correlationId: 'a1b2c3d4',
      };

      const result = formatter.format(entry);
      expect(result).toContain('[a1b2c3d4]');
    });

    it('should include component when present', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T10:00:00.000Z',
        level: 'warn',
        message: 'test message',
        component: 'TestComponent',
      };

      const result = formatter.format(entry);
      expect(result).toContain('[TestComponent]');
    });

    it('should include context information', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T10:00:00.000Z',
        level: 'error',
        message: 'test message',
        agentId: 'test-agent',
        sessionKey: 'test-session',
      };

      const result = formatter.format(entry);
      expect(result).toContain('agent=test-agent');
      expect(result).toContain('session=test-session');
    });

    it('should include metadata', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T10:00:00.000Z',
        level: 'info',
        message: 'test message',
        metadata: {
          key1: 'value1',
          key2: 42,
          key3: true,
          key4: ['a', 'b'],
          key5: { nested: 'value' },
        },
      };

      const result = formatter.format(entry);
      expect(result).toContain('key1=value1');
      expect(result).toContain('key2=42');
      expect(result).toContain('key3=true');
      expect(result).toContain('key4=[a,b]');
      expect(result).toContain('key5={"nested":"value"}');
    });

    it('should include error details with stack trace', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T10:00:00.000Z',
        level: 'error',
        message: 'test message',
        error: {
          name: 'TestError',
          message: 'test error',
          stack: 'Error: test error\n    at test:1:1\n    at test:2:2',
        },
      };

      const result = formatter.format(entry);
      expect(result).toContain('Error: TestError: test error');
      expect(result).toContain('at test:1:1');
      expect(result).toContain('at test:2:2');
    });

    it('should omit stack trace when not enabled', () => {
      const formatterNoStack = new LogFormatter({
        format: 'human',
        includeStackTrace: false,
        colors: false,
      });

      const entry: LogEntry = {
        timestamp: '2024-01-01T10:00:00.000Z',
        level: 'error',
        message: 'test message',
        error: {
          name: 'TestError',
          message: 'test error',
          stack: 'Error: test error\n    at test:1:1',
        },
      };

      const result = formatterNoStack.format(entry);
      expect(result).toContain('Error: TestError: test error');
      expect(result).not.toContain('at test:1:1');
    });
  });

  describe('Colors', () => {
    const formatter = new LogFormatter({
      format: 'human',
      includeStackTrace: false,
      colors: true,
    });

    it('should add color codes when enabled', () => {
      const levels: Array<[string, string]> = [
        ['debug', '\x1b[36m'],  // cyan
        ['info', '\x1b[32m'],   // green
        ['warn', '\x1b[33m'],   // yellow
        ['error', '\x1b[31m'],  // red
      ];

      levels.forEach(([level, colorCode]) => {
        const entry: LogEntry = {
          timestamp: '2024-01-01T10:00:00.000Z',
          level: level as any,
          message: 'test message',
        };

        const result = formatter.format(entry);
        expect(result).toContain(colorCode);
        expect(result).toContain('\x1b[0m'); // reset code
      });
    });
  });
});

describe('createLogEntry', () => {
  it('should create basic log entry', () => {
    const entry = createLogEntry('info', 'test message');
    
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('test message');
    expect(entry.timestamp).toBeDefined();
    expect(new Date(entry.timestamp).getTime()).toBeGreaterThan(0);
  });

  it('should include optional fields', () => {
    const error = new Error('test error');
    const entry = createLogEntry('error', 'test message', {
      correlationId: 'a1b2c3d4',
      agentId: 'test-agent',
      sessionKey: 'test-session',
      component: 'TestComponent',
      metadata: { key: 'value' },
      error,
    });

    expect(entry.correlationId).toBe('a1b2c3d4');
    expect(entry.agentId).toBe('test-agent');
    expect(entry.sessionKey).toBe('test-session');
    expect(entry.component).toBe('TestComponent');
    expect(entry.metadata).toEqual({ key: 'value' });
    expect(entry.error?.name).toBe('Error');
    expect(entry.error?.message).toBe('test error');
    expect(entry.error?.stack).toBeDefined();
  });
});

describe('Formatters', () => {
  it('should create development formatter', () => {
    const formatter = Formatters.development();
    expect(formatter).toBeInstanceOf(LogFormatter);
  });

  it('should create production formatter', () => {
    const formatter = Formatters.production();
    expect(formatter).toBeInstanceOf(LogFormatter);
  });

  it('should create testing formatter', () => {
    const formatter = Formatters.testing();
    expect(formatter).toBeInstanceOf(LogFormatter);
  });
});