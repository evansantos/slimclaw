import { DEFAULT_MODEL_PRICING } from './pricing.js';

/**
 * Configuration for dynamic pricing cache
 */
export interface DynamicPricingConfig {
  /** Enable dynamic pricing (if false, always use hardcoded pricing) */
  enabled: boolean;
  /** OpenRouter API URL for model data */
  openRouterApiUrl: string;
  /** Cache TTL in milliseconds (default: 6 hours) */
  cacheTtlMs: number;
  /** Fetch timeout in milliseconds */
  fetchTimeoutMs: number;
  /** Fallback to hardcoded pricing on fetch failure */
  fallbackToHardcoded: boolean;
}

/**
 * Pricing data for a model
 */
interface ModelPricing {
  /** Input cost per 1000 tokens */
  inputPer1k: number;
  /** Output cost per 1000 tokens */
  outputPer1k: number;
  /** Timestamp when this data was fetched */
  fetchedAt: number;
}

/**
 * OpenRouter API response structure
 */
interface OpenRouterModel {
  id: string;
  pricing: {
    prompt: string;    // Per-token price as string
    completion: string; // Per-token price as string
  };
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

/**
 * Dynamic pricing cache with TTL-based refresh from OpenRouter API.
 * 
 * Provides live pricing data for routing decisions with graceful fallback
 * to hardcoded pricing when API is unavailable.
 */
export class DynamicPricingCache {
  private readonly config: DynamicPricingConfig;
  private readonly cache = new Map<string, ModelPricing>();
  private lastFetch: number | null = null;
  private fetching = false;

  constructor(config: DynamicPricingConfig) {
    this.config = config;
  }

  /**
   * Get pricing for a model. Triggers background refresh if stale.
   * Returns synchronously - either cached data, or hardcoded fallback.
   * 
   * @param model - Model ID (e.g., "openai/gpt-4.1-nano")
   * @returns Pricing data (never null)
   */
  getPricing(model: string): { inputPer1k: number; outputPer1k: number } {
    // If disabled, always use hardcoded
    if (!this.config.enabled) {
      return this.getHardcodedPricing(model);
    }

    // Check cache first
    const cached = this.cache.get(model);
    if (cached && !this.isStale(cached.fetchedAt)) {
      return {
        inputPer1k: cached.inputPer1k,
        outputPer1k: cached.outputPer1k
      };
    }

    // Trigger background refresh if needed
    if (this.shouldRefresh()) {
      this.backgroundRefresh();
    }

    // Return cached if available, otherwise hardcoded
    if (cached) {
      return {
        inputPer1k: cached.inputPer1k,
        outputPer1k: cached.outputPer1k
      };
    }

    return this.getHardcodedPricing(model);
  }

  /**
   * Force refresh from OpenRouter API.
   * 
   * @returns Promise that resolves to true on success, false on failure
   */
  async refresh(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    this.fetching = true;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.fetchTimeoutMs);

      const response = await fetch(this.config.openRouterApiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const jsonResponse = await response.json();
      const data = jsonResponse as OpenRouterResponse;
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid API response format');
      }

      // Process and cache relevant models only
      const relevantPrefixes = ['openai/', 'anthropic/', 'google/', 'deepseek/', 'meta-llama/', 'qwen/'];
      let processed = 0;

      for (const model of data.data) {
        // Filter to relevant providers only
        if (!relevantPrefixes.some(prefix => model.id.startsWith(prefix))) {
          continue;
        }

        if (model.pricing && model.pricing.prompt && model.pricing.completion) {
          try {
            // Convert per-token to per-1k
            const inputPer1k = parseFloat(model.pricing.prompt) * 1000;
            const outputPer1k = parseFloat(model.pricing.completion) * 1000;

            if (inputPer1k > 0 && outputPer1k > 0) {
              this.cache.set(model.id, {
                inputPer1k,
                outputPer1k,
                fetchedAt: Date.now()
              });
              processed++;
            }
          } catch (error) {
            // Skip invalid pricing data
            continue;
          }
        }
      }

      this.lastFetch = Date.now();
      this.fetching = false;

      return processed > 0;

    } catch (error) {
      this.fetching = false;
      
      // Log error but don't throw - graceful degradation
      if (typeof console !== 'undefined') {
        console.warn(`[DynamicPricingCache] Fetch failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      return false;
    }
  }

  /**
   * Get cache statistics for observability.
   */
  getStats(): {
    /** Number of models cached */
    models: number;
    /** Last successful fetch timestamp */
    lastFetch: number | null;
    /** Whether cache is stale */
    stale: boolean;
  } {
    return {
      models: this.cache.size,
      lastFetch: this.lastFetch,
      stale: this.lastFetch ? this.isStale(this.lastFetch) : true
    };
  }

  /**
   * Get hardcoded pricing fallback
   */
  private getHardcodedPricing(model: string): { inputPer1k: number; outputPer1k: number } {
    const pricing = DEFAULT_MODEL_PRICING[model];
    if (pricing) {
      return {
        inputPer1k: pricing.inputPer1k,
        outputPer1k: pricing.outputPer1k
      };
    }

    // Ultra-generic fallback for unknown models
    return {
      inputPer1k: 0.001, // $1 per million tokens
      outputPer1k: 0.002  // $2 per million tokens
    };
  }

  /**
   * Check if a timestamp is stale
   */
  private isStale(timestamp: number): boolean {
    return Date.now() - timestamp > this.config.cacheTtlMs;
  }

  /**
   * Check if we should trigger a refresh
   */
  private shouldRefresh(): boolean {
    // Don't refresh if already fetching
    if (this.fetching) {
      return false;
    }

    // Refresh if never fetched or stale
    return !this.lastFetch || this.isStale(this.lastFetch);
  }

  /**
   * Trigger background refresh (fire and forget)
   */
  private backgroundRefresh(): void {
    this.refresh().catch(() => {
      // Ignore errors - refresh() already handles logging
    });
  }
}

/**
 * Default configuration for dynamic pricing
 */
export const DEFAULT_DYNAMIC_PRICING_CONFIG: DynamicPricingConfig = {
  enabled: true,
  openRouterApiUrl: 'https://openrouter.ai/api/v1/models',
  cacheTtlMs: 6 * 60 * 60 * 1000, // 6 hours
  fetchTimeoutMs: 5000,
  fallbackToHardcoded: true
};