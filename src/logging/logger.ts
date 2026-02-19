/**
 * SlimClaw Logger - Main logging class
 * Provides structured logging with correlation IDs and configurable output
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { LogLevel } from './levels.js';
import { shouldLog } from './levels.js';
import { correlationContext } from './correlation.js';
import { LogFormatter, createLogEntry } from './formatter.js';

export interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Output format */
  format: 'json' | 'human';
  /** Enable file output */
  fileOutput: boolean;
  /** Log file path (relative to ~/.openclaw/data/slimclaw/) */
  logPath: string;
  /** Enable console output */
  consoleOutput: boolean;
  /** Include stack traces for errors */
  includeStackTrace: boolean;
  /** Enable colors in console output */
  colors: boolean;
  /** Component name for all logs from this logger */
  component?: string;
}

export interface LogContext {
  correlationId?: string;
  agentId?: string;
  sessionKey?: string;
  component?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Main SlimClaw logger class
 */
export class SlimClawLogger {
  private formatter: LogFormatter;
  private pendingWrites: Promise<void>[] = [];
  private logDir: string;

  constructor(private config: LoggerConfig, private context: LogContext = {}) {
    this.formatter = new LogFormatter({
      format: config.format,
      includeStackTrace: config.includeStackTrace,
      colors: config.colors,
    });

    this.logDir = join(homedir(), '.openclaw', 'data', 'slimclaw', config.logPath);
  }

  /**
   * Creates a child logger with additional context
   */
  child(context: Partial<LogContext>): SlimClawLogger {
    return new SlimClawLogger(this.config, {
      ...this.context,
      ...context,
    });
  }

  /**
   * Updates the logger configuration
   */
  updateConfig(config: Partial<LoggerConfig>): SlimClawLogger {
    return new SlimClawLogger(
      { ...this.config, ...config },
      this.context
    );
  }

  /**
   * Log at debug level
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, metadata);
  }

  /**
   * Log at info level
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  /**
   * Log at warn level
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata);
  }

  /**
   * Log at error level
   */
  error(message: string, error?: Error | Record<string, unknown>): void {
    let metadata: Record<string, unknown> | undefined;
    let errorObj: Error | undefined;

    if (error instanceof Error) {
      errorObj = error;
    } else if (error && typeof error === 'object') {
      metadata = error;
    }

    this.log('error', message, metadata, errorObj);
  }

  /**
   * Main logging method
   */
  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    error?: Error
  ): void {
    // Check if we should log this level
    if (!shouldLog(level, this.config.level)) {
      return;
    }

    // Get correlation ID from context or current correlation
    const correlationId = this.context.correlationId || correlationContext.getId();

    // Create log entry
    const entry = createLogEntry(level, message, {
      correlationId,
      ...(this.context.agentId && { agentId: this.context.agentId }),
      ...(this.context.sessionKey && { sessionKey: this.context.sessionKey }),
      ...(this.context.component || this.config.component) && { 
        component: this.context.component || this.config.component 
      },
      metadata: { ...this.context.metadata, ...metadata },
      ...(error && { error }),
    });

    // Format the entry
    const formatted = this.formatter.format(entry);

    // Output to console if enabled
    if (this.config.consoleOutput) {
      this.writeToConsole(level, formatted);
    }

    // Output to file if enabled
    if (this.config.fileOutput) {
      this.writeToFile(formatted);
    }
  }

