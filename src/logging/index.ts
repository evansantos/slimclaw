/**
 * SlimClaw Logging System - Main exports
 * 
 * Provides structured logging with correlation IDs, configurable output,
 * and integration with SlimClaw optimization pipeline.
 */

// Import types for internal use
import type { LogLevel } from './levels.js';
import type { LogContext, SlimClawLogger } from './logger.js';
import { createLoggerFromEnv } from './logger.js';

// Main logger class and configuration
export {
  SlimClawLogger,
  createLogger,
  createLoggerFromEnv,
  LoggerConfigs,
  type LoggerConfig,
  type LogContext,
} from './logger.js';

// Log levels and utilities
export {
  LOG_LEVELS,
  shouldLog,
  getEnabledLevels,
  formatLogLevel,
  parseLogLevel,
  type LogLevel,
} from './levels.js';

// Correlation ID management
export {
  generateCorrelationId,
  isValidCorrelationId,
  correlationContext,
  extractOrGenerateCorrelationId,
  withCorrelation,
  correlationAware,
} from './correlation.js';

// Formatting utilities
export {
  LogFormatter,
  createLogEntry,
  Formatters,
  type LogEntry,
  type FormatterOptions,
} from './formatter.js';

// Helper function to create a logger with SlimClaw defaults
export function createSlimClawLogger(
  level: LogLevel = 'info',
  context: LogContext = {}
): SlimClawLogger {
  return createLoggerFromEnv(context, {
    level,
    component: 'SlimClaw',
  });
}

// Helper to create request-scoped logger with correlation ID
export function createRequestLogger(
  requestId: string,
  agentId?: string,
  sessionKey?: string
): SlimClawLogger {
  const context: { correlationId: string; agentId?: string; sessionKey?: string } = {
    correlationId: requestId,
  };
  if (agentId !== undefined) context.agentId = agentId;
  if (sessionKey !== undefined) context.sessionKey = sessionKey;
  
  return createSlimClawLogger('debug', context);
}