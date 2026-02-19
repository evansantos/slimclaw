/**
 * Tests for log levels and utilities
 */

import { describe, it, expect } from 'vitest';
import {
  LOG_LEVELS,
  shouldLog,
  getEnabledLevels,
  formatLogLevel,
  parseLogLevel,
  type LogLevel,
} from '../levels.js';

describe('LOG_LEVELS', () => {
  it('should have correct hierarchy', () => {
    expect(LOG_LEVELS.debug).toBe(0);
    expect(LOG_LEVELS.info).toBe(1);
    expect(LOG_LEVELS.warn).toBe(2);
    expect(LOG_LEVELS.error).toBe(3);
  });
});

describe('shouldLog', () => {
  it('should allow messages at or above minimum level', () => {
    // With info as minimum level
    expect(shouldLog('debug', 'info')).toBe(false);
    expect(shouldLog('info', 'info')).toBe(true);
    expect(shouldLog('warn', 'info')).toBe(true);
    expect(shouldLog('error', 'info')).toBe(true);
  });

  it('should work with debug as minimum level', () => {
    expect(shouldLog('debug', 'debug')).toBe(true);
    expect(shouldLog('info', 'debug')).toBe(true);
    expect(shouldLog('warn', 'debug')).toBe(true);
    expect(shouldLog('error', 'debug')).toBe(true);
  });

  it('should work with error as minimum level', () => {
    expect(shouldLog('debug', 'error')).toBe(false);
    expect(shouldLog('info', 'error')).toBe(false);
    expect(shouldLog('warn', 'error')).toBe(false);
    expect(shouldLog('error', 'error')).toBe(true);
  });
});

describe('getEnabledLevels', () => {
  it('should return correct levels for info minimum', () => {
    const enabled = getEnabledLevels('info');
    expect(enabled).toEqual(['info', 'warn', 'error']);
  });

  it('should return all levels for debug minimum', () => {
    const enabled = getEnabledLevels('debug');
    expect(enabled).toEqual(['debug', 'info', 'warn', 'error']);
  });

  it('should return only error for error minimum', () => {
    const enabled = getEnabledLevels('error');
    expect(enabled).toEqual(['error']);
  });
});

describe('formatLogLevel', () => {
  it('should format levels as uppercase', () => {
    expect(formatLogLevel('debug')).toBe('DEBUG');
    expect(formatLogLevel('info')).toBe('INFO');
    expect(formatLogLevel('warn')).toBe('WARN');
    expect(formatLogLevel('error')).toBe('ERROR');
  });
});

describe('parseLogLevel', () => {
  it('should parse valid levels', () => {
    expect(parseLogLevel('debug')).toBe('debug');
    expect(parseLogLevel('INFO')).toBe('info');
    expect(parseLogLevel('Warn')).toBe('warn');
    expect(parseLogLevel('ERROR')).toBe('error');
  });

  it('should use fallback for invalid levels', () => {
    expect(parseLogLevel('invalid')).toBe('info');
    expect(parseLogLevel('invalid', 'error')).toBe('error');
    expect(parseLogLevel('')).toBe('info');
  });
});