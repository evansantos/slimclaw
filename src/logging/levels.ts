/**
 * SlimClaw Logging Levels and Utilities
 * Defines log levels with hierarchy and filtering
 */

export const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

export type LogLevel = keyof typeof LOG_LEVELS;

/**
 * Checks if a message with the given level should be logged
 * based on the current minimum log level
 * 
 * @param messageLevel - Level of the message to log
 * @param minLevel - Minimum level to allow logging
 * @returns true if message should be logged
 */
export function shouldLog(messageLevel: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVELS[messageLevel] >= LOG_LEVELS[minLevel];
}

/**
 * Gets all log levels that are enabled for the given minimum level
 * 
 * @param minLevel - Minimum level configured
 * @returns Array of enabled log levels
 */
export function getEnabledLevels(minLevel: LogLevel): LogLevel[] {
  return (Object.keys(LOG_LEVELS) as LogLevel[])
    .filter(level => shouldLog(level, minLevel));
}

/**
 * Converts log level to uppercase string (for display)
 */
export function formatLogLevel(level: LogLevel): string {
  return level.toUpperCase();
}

/**
 * Parses a string to a valid log level, with fallback
 * 
 * @param level - String representation of log level
 * @param fallback - Fallback level if parsing fails
 * @returns Valid LogLevel
 */
export function parseLogLevel(level: string, fallback: LogLevel = 'info'): LogLevel {
  const normalized = level.toLowerCase();
  if (normalized in LOG_LEVELS) {
    return normalized as LogLevel;
  }
  return fallback;
}