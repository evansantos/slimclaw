/**
 * Cache utility functions
 */

/**
 * Calculate cache hit rate as a percentage
 *
 * @param cacheHits - Number of cache hits
 * @param totalRequests - Total number of requests
 * @returns Cache hit rate as percentage (0-100) with 2 decimal places
 */
export function calculateCacheHitRate(cacheHits: number, totalRequests: number): number {
  if (totalRequests === 0) {
    return 0;
  }

  // Calculate percentage and round to 2 decimal places
  return Math.round((cacheHits / totalRequests) * 10000) / 100;
}
