/**
 * SlimClaw Correlation ID Management
 * Generates and manages correlation IDs for request tracing
 */

import { randomBytes } from 'node:crypto';

/**
 * Generates a new correlation ID
 * Format: 8 random hex characters (e.g., "a1b2c3d4")
 */
export function generateCorrelationId(): string {
  return randomBytes(4).toString('hex');
}

/**
 * Validates if a string is a valid correlation ID format
 * 
 * @param id - String to validate
 * @returns true if valid format
 */
export function isValidCorrelationId(id: string): boolean {
  return /^[a-f0-9]{8}$/.test(id);
}

/**
 * Context storage for correlation IDs within async operations
 * Uses AsyncLocalStorage-like pattern for Node.js context tracking
 */
class CorrelationContext {
  private currentId: string | null = null;

  /**
   * Sets the correlation ID for the current async context
   */
  setId(id: string): void {
    this.currentId = id;
  }

  /**
   * Gets the current correlation ID, or generates one if none exists
   */
  getId(): string {
    if (!this.currentId) {
      this.currentId = generateCorrelationId();
    }
    return this.currentId;
  }

  /**
   * Runs a function within a specific correlation context
   * 
   * @param id - Correlation ID to use
   * @param fn - Function to execute
   * @returns Function result
   */
  run<T>(id: string, fn: () => T): T {
    const previousId = this.currentId;
    this.currentId = id;
    
    try {
      return fn();
    } finally {
      this.currentId = previousId;
    }
  }

  /**
   * Runs a function within a new correlation context
   * 
   * @param fn - Function to execute
   * @returns Function result and the generated correlation ID
   */
  runWithNew<T>(fn: () => T): { result: T; correlationId: string } {
    const id = generateCorrelationId();
    const result = this.run(id, fn);
    return { result, correlationId: id };
  }

  /**
   * Clears the current correlation context
   */
  clear(): void {
    this.currentId = null;
  }
}

/**
 * Global correlation context instance
 */
export const correlationContext = new CorrelationContext();

/**
 * Extracts correlation ID from HTTP headers or generates a new one
 * 
 * @param headers - HTTP request headers
 * @param headerName - Header name to look for (default: x-correlation-id)
 * @returns Correlation ID from headers or newly generated
 */
export function extractOrGenerateCorrelationId(
  headers: Record<string, string | undefined> = {},
  headerName = 'x-correlation-id'
): string {
  // Normalize header name to lowercase
  const normalizedHeaderName = headerName.toLowerCase();
  
  // Check for the header in a case-insensitive way
  let headerValue: string | undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === normalizedHeaderName) {
      headerValue = value;
      break;
    }
  }
  
  if (headerValue && isValidCorrelationId(headerValue)) {
    return headerValue;
  }
  
  return generateCorrelationId();
}

/**
 * Creates a correlation ID aware wrapper for async functions
 * 
 * @param fn - Async function to wrap
 * @returns Wrapped function that preserves correlation context
 */
export function withCorrelation<T extends any[], R>(
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const correlationId = correlationContext.getId();
    return correlationContext.run(correlationId, () => fn(...args));
  };
}

/**
 * Decorator for methods that should run with correlation context
 * Usage: @correlationAware
 */
export function correlationAware<T extends any[], R>(
  _target: any,
  _propertyName: string,
  descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
) {
  const method = descriptor.value;
  if (!method) return descriptor;

  descriptor.value = withCorrelation(method);
  return descriptor;
}