# ClawRouter Integration Design Document

## Overview

This document defines the integration of ClawRouter (@blockrun/clawrouter) into SlimClaw for intelligent model routing based on 15-dimension complexity scoring. The implementation uses a hybrid approach with circuit breaker pattern for reliability.

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ SlimClaw Plugin                                                 │
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │ RoutingService  │────│ IRoutingProvider                    │ │
│  │                 │    │ ┌─────────────┐ ┌─────────────────┐ │ │
│  │ - routeModel()  │    │ │ClawRouter   │ │HeuristicRouter  │ │ │
│  │ - getMetrics()  │    │ │Adapter      │ │                 │ │ │
│  │ - healthCheck() │    │ └─────────────┘ └─────────────────┘ │ │
│  └─────────────────┘    └─────────────────────────────────────┘ │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │CircuitBreaker   │    │RoutingMetrics                      │ │
│  │                 │    │                                     │ │
│  │ - CLOSED        │    │ - routingDecisions                  │ │
│  │ - OPEN          │    │ - circuitBreakerState              │ │
│  │ - HALF_OPEN     │    │ - providerLatency                  │ │
│  └─────────────────┘    │ - fallbackCount                    │ │
│                         └─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 2. IRoutingProvider Interface

```typescript
interface IRoutingProvider {
  /**
   * Route request to optimal model based on complexity analysis
   */
  route(request: RoutingRequest): Promise<RoutingResult>;
  
  /**
   * Health check for provider availability
   */
  healthCheck(): Promise<boolean>;
  
  /**
   * Provider-specific configuration
   */
  configure(config: ProviderConfig): void;
  
  /**
   * Provider metadata
   */
  readonly name: string;
  readonly version: string;
}

interface RoutingRequest {
  prompt: string;
  systemPrompt?: string;
  maxOutputTokens: number;
  contextWindow?: number;
  modelConstraints?: string[];
}

interface RoutingResult {
  recommendedModel: string;
  confidence: number;
  reasoning: string;
  metadata: {
    complexity: number;
    dimensions: Record<string, number>;
    fallbackUsed: boolean;
    latencyMs: number;
  };
}
```

## 3. Hybrid Routing Flow

```
Request Received
      │
      ▼
┌─────────────┐
│Circuit      │ No  ┌─────────────────┐
│Breaker      ├────▶│Use Heuristic    │
│CLOSED?      │     │Router           │
└─────────────┘     └─────────────────┘
      │ Yes                   │
      ▼                       ▼
┌─────────────┐         ┌─────────────┐
│ClawRouter   │         │Return       │
│route()      │         │Result       │
└─────────────┘         └─────────────┘
      │                       ▲
      ▼                       │
┌─────────────┐               │
│Success?     │ No            │
├─────────────┤               │
│ Yes │  No   │               │
└──┬──┴───┬───┘               │
   │      │                   │
   │      ▼                   │
   │ ┌─────────────┐         │
   │ │Record       │         │
   │ │Failure      │         │
   │ └─────────────┘         │
   │      │                  │
   │      ▼                  │
   │ ┌─────────────┐         │
   │ │Fallback to  │         │
   │ │Heuristic    │─────────┘
   │ └─────────────┘
   │
   ▼
┌─────────────┐
│Return       │
│Result       │
└─────────────┘
```

## 4. Circuit Breaker State Machine

```
Initial State: CLOSED

CLOSED ──[3 consecutive failures]──▶ OPEN
  ▲                                    │
  │                                    │
  │                              [60s timeout]
  │                                    │
  │                                    ▼
  │                               HALF_OPEN
  │                                    │
  │                              [test request]
  │                                    │
  │                            ┌───────┴───────┐
  │                            │               │
  │                         Success         Failure
  │                            │               │
  └────────────────────────────┘               │
                                               ▼
                                             OPEN

State Behaviors:
- CLOSED: Normal operation, ClawRouter primary
- OPEN: All requests use heuristic fallback
- HALF_OPEN: Single test request to ClawRouter, others fallback
```