  /**
   * Writes log to console using appropriate console method
   */
  private writeToConsole(level: LogLevel, message: string): void {
    switch (level) {
      case 'debug':
        console.debug(message);
        break;
      case 'info':
        console.info(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'error':
        console.error(message);
        break;
    }
  }

  /**
   * Writes log to file asynchronously
   */
  private writeToFile(message: string): void {
    const timestamp = new Date();
    const filename = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')}.log`;
    const filepath = join(this.logDir, filename);

    const writePromise = this.ensureLogDir()
      .then(() => writeFile(filepath, message + '\n', { flag: 'a' }))
      .catch(error => {
        console.error('Failed to write log to file:', error);
      });

    // Keep track of pending writes for graceful shutdown
    this.pendingWrites.push(writePromise);

    // Clean up completed writes
    writePromise.finally(() => {
      const index = this.pendingWrites.indexOf(writePromise);
      if (index >= 0) {
        this.pendingWrites.splice(index, 1);
      }
    });
  }

  /**
   * Ensures log directory exists
   */
  private async ensureLogDir(): Promise<void> {
    try {
      await mkdir(this.logDir, { recursive: true });
    } catch (error) {
      // Ignore error if directory already exists
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Waits for all pending log writes to complete
   */
  async flush(): Promise<void> {
    await Promise.all(this.pendingWrites);
  }

  /**
   * Logs optimization results in the specified format
   */
  logOptimization(data: {
    requestId: string;
    windowing?: boolean;
    trimmed?: number;
    tokensSaved?: number;
    cacheBreakpoints?: number;
    [key: string]: unknown;
  }): void {
    const parts: string[] = ['[SlimClaw]'];
    
    // Always include request ID
    parts.push(`requestId=${data.requestId}`);
    
    // Add other fields if present
    if (data.windowing !== undefined) {
      parts.push(`windowing=${data.windowing}`);
    }
    if (data.trimmed !== undefined) {
      parts.push(`trimmed=${data.trimmed}`);
    }
    if (data.tokensSaved !== undefined) {
      parts.push(`tokens_saved=${data.tokensSaved}`);
    }
    if (data.cacheBreakpoints !== undefined) {
      parts.push(`cache_breakpoints=${data.cacheBreakpoints}`);
    }

    // Add any additional fields
    Object.entries(data).forEach(([key, value]) => {
      if (!['requestId', 'windowing', 'trimmed', 'tokensSaved', 'cacheBreakpoints'].includes(key)) {
        parts.push(`${key}=${value}`);
      }
    });

    this.info(parts.join(' '));
  }
}

/**
 * Default logger configurations
 */
export const LoggerConfigs = {
  /**
   * Development configuration
   */
  development: (): LoggerConfig => ({
    level: 'debug',
    format: 'human',
    fileOutput: true,
    logPath: 'logs',
    consoleOutput: true,
    includeStackTrace: true,
    colors: true,
    component: 'SlimClaw',
  }),

  /**
   * Production configuration
   */
  production: (): LoggerConfig => ({
    level: 'info',
    format: 'json',
    fileOutput: true,
    logPath: 'logs',
    consoleOutput: true,
    includeStackTrace: false,
    colors: false,
    component: 'SlimClaw',
  }),

  /**
   * Testing configuration
   */
  testing: (): LoggerConfig => ({
    level: 'error',
    format: 'human',
    fileOutput: false,
    logPath: 'logs',
    consoleOutput: false,
    includeStackTrace: false,
    colors: false,
    component: 'SlimClaw',
  }),

  /**
   * Silent configuration (no output)
   */
  silent: (): LoggerConfig => ({
    level: 'error',
    format: 'human',
    fileOutput: false,
    logPath: 'logs',
    consoleOutput: false,
    includeStackTrace: false,
    colors: false,
    component: 'SlimClaw',
  }),
};

/**
 * Creates a logger from configuration
 */
export function createLogger(
  config: Partial<LoggerConfig> = {},
  context: LogContext = {}
): SlimClawLogger {
  const fullConfig = { ...LoggerConfigs.development(), ...config };
  return new SlimClawLogger(fullConfig, context);
}

/**
 * Creates a logger based on NODE_ENV
 */
export function createLoggerFromEnv(
  context: LogContext = {},
  overrides: Partial<LoggerConfig> = {}
): SlimClawLogger {
  const env = process.env.NODE_ENV || 'development';
  
  let baseConfig: LoggerConfig;
  switch (env) {
    case 'production':
      baseConfig = LoggerConfigs.production();
      break;
    case 'test':
      baseConfig = LoggerConfigs.testing();
      break;
    default:
      baseConfig = LoggerConfigs.development();
      break;
  }

  return new SlimClawLogger({ ...baseConfig, ...overrides }, context);
}