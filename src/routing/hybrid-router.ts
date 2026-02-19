import type { IRoutingProvider, RoutingDecision } from './types.js';

/**
 * Circuit breaker states
 */
enum CircuitBreakerState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Circuit breaker tripped, skip primary
  HALF_OPEN = 'half-open' // Testing if primary has recovered
}

/**
 * Hybrid router that combines primary and fallback providers with circuit breaker
 */
export class HybridRouter implements IRoutingProvider {
  public readonly name: string;
  
  private circuitState: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly maxFailures = 3;
  private readonly cooldownMs = 60000; // 60 seconds
  private readonly confidenceThreshold = 0.5;

  constructor(
    private readonly primaryProvider: IRoutingProvider,
    private readonly fallbackProvider: IRoutingProvider
  ) {
    this.name = `hybrid(${primaryProvider.name},${fallbackProvider.name})`;
  }

  /**
   * Router is available if at least one provider is available
   */
  isAvailable(): boolean {
    return this.primaryProvider.isAvailable() || this.fallbackProvider.isAvailable();
  }

  /**
   * Route using primary provider with fallback and circuit breaker logic
   */
  route(text: string, contextTokens: number, config?: Record<string, unknown>): RoutingDecision {
    let primaryDecision: RoutingDecision | null = null;
    let primaryError: Error | null = null;

    // Try primary provider unless circuit is open
    if (this.shouldTryPrimary()) {
      try {
        primaryDecision = this.primaryProvider.route(text, contextTokens, config);
        this.onPrimarySuccess();
        
        // If primary confidence is sufficient, use it
        if (primaryDecision.confidence >= this.confidenceThreshold) {
          return primaryDecision;
        }
      } catch (error) {
        primaryError = error instanceof Error ? error : new Error(String(error));
        this.onPrimaryFailure();
      }
    }

    // Try fallback provider
    if (!this.fallbackProvider.isAvailable()) {
      if (primaryError) {
        throw primaryError;
      }
      if (primaryDecision) {
        return primaryDecision;
      }
      throw new Error('No providers available');
    }

    try {
      const fallbackDecision = this.fallbackProvider.route(text, contextTokens, config);
      
      // Return the decision with higher confidence, preferring fallback on ties
      if (primaryDecision && primaryDecision.confidence > fallbackDecision.confidence) {
        return primaryDecision;
      }
      
      return fallbackDecision;
    } catch (fallbackError) {
      // Both providers failed
      if (primaryDecision) {
        // Return primary decision even with low confidence if fallback fails
        return primaryDecision;
      }
      
      // Both failed completely
      const error = primaryError || (fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)));
      throw new Error(`All routing providers failed: ${error.message}`);
    }
  }

  /**
   * Determine if we should try the primary provider based on circuit breaker state
   */
  private shouldTryPrimary(): boolean {
    if (!this.primaryProvider.isAvailable()) {
      return false;
    }

    switch (this.circuitState) {
      case CircuitBreakerState.CLOSED:
        return true;
        
      case CircuitBreakerState.OPEN:
        // Check if cooldown period has passed
        if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
          this.circuitState = CircuitBreakerState.HALF_OPEN;
          return true;
        }
        return false;
        
      case CircuitBreakerState.HALF_OPEN:
        return true;
        
      default:
        return false;
    }
  }

  /**
   * Handle successful primary provider call
   */
  private onPrimarySuccess(): void {
    this.failureCount = 0;
    if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
      this.circuitState = CircuitBreakerState.CLOSED;
    }
  }

  /**
   * Handle failed primary provider call
   */
  private onPrimaryFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.maxFailures) {
      this.circuitState = CircuitBreakerState.OPEN;
    } else if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
      this.circuitState = CircuitBreakerState.OPEN;
    }
  }

  /**
   * Get current circuit breaker status (for monitoring/debugging)
   */
  getCircuitStatus(): {
    state: CircuitBreakerState;
    failureCount: number;
    lastFailureTime: number;
  } {
    return {
      state: this.circuitState,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }

  /**
   * Manual circuit breaker reset (for testing or manual intervention)
   */
  resetCircuit(): void {
    this.circuitState = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}