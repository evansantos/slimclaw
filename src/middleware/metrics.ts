/**
 * OptimizerMetrics - Tracking básico para SlimClaw middleware
 * Coleta métricas de otimização para análise de performance
 */

export interface OptimizerMetrics {
  /** Unique request identifier */
  requestId: string;
  /** ISO timestamp */
  timestamp: string;
  /** Agent that generated this request */
  agentId: string;
  /** Session key */
  sessionKey: string;

  // — Input state (before optimization) —
  originalTokens: number;
  originalMessageCount: number;

  // — Optimization results —
  optimizedTokens: number;
  optimizedMessageCount: number;
  savings: number; // percentage (0-100)

  // — Applied optimizations —
  windowingApplied: boolean;
  cacheInjected: boolean;

  // — Windowing details —
  trimmedMessages?: number;
  summaryTokens?: number;
  summarizationMethod?: 'none' | 'heuristic' | 'llm';

  // — Cache details —
  cacheBreakpointsInjected?: number;

  // — Performance —
  processingTimeMs: number;
}

/**
 * MetricsCollector - Ring buffer simples para métricas em memória
 */
export class MetricsCollector {
  private buffer: OptimizerMetrics[] = [];
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Registra uma métrica no ring buffer
   */
  record(metrics: OptimizerMetrics): void {
    this.buffer.push(metrics);
    
    // Maintain ring buffer size
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  /**
   * Obtém todas as métricas do buffer
   */
  getAll(): OptimizerMetrics[] {
    return [...this.buffer];
  }

  /**
   * Obtém métricas recentes (últimas N)
   */
  getRecent(count: number): OptimizerMetrics[] {
    return this.buffer.slice(-count);
  }

  /**
   * Estatísticas agregadas
   */
  getStats(): {
    totalRequests: number;
    averageOriginalTokens: number;
    averageOptimizedTokens: number;
    averageSavings: number;
    windowingUsagePercent: number;
    cacheUsagePercent: number;
  } {
    if (this.buffer.length === 0) {
      return {
        totalRequests: 0,
        averageOriginalTokens: 0,
        averageOptimizedTokens: 0,
        averageSavings: 0,
        windowingUsagePercent: 0,
        cacheUsagePercent: 0,
      };
    }

    const total = this.buffer.length;
    const avgOriginal = this.buffer.reduce((sum, m) => sum + m.originalTokens, 0) / total;
    const avgOptimized = this.buffer.reduce((sum, m) => sum + m.optimizedTokens, 0) / total;
    const avgSavings = this.buffer.reduce((sum, m) => sum + m.savings, 0) / total;
    const windowingUsed = this.buffer.filter(m => m.windowingApplied).length;
    const cacheUsed = this.buffer.filter(m => m.cacheInjected).length;

    return {
      totalRequests: total,
      averageOriginalTokens: Math.round(avgOriginal),
      averageOptimizedTokens: Math.round(avgOptimized),
      averageSavings: Math.round(avgSavings * 100) / 100,
      windowingUsagePercent: Math.round((windowingUsed / total) * 100),
      cacheUsagePercent: Math.round((cacheUsed / total) * 100),
    };
  }

  /**
   * Limpa o buffer
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Status de debug do collector
   */
  getStatus(): string {
    const stats = this.getStats();
    if (stats.totalRequests === 0) {
      return "🔍 SlimClaw Optimizer - No metrics yet";
    }

    return [
      "🔍 SlimClaw Optimizer Metrics",
      "",
      `Total requests: ${stats.totalRequests}`,
      `Avg tokens: ${stats.averageOriginalTokens} → ${stats.averageOptimizedTokens}`,
      `Average savings: ${stats.averageSavings}%`,
      "",
      `Windowing used: ${stats.windowingUsagePercent}% of requests`,
      `Caching used: ${stats.cacheUsagePercent}% of requests`,
    ].join("\n");
  }
}

/**
 * Helper para criar métricas básicas
 */
export function createMetrics(
  requestId: string,
  agentId: string,
  sessionKey: string,
  originalTokens: number,
  originalMessageCount: number,
  optimizedTokens: number,
  optimizedMessageCount: number,
  windowingApplied: boolean,
  cacheInjected: boolean,
  processingTimeMs: number
): OptimizerMetrics {
  const savings = originalTokens > 0 
    ? ((originalTokens - optimizedTokens) / originalTokens) * 100
    : 0;

  return {
    requestId,
    timestamp: new Date().toISOString(),
    agentId,
    sessionKey,
    originalTokens,
    originalMessageCount,
    optimizedTokens,
    optimizedMessageCount,
    savings,
    windowingApplied,
    cacheInjected,
    processingTimeMs,
  };
}