## 5. Metrics Extension

Extended SlimClaw metrics with routing-specific fields:

```typescript
interface RoutingMetrics extends BaseMetrics {
  routing: {
    // Decision tracking
    routingDecisions: {
      clawrouter: number;
      heuristic: number;
      fallback: number;
    };
    
    // Circuit breaker state
    circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    circuitBreakerTransitions: number;
    
    // Provider performance
    providerLatency: {
      clawrouter: {
        avg: number;
        p95: number;
        p99: number;
      };
      heuristic: {
        avg: number;
        p95: number;
        p99: number;
      };
    };
    
    // Accuracy tracking (when ground truth available)
    routingAccuracy?: {
      correct: number;
      total: number;
      confidenceDistribution: number[];
    };
  };
}
```

## 6. Configuration Schema

```typescript
interface ClawRouterConfig {
  // Provider selection
  primaryProvider: 'clawrouter' | 'heuristic';
  fallbackProvider: 'clawrouter' | 'heuristic';
  
  // Circuit breaker settings
  circuitBreaker: {
    failureThreshold: number;        // default: 3
    cooldownMs: number;              // default: 60000
    testInterval: number;            // default: 1 (every nth request in HALF_OPEN)
  };
  
  // ClawRouter specific
  clawrouter: {
    timeoutMs: number;              // default: 5000
    retryAttempts: number;          // default: 1
    modelPricing?: ModelPricing;    // optional pricing data
    complexityWeights?: {           // optional dimension weights
      [dimension: string]: number;
    };
  };
  
  // Heuristic fallback
  heuristic: {
    rules: HeuristicRule[];
    defaultModel: string;
  };
  
  // Metrics
  metrics: {
    enabled: boolean;               // default: true
    trackAccuracy: boolean;         // default: false
    historySize: number;           // default: 1000
  };
}

interface HeuristicRule {
  condition: string;                // prompt length, keywords, etc.
  model: string;
  priority: number;
}
```

## 7. Risks & Mitigations

### 7.1 External Dependency Risk
**Risk:** ClawRouter service unavailability impacts routing decisions.
**Mitigation:** 
- Circuit breaker auto-fallback to heuristic routing
- Local caching of recent routing decisions (optional)
- Configurable timeout and retry policies

### 7.2 Performance Risk
**Risk:** Routing adds latency to request processing.
**Mitigation:**
- Aggressive timeout (5s default)
- Async routing with fallback for time-sensitive requests
- Metrics tracking to monitor performance impact

### 7.3 Accuracy Risk
**Risk:** Incorrect routing leads to suboptimal model selection.
**Mitigation:**
- Hybrid approach preserves heuristic fallback
- Confidence scoring for routing decisions
- Optional accuracy tracking when ground truth available

### 7.4 Configuration Complexity
**Risk:** Multiple routing providers increase configuration complexity.
**Mitigation:**
- Sensible defaults for all configuration options
- Runtime configuration validation
- Clear documentation and examples

### 7.5 Memory Usage
**Risk:** Metrics and caching increase memory footprint.
**Mitigation:**
- Configurable history sizes
- Periodic cleanup of old metrics
- Optional features can be disabled

### 7.6 Version Compatibility
**Risk:** ClawRouter API changes break integration.
**Mitigation:**
- Adapter pattern isolates ClawRouter dependency
- Version pinning in package.json
- Graceful degradation on API errors

## Implementation Notes

1. **Shadow Mode Compatibility:** All routing decisions are observational initially - no impact on existing SlimClaw behavior until explicitly enabled.

2. **Gradual Rollout:** Circuit breaker allows gradual migration from heuristic to ClawRouter with automatic fallback on issues.

3. **Monitoring:** Comprehensive metrics enable monitoring of routing accuracy and performance impact.

4. **Extensibility:** IRoutingProvider interface allows future integration of additional routing providers.

---
*Document Version: 1.0*  
*Last Updated: 2026-02-19*  
*Lines: 347*