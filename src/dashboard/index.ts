/**
 * SlimClaw Dashboard - Metrics visualization exports
 * Main entry point for dashboard functionality
 */

// Server and configuration
export { DashboardServer, startDashboard } from './server.js';
export type { DashboardConfig } from './server.js';

// Import for internal use
import type { DashboardConfig } from './server.js';

// Route setup
export { setupRoutes } from './routes.js';

// Types and interfaces
export interface DashboardMetrics {
  timestamp: string;
  totalRequests: number;
  tokensSaved: {
    total: number;
    average: number;
    percentage: number;
  };
  cacheHitRate: number;
  breakdown: {
    windowing: number;
    cache: number;
    routing: number;
    modelDowngrade: number;
  };
  averageLatencyMs: number;
  totalCostSaved: number;
  complexityDistribution: {
    simple: number;
    mid: number;
    complex: number;
    reasoning: number;
  };
  systemStatus: {
    enabled: boolean;
    bufferSize: number;
    pendingFlush: number;
    totalProcessed: number;
  };
}

export interface HistoryDataPoint {
  timestamp: string;
  label: string;
  metrics: {
    requests: number;
    tokensSaved: number;
    averageLatency: number;
    cacheHitRate: number;
    savingsPercentage: number;
    complexityDistribution: {
      simple: number;
      mid: number;
      complex: number;
      reasoning: number;
    };
  };
}

export interface HistoryResponse {
  period: 'hour' | 'day' | 'week';
  timeFormat: string;
  data: HistoryDataPoint[];
}

/**
 * Create dashboard instance with default configuration
 */
import type { MetricsCollector } from '../metrics/index.js';
import { DashboardServer } from './server.js';

export function createDashboard(collector: MetricsCollector, port = 3001) {
  return new DashboardServer(collector, { port, host: '0.0.0.0', basePath: '' });
}

/**
 * Dashboard utility functions
 */
export class DashboardUtils {
  /**
   * Format token count for display
   */
  static formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  }

  /**
   * Format percentage for display
   */
  static formatPercentage(value: number, decimals = 1): string {
    return `${value.toFixed(decimals)}%`;
  }

  /**
   * Format currency for display
   */
  static formatCurrency(amount: number, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  }

  /**
   * Calculate savings percentage
   */
  static calculateSavingsPercentage(original: number, optimized: number): number {
    if (original === 0) return 0;
    return ((original - optimized) / original) * 100;
  }

  /**
   * Generate color palette for charts
   */
  static getChartColors(): {
    primary: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
    secondary: string;
  } {
    return {
      primary: '#3B82F6',   // Blue
      success: '#10B981',   // Green
      warning: '#F59E0B',   // Yellow
      danger: '#EF4444',    // Red
      info: '#8B5CF6',      // Purple
      secondary: '#6B7280', // Gray
    };
  }

  /**
   * Generate time labels for different periods
   */
  static generateTimeLabels(period: 'hour' | 'day' | 'week', count: number): string[] {
    const labels: string[] = [];
    const now = new Date();

    for (let i = count - 1; i >= 0; i--) {
      const date = new Date(now);

      switch (period) {
        case 'hour':
          date.setHours(date.getHours() - i);
          labels.push(date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          }));
          break;
        case 'day':
          date.setDate(date.getDate() - i);
          labels.push(date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          }));
          break;
        case 'week':
          date.setDate(date.getDate() - (i * 7));
          labels.push(`Week of ${date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          })}`);
          break;
      }
    }

    return labels;
  }

  /**
   * Validate dashboard configuration
   */
  static validateConfig(config: Partial<DashboardConfig>): string[] {
    const errors: string[] = [];

    if (config.port !== undefined) {
      if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
        errors.push('Port must be an integer between 1 and 65535');
      }
    }

    if (config.host !== undefined) {
      if (typeof config.host !== 'string' || config.host.length === 0) {
        errors.push('Host must be a non-empty string');
      }
    }

    if (config.basePath !== undefined) {
      if (typeof config.basePath !== 'string') {
        errors.push('basePath must be a string');
      }
    }

    return errors;
  }
}

/**
 * Default dashboard configuration
 */
export const DEFAULT_DASHBOARD_CONFIG = {
  port: 3001,
  host: '0.0.0.0',
  basePath: '',
};

/**
 * Dashboard error types
 */
export class DashboardError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'DashboardError';
  }
}

/**
 * Connection error for dashboard server
 */
export class DashboardConnectionError extends DashboardError {
  constructor(message: string, public port: number) {
    super(message, 'CONNECTION_ERROR', 500);
  }
}

/**
 * Data error for metrics processing
 */
export class DashboardDataError extends DashboardError {
  constructor(message: string) {
    super(message, 'DATA_ERROR', 400);
  }
}