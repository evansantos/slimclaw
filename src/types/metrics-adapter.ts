/**
 * Adapter interface for metrics collectors
 *
 * This interface defines the minimal subset of MetricsCollector methods
 * that the dashboard actually uses, avoiding the need for `as any` casts.
 */

import type { MetricsCollector } from '../metrics/index.js';

/**
 * Subset of MetricsCollector that the dashboard requires
 *
 * This allows different implementations (like SlimClawMetricsAdapter)
 * to be used with the dashboard without needing to implement the full
 * MetricsCollector interface.
 */
export type MetricsCollectorAdapter = Pick<
  MetricsCollector,
  'getAll' | 'getRecent' | 'getStats' | 'getStatus'
>;
