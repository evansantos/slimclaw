/**
 * SlimClaw Log Formatting
 * Handles structured log formatting for different environments
 */

import type { LogLevel } from './levels.js';
import { formatLogLevel } from './levels.js';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  agentId?: string;
  sessionKey?: string;
  component?: string;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface FormatterOptions {
  /** Use JSON format (for production) or human-readable (for development) */
  format: 'json' | 'human';
  /** Include stack traces for errors */
  includeStackTrace: boolean;
  /** Timezone for timestamps */
  timezone?: string;
  /** Color output for human format */
  colors?: boolean;
}

/**
 * Formats a log entry according to the specified options
 */
export class LogFormatter {
  constructor(private options: FormatterOptions) {}

  /**
   * Formats a log entry to a string
   */
  format(entry: LogEntry): string {
    if (this.options.format === 'json') {
      return this.formatJson(entry);
    } else {
      return this.formatHuman(entry);
    }
  }

  /**
   * Formats entry as JSON (production format)
   */
  private formatJson(entry: LogEntry): string {
    const jsonEntry = {
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      ...(entry.correlationId && { correlationId: entry.correlationId }),
      ...(entry.agentId && { agentId: entry.agentId }),
      ...(entry.sessionKey && { sessionKey: entry.sessionKey }),
      ...(entry.component && { component: entry.component }),
      ...(entry.metadata && Object.keys(entry.metadata).length > 0 && { metadata: entry.metadata }),
      ...(entry.error && { error: entry.error }),
    };

    return JSON.stringify(jsonEntry);
  }

  /**
   * Formats entry as human-readable text (development format)
   */
  private formatHuman(entry: LogEntry): string {
    const timestamp = this.formatTimestamp(entry.timestamp);
    const level = formatLogLevel(entry.level);
    const levelFormatted = this.options.colors ? this.colorizeLevel(level, entry.level) : level;
    
    // Base format: [timestamp] LEVEL [component] message
    const parts = [
      `[${timestamp}]`,
      levelFormatted,
    ];

    // Add correlation ID if present
    if (entry.correlationId) {
      parts.push(`[${entry.correlationId}]`);
    }

    // Add component if present
    if (entry.component) {
      parts.push(`[${entry.component}]`);
    }

    // Add the message
    parts.push(entry.message);

    let result = parts.join(' ');

    // Add context information if present
    const contextParts: string[] = [];
    if (entry.agentId) {
      contextParts.push(`agent=${entry.agentId}`);
    }
    if (entry.sessionKey) {
      contextParts.push(`session=${entry.sessionKey}`);
    }
    
    if (contextParts.length > 0) {
      result += ` (${contextParts.join(', ')})`;
    }

    // Add metadata if present
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      const metadataStr = Object.entries(entry.metadata)
        .map(([key, value]) => `${key}=${this.formatValue(value)}`)
        .join(' ');
      result += ` | ${metadataStr}`;
    }

    // Add error details if present
    if (entry.error) {
      result += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
      if (this.options.includeStackTrace && entry.error.stack) {
        result += `\n${entry.error.stack.split('\n').map(line => `    ${line}`).join('\n')}`;
      }
    }

    return result;
  }

  /**
   * Formats timestamp for human-readable output
   */
  private formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      timeZone: this.options.timezone
    });
  }

  /**
   * Adds color codes to log level (if colors enabled)
   */
  private colorizeLevel(levelStr: string, level: LogLevel): string {
    if (!this.options.colors) return levelStr;

    const colors = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m',  // green
      warn: '\x1b[33m',  // yellow
      error: '\x1b[31m', // red
    };

    const reset = '\x1b[0m';
    const color = colors[level] || '';
    
    return `${color}${levelStr}${reset}`;
  }

  /**
   * Formats a value for display in metadata
   */
  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return String(value);
    }

    if (typeof value === 'string') {
      // Quote strings that contain spaces
      return value.includes(' ') ? `"${value}"` : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map(v => this.formatValue(v)).join(',')}]`;
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }
}

/**
 * Creates a log entry from parameters
 */
export function createLogEntry(
  level: LogLevel,
  message: string,
  options: {
    correlationId?: string;
    agentId?: string;
    sessionKey?: string;
    component?: string;
    metadata?: Record<string, unknown>;
    error?: Error;
  } = {}
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (options.correlationId) entry.correlationId = options.correlationId;
  if (options.agentId) entry.agentId = options.agentId;
  if (options.sessionKey) entry.sessionKey = options.sessionKey;
  if (options.component) entry.component = options.component;
  if (options.metadata) entry.metadata = options.metadata;
  
  if (options.error) {
    entry.error = {
      name: options.error.name,
      message: options.error.message,
      ...(options.error.stack && { stack: options.error.stack }),
    };
  }

  return entry;
}

/**
 * Quick formatter factory functions
 */
export const Formatters = {
  /**
   * Development formatter (human-readable with colors)
   */
  development: (): LogFormatter => new LogFormatter({
    format: 'human',
    includeStackTrace: true,
    colors: true,
  }),

  /**
   * Production formatter (JSON, no colors)
   */
  production: (): LogFormatter => new LogFormatter({
    format: 'json',
    includeStackTrace: false,
    colors: false,
  }),

  /**
   * Testing formatter (human-readable, no colors, no stack traces)
   */
  testing: (): LogFormatter => new LogFormatter({
    format: 'human',
    includeStackTrace: false,
    colors: false,
  }),
};