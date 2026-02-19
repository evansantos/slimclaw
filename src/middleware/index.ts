/**
 * SlimClaw Middleware - Exports
 * Exporta principais funções e tipos do middleware de otimização
 */

// Optimizer principal
export {
  inferenceOptimizer,
  generateDebugHeaders,
  shouldOptimize,
  createOptimizationContext,
  type OptimizedResult,
  type OptimizationContext,
  type Message,
} from './optimizer.js';

// Métricas e tracking
export {
  MetricsCollector,
  createMetrics,
  type OptimizerMetrics,
} from './metrics.js';