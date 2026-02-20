# SlimClaw 🦞

[![npm version](https://img.shields.io/npm/v/slimclaw)](https://www.npmjs.com/package/slimclaw)
[![CI](https://github.com/evansantos/slimclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/evansantos/slimclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Advanced inference optimization plugin for OpenClaw. Provides intelligent model routing, cross-provider pricing, dynamic cost tracking, latency monitoring, and prompt caching optimization across 12+ models on Anthropic and OpenRouter.

**0 vulnerabilities** · **618 tests passing** · **Node 22+**

## Features

### 🎯 Intelligent Routing
- **[ClawRouter](https://github.com/BlockRunAI/clawrouter) Integration** — 15-dimension complexity scoring as primary classifier, with heuristic fallback
- **Cross-Provider Support** — Route across Anthropic and OpenRouter providers seamlessly
- **Tier-Based Classification** — Automatic model selection based on request complexity (simple/mid/complex/reasoning)
- **Provider Resolution** — Glob-pattern matching for intelligent provider selection (`openai/*` → openrouter)
- **Shadow Mode** — Observe routing decisions without mutation (active mode blocked on OpenClaw hooks)

### 📊 Metrics & Analytics
- **Request Tracking** — Input/output tokens, cache reads/writes, estimated savings per request
- **Dynamic Pricing** — Live pricing data from OpenRouter API with 6-hour TTL caching
- **Latency Monitoring** — Per-model P50/P95/avg latency tracking with circular buffer (100 samples default)
- **Dashboard** — Real-time web UI at `http://localhost:3333` with dark theme

### 💾 Caching Optimization
- **Cache Breakpoint Injection** — Optimizes Anthropic's prompt caching for maximum efficiency
- **Smart Windowing** — Maintains conversation context while minimizing redundant tokens
- **90% Cache Savings** — Cache reads are significantly cheaper than regular input tokens

### 🔮 Shadow Mode
- **Risk-Free Operation** — All routing runs in observe-only mode, no request mutation
- **Comprehensive Logging** — Detailed routing decisions with cost projections and provider recommendations
- **Full Pipeline Simulation** — Complete shadow execution of classify → resolve → recommend → log

## Installation

### From npm

```bash
npm install slimclaw
```

### From source

```bash
git clone https://github.com/evansantos/slimclaw ~/.openclaw/plugins/slimclaw
cd ~/.openclaw/plugins/slimclaw
npm install
npm run build
```

## Configuration

Create `slimclaw.config.json` in the plugin folder:

```json
{
  "enabled": true,
  "mode": "shadow",
  "windowing": {
    "enabled": true,
    "maxMessages": 10,
    "maxTokens": 4000,
    "summarizeThreshold": 8
  },
  "routing": {
    "enabled": true,
    "allowDowngrade": true,
    "minConfidence": 0.4,
    "pinnedModels": ["anthropic/claude-opus-4-20250514"],
    "tiers": {
      "simple": "anthropic/claude-3-haiku-20240307",
      "mid": "anthropic/claude-sonnet-4-20250514",
      "complex": "anthropic/claude-opus-4-20250514",
      "reasoning": "anthropic/claude-opus-4-20250514"
    },
    "tierProviders": {
      "openai/*": "openrouter",
      "anthropic/*": "anthropic",
      "google/*": "openrouter"
    },
    "openRouterHeaders": {
      "HTTP-Referer": "https://slimclaw.dev",
      "X-Title": "SlimClaw v0.2.0"
    },
    "shadowLogging": true,
    "reasoningBudget": 10000,
    "pricing": {
      "anthropic/claude-sonnet-4-20250514": {
        "inputPer1k": 0.003,
        "outputPer1k": 0.015
      }
    },
    "dynamicPricing": {
      "enabled": true,
      "ttlMs": 21600000,
      "refreshIntervalMs": 21600000,
      "timeoutMs": 10000,
      "apiUrl": "https://openrouter.ai/api/v1/models"
    },
    "latencyTracking": {
      "enabled": true,
      "bufferSize": 100,
      "outlierThresholdMs": 60000
    }
  },
  "caching": {
    "enabled": true,
    "injectBreakpoints": true,
    "minContentLength": 1000
  },
  "metrics": {
    "enabled": true,
    "logLevel": "summary",
    "flushIntervalMs": 30000
  },
  "dashboard": {
    "enabled": true,
    "port": 3333,
    "cors": false
  }
}
```

## Usage

### Command

```bash
/slimclaw
```

Shows current metrics: requests, tokens, cache hits, savings, and routing statistics.

### Dashboard

When `dashboard.enabled: true`, access the web UI at:

```
http://localhost:3333
```

Or from your network: `http://<your-ip>:3333`

### API Endpoints

- `GET /metrics/optimizer` — Current metrics summary
- `GET /metrics/history?period=hour&limit=24` — Historical data
- `GET /metrics/raw` — Raw metrics for debugging
- `GET /api/routing-stats` — Routing decision statistics
- `GET /health` — Health check

## Architecture

SlimClaw implements a comprehensive routing pipeline that operates in shadow mode:

### Routing Pipeline

1. **Classification** → [ClawRouter](https://github.com/BlockRunAI/clawrouter) analyzes request complexity across 15 dimensions, assigns tier (simple/mid/complex/reasoning). Falls back to built-in heuristic classifier on failure (circuit breaker pattern).
2. **Provider Resolution** → Map model patterns to providers using glob matching (`openai/*` → openrouter)
3. **Shadow Recommendation** → Generate complete routing decision without mutation
4. **Structured Logging** → Output detailed recommendations with cost analysis

### Shadow Mode

SlimClaw v0.2.0 operates exclusively in **shadow mode** due to OpenClaw's current hook limitations:

- **Observes** all requests and generates routing recommendations
- **Logs** what routing decisions would be made with cost projections
- **Tracks** dynamic pricing and latency for routing intelligence
- **Cannot mutate** requests until OpenClaw supports `historyMessages` mutation

**Example Shadow Log:**
```
[SlimClaw] 🔮 Shadow route: opus-4-6 → o4-mini (via openrouter)
           Tier: reasoning (0.92) | Savings: 78% | $0.045/1k → $0.003/1k
```

### Model Tier Mapping

| Complexity | Default Model | Use Cases |
|------------|---------------|-----------|
| `simple` | Claude 3 Haiku | Basic Q&A, simple tasks, casual chat |
| `mid` | Claude 4 Sonnet | General development, analysis, writing |
| `complex` | Claude 4 Opus | Architecture, complex debugging, research |
| `reasoning` | Claude 4 Opus | Multi-step logic, planning, deep analysis |

## API Reference

### Core Routing

```typescript
import { 
  resolveModel, 
  buildShadowRecommendation,
  makeRoutingDecision,
  type ShadowRecommendation 
} from './routing/index.js';

// Generate routing decision
const decision = resolveModel(classification, routingConfig, context);

// Build complete shadow recommendation
const recommendation = buildShadowRecommendation(
  runId, actualModel, decision, tierProviders, pricing
);
```

### Dynamic Pricing

```typescript
import { DynamicPricingCache, DEFAULT_DYNAMIC_PRICING_CONFIG } from './routing/dynamic-pricing.js';

const pricing = new DynamicPricingCache({
  enabled: true,
  openRouterApiUrl: 'https://openrouter.ai/api/v1/models',
  cacheTtlMs: 21600000,    // 6 hours
  fetchTimeoutMs: 5000,
  fallbackToHardcoded: true
});

// Get live pricing (sync — falls back to hardcoded if cache miss)
const cost = pricing.getPricing('openai/gpt-4-turbo');
// { inputPer1k: 0.01, outputPer1k: 0.03 }

// Refresh cache from OpenRouter API (async)
await pricing.refresh();
```

### Latency Tracking

```typescript
import { LatencyTracker, DEFAULT_LATENCY_TRACKER_CONFIG, type LatencyStats } from './routing/latency-tracker.js';

const tracker = new LatencyTracker({
  enabled: true,
  windowSize: 100,         // circular buffer per model
  outlierThresholdMs: 60000
});

// Record request latency (tokenCount optional — enables throughput calc)
tracker.recordLatency('anthropic/claude-sonnet-4-20250514', 2500, 150);

// Get statistics
const stats: LatencyStats | null = tracker.getLatencyStats('anthropic/claude-sonnet-4-20250514');
// { p50: 2100, p95: 4500, avg: 2300, min: 1800, max: 5200, count: 87, tokensPerSecond: 45.2 }
```

### Provider Resolution

```typescript
import { resolveProvider, type ProviderResolution } from './routing/provider-resolver.js';

const resolution = resolveProvider('openai/gpt-4-turbo', {
  'openai/*': 'openrouter',
  'anthropic/*': 'anthropic'
});
// { provider: 'openrouter', matchedPattern: 'openai/*', confidence: 1.0 }
```

## Status

### Version 0.2.0

- **618 tests passing** across 43 test files
- **3 major phases** complete:
  - **Phase 1:** Cross-provider pricing (PR #24)
  - **Phase 2a:** Shadow routing (PR #25)  
  - **Phase 3a:** Dynamic pricing + latency tracking (PR #29)
- **12+ models supported** across Anthropic and OpenRouter providers
- **Shadow mode only** — active routing blocked on OpenClaw hook mutation support
- **0 vulnerabilities** — clean security audit

### Cross-Provider Coverage

| Provider | Models | Pricing | Status |
|----------|--------|---------|--------|
| Anthropic | Claude 3/4 series | ✅ Dynamic + Hardcoded | Production |
| OpenRouter | 12+ models (OpenAI, Google, etc.) | ✅ Live API pricing | Production |

### Roadmap

- **Active Mode** — Waiting on OpenClaw hook mutation support ([#20416](https://github.com/openclaw/openclaw/issues/20416))
- **Budget Enforcement** — Per-session/daily spend limits with automatic tier capping
- **A/B Testing** — Route percentages across providers to compare quality/cost tradeoffs
- **Multi-Factor Routing** — Combine cost + latency + quality signals for optimal model selection

### Dependencies

> **Note:** `@blockrun/clawrouter` pulls `viem` as a transitive dependency (~50 packages). This doesn't affect functionality but adds to `node_modules` size. See [BlockRunAI/clawrouter#1](https://github.com/BlockRunAI/clawrouter/issues/1) for tracking.

## Contributing

PRs welcome! The project uses branch protection with CI + [GitSniff](https://gitsniff.ai) review.

```bash
git clone https://github.com/evansantos/slimclaw
cd slimclaw
npm install
npm test
```

### Development

- **TypeScript** — Full type safety with strict checking
- **Testing** — 618 tests with full coverage across routing pipeline
- **ESLint** — Enforced code style and quality
- **Branch Protection** — All changes require PR review

## License

MIT