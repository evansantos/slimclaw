/**
 * Tests for correlation ID management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateCorrelationId,
  isValidCorrelationId,
  correlationContext,
  extractOrGenerateCorrelationId,
  withCorrelation,
} from '../correlation.js';

describe('generateCorrelationId', () => {
  it('should generate 8 character hex strings', () => {
    const id = generateCorrelationId();
    expect(id).toMatch(/^[a-f0-9]{8}$/);
    expect(id.length).toBe(8);
  });

  it('should generate unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateCorrelationId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('isValidCorrelationId', () => {
  it('should validate correct format', () => {
    expect(isValidCorrelationId('a1b2c3d4')).toBe(true);
    expect(isValidCorrelationId('00000000')).toBe(true);
    expect(isValidCorrelationId('ffffffff')).toBe(true);
  });

  it('should reject incorrect format', () => {
    expect(isValidCorrelationId('123')).toBe(false);
    expect(isValidCorrelationId('a1b2c3d45')).toBe(false);
    expect(isValidCorrelationId('g1b2c3d4')).toBe(false);
    expect(isValidCorrelationId('A1B2C3D4')).toBe(false);
    expect(isValidCorrelationId('')).toBe(false);
    expect(isValidCorrelationId('a1b2-c3d4')).toBe(false);
  });
});

describe('correlationContext', () => {
  beforeEach(() => {
    correlationContext.clear();
  });

  afterEach(() => {
    correlationContext.clear();
  });

  it('should generate ID when none exists', () => {
    const id = correlationContext.getId();
    expect(id).toMatch(/^[a-f0-9]{8}$/);
  });

  it('should return same ID on subsequent calls', () => {
    const id1 = correlationContext.getId();
    const id2 = correlationContext.getId();
    expect(id1).toBe(id2);
  });

  it('should set and get specific ID', () => {
    correlationContext.setId('a1b2c3d4');
    expect(correlationContext.getId()).toBe('a1b2c3d4');
  });

  it('should run with specific context', () => {
    const id = 'test1234';
    let capturedId: string;

    correlationContext.run(id, () => {
      capturedId = correlationContext.getId();
    });

    expect(capturedId!).toBe(id);
  });

  it('should restore previous context after run', () => {
    correlationContext.setId('original');
    
    correlationContext.run('temporary', () => {
      expect(correlationContext.getId()).toBe('temporary');
    });

    expect(correlationContext.getId()).toBe('original');
  });

  it('should generate new context with runWithNew', () => {
    const { result, correlationId } = correlationContext.runWithNew(() => {
      return correlationContext.getId();
    });

    expect(result).toBe(correlationId);
    expect(correlationId).toMatch(/^[a-f0-9]{8}$/);
  });
});

describe('extractOrGenerateCorrelationId', () => {
  it('should extract valid ID from headers', () => {
    const headers = { 'x-correlation-id': 'a1b2c3d4' };
    const id = extractOrGenerateCorrelationId(headers);
    expect(id).toBe('a1b2c3d4');
  });

  it('should handle case-insensitive headers', () => {
    const headers = { 'X-Correlation-Id': 'a1b2c3d4' };
    const id = extractOrGenerateCorrelationId(headers);
    expect(id).toBe('a1b2c3d4');
  });

  it('should use custom header name', () => {
    const headers = { 'x-request-id': 'a1b2c3d4' };
    const id = extractOrGenerateCorrelationId(headers, 'x-request-id');
    expect(id).toBe('a1b2c3d4');
  });

  it('should generate new ID for invalid header value', () => {
    const headers = { 'x-correlation-id': 'invalid' };
    const id = extractOrGenerateCorrelationId(headers);
    expect(id).toMatch(/^[a-f0-9]{8}$/);
    expect(id).not.toBe('invalid');
  });

  it('should generate new ID when header missing', () => {
    const headers = {};
    const id = extractOrGenerateCorrelationId(headers);
    expect(id).toMatch(/^[a-f0-9]{8}$/);
  });
});

describe('withCorrelation', () => {
  beforeEach(() => {
    correlationContext.clear();
  });

  afterEach(() => {
    correlationContext.clear();
  });

  it('should preserve correlation context in wrapped function', async () => {
    correlationContext.setId('test1234');

    const wrappedFn = withCorrelation(async () => {
      return correlationContext.getId();
    });

    const result = await wrappedFn();
    expect(result).toBe('test1234');
  });

  it('should preserve function arguments', async () => {
    const wrappedFn = withCorrelation(async (a: number, b: string) => {
      return `${a}-${b}`;
    });

    const result = await wrappedFn(42, 'test');
    expect(result).toBe('42-test');
  });

  it('should handle function errors', async () => {
    const wrappedFn = withCorrelation(async () => {
      throw new Error('test error');
    });

    await expect(wrappedFn()).rejects.toThrow('test error');
  });
});