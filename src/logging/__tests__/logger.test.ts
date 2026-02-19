/**
 * Tests for SlimClaw Logger
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SlimClawLogger, LoggerConfigs, createLogger, createLoggerFromEnv } from '../logger.js';
import type { LoggerConfig } from '../logger.js';

// Mock console methods
const mockConsole = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Mock fs promises
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock console
Object.assign(console, mockConsole);

describe('SlimClawLogger', () => {
  const testConfig: LoggerConfig = {
    level: 'debug',
    format: 'human',
    fileOutput: false,
    logPath: 'test-logs',
    consoleOutput: true,
    includeStackTrace: false,
    colors: false,
    component: 'Test',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic logging', () => {
    it('should log debug messages', () => {
      const logger = new SlimClawLogger(testConfig);
      logger.debug('test debug message');
      
      expect(mockConsole.debug).toHaveBeenCalledOnce();
      expect(mockConsole.debug.mock.calls[0][0]).toContain('DEBUG');
      expect(mockConsole.debug.mock.calls[0][0]).toContain('test debug message');
    });

    it('should log info messages', () => {
      const logger = new SlimClawLogger(testConfig);
      logger.info('test info message');
      
      expect(mockConsole.info).toHaveBeenCalledOnce();
      expect(mockConsole.info.mock.calls[0][0]).toContain('INFO');
      expect(mockConsole.info.mock.calls[0][0]).toContain('test info message');
    });

    it('should log warn messages', () => {
      const logger = new SlimClawLogger(testConfig);
      logger.warn('test warn message');
      
      expect(mockConsole.warn).toHaveBeenCalledOnce();
      expect(mockConsole.warn.mock.calls[0][0]).toContain('WARN');
      expect(mockConsole.warn.mock.calls[0][0]).toContain('test warn message');
    });

    it('should log error messages', () => {
      const logger = new SlimClawLogger(testConfig);
      logger.error('test error message');
      
      expect(mockConsole.error).toHaveBeenCalledOnce();
      expect(mockConsole.error.mock.calls[0][0]).toContain('ERROR');
      expect(mockConsole.error.mock.calls[0][0]).toContain('test error message');
    });
  });

  describe('Log level filtering', () => {
    it('should respect minimum log level', () => {
      const config = { ...testConfig, level: 'warn' as const };
      const logger = new SlimClawLogger(config);
      
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');
      
      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).toHaveBeenCalledOnce();
      expect(mockConsole.error).toHaveBeenCalledOnce();
    });
  });

  describe('Context and metadata', () => {
    it('should include context in logs', () => {
      const logger = new SlimClawLogger(testConfig, {
        correlationId: 'a1b2c3d4',
        agentId: 'test-agent',
        sessionKey: 'test-session',
      });
      
      logger.info('test message');
      
      const logOutput = mockConsole.info.mock.calls[0][0];
      expect(logOutput).toContain('[a1b2c3d4]');
      expect(logOutput).toContain('agent=test-agent');
      expect(logOutput).toContain('session=test-session');
    });

    it('should include metadata in logs', () => {
      const logger = new SlimClawLogger(testConfig);
      logger.info('test message', { key1: 'value1', key2: 42 });
      
      const logOutput = mockConsole.info.mock.calls[0][0];
      expect(logOutput).toContain('key1=value1');
      expect(logOutput).toContain('key2=42');
    });

    it('should handle error objects', () => {
      const logger = new SlimClawLogger(testConfig);
      const error = new Error('test error');
      logger.error('test message', error);
      
      const logOutput = mockConsole.error.mock.calls[0][0];
      expect(logOutput).toContain('Error: test error');
    });

    it('should handle error metadata', () => {
      const logger = new SlimClawLogger(testConfig);
      logger.error('test message', { errorCode: 500 });
      
      const logOutput = mockConsole.error.mock.calls[0][0];
      expect(logOutput).toContain('errorCode=500');
    });
  });

  describe('Child loggers', () => {
    it('should create child logger with additional context', () => {
      const parent = new SlimClawLogger(testConfig, {
        correlationId: 'a1b2c3d4',
        agentId: 'test-agent',
      });
      
      const child = parent.child({
        component: 'ChildComponent',
        sessionKey: 'test-session',
      });
      
      child.info('test message');
      
      const logOutput = mockConsole.info.mock.calls[0][0];
      expect(logOutput).toContain('[a1b2c3d4]');
      expect(logOutput).toContain('agent=test-agent');
      expect(logOutput).toContain('session=test-session');
      expect(logOutput).toContain('[ChildComponent]');
    });

    it('should override parent context in child', () => {
      const parent = new SlimClawLogger(testConfig, {
        agentId: 'parent-agent',
        component: 'ParentComponent',
      });
      
      const child = parent.child({
        agentId: 'child-agent',
        component: 'ChildComponent',
      });
      
      child.info('test message');
      
      const logOutput = mockConsole.info.mock.calls[0][0];
      expect(logOutput).toContain('agent=child-agent');
      expect(logOutput).toContain('[ChildComponent]');
      expect(logOutput).not.toContain('parent-agent');
      expect(logOutput).not.toContain('[ParentComponent]');
    });
  });

  describe('Console output control', () => {
    it('should not log to console when disabled', () => {
      const config = { ...testConfig, consoleOutput: false };
      const logger = new SlimClawLogger(config);
      
      logger.info('test message');
      
      expect(mockConsole.info).not.toHaveBeenCalled();
    });
  });

  describe('logOptimization', () => {
    it('should format optimization logs correctly', () => {
      const logger = new SlimClawLogger(testConfig);
      
      logger.logOptimization({
        requestId: 'abc123',
        windowing: true,
        trimmed: 37,
        tokensSaved: 31400,
        cacheBreakpoints: 3,
      });
      
      const logOutput = mockConsole.info.mock.calls[0][0];
      expect(logOutput).toContain('[SlimClaw]');
      expect(logOutput).toContain('requestId=abc123');
      expect(logOutput).toContain('windowing=true');
      expect(logOutput).toContain('trimmed=37');
      expect(logOutput).toContain('tokens_saved=31400');
      expect(logOutput).toContain('cache_breakpoints=3');
    });

    it('should handle optional optimization fields', () => {
      const logger = new SlimClawLogger(testConfig);
      
      logger.logOptimization({
        requestId: 'abc123',
        customField: 'custom-value',
      });
      
      const logOutput = mockConsole.info.mock.calls[0][0];
      expect(logOutput).toContain('[SlimClaw]');
      expect(logOutput).toContain('requestId=abc123');
      expect(logOutput).toContain('customField=custom-value');
    });
  });
});

describe('LoggerConfigs', () => {
  it('should provide development config', () => {
    const config = LoggerConfigs.development();
    
    expect(config.level).toBe('debug');
    expect(config.format).toBe('human');
    expect(config.colors).toBe(true);
    expect(config.includeStackTrace).toBe(true);
  });

  it('should provide production config', () => {
    const config = LoggerConfigs.production();
    
    expect(config.level).toBe('info');
    expect(config.format).toBe('json');
    expect(config.colors).toBe(false);
    expect(config.includeStackTrace).toBe(false);
  });

  it('should provide testing config', () => {
    const config = LoggerConfigs.testing();
    
    expect(config.level).toBe('error');
    expect(config.consoleOutput).toBe(false);
    expect(config.fileOutput).toBe(false);
  });

  it('should provide silent config', () => {
    const config = LoggerConfigs.silent();
    
    expect(config.consoleOutput).toBe(false);
    expect(config.fileOutput).toBe(false);
  });
});

describe('createLogger', () => {
  it('should create logger with defaults', () => {
    const logger = createLogger();
    expect(logger).toBeInstanceOf(SlimClawLogger);
  });

  it('should create logger with custom config', () => {
    const logger = createLogger({ level: 'error' });
    expect(logger).toBeInstanceOf(SlimClawLogger);
  });

  it('should create logger with context', () => {
    const logger = createLogger({}, { agentId: 'test-agent' });
    expect(logger).toBeInstanceOf(SlimClawLogger);
  });
});

describe('createLoggerFromEnv', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should use production config for production env', () => {
    process.env.NODE_ENV = 'production';
    const logger = createLoggerFromEnv();
    expect(logger).toBeInstanceOf(SlimClawLogger);
  });

  it('should use testing config for test env', () => {
    process.env.NODE_ENV = 'test';
    const logger = createLoggerFromEnv();
    expect(logger).toBeInstanceOf(SlimClawLogger);
  });

  it('should use development config for other envs', () => {
    process.env.NODE_ENV = 'development';
    const logger = createLoggerFromEnv();
    expect(logger).toBeInstanceOf(SlimClawLogger);
  });

  it('should apply overrides', () => {
    const logger = createLoggerFromEnv({}, { level: 'error' });
    expect(logger).toBeInstanceOf(SlimClawLogger);
  });
});