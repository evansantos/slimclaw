# SlimClaw 🦞

[![npm version](https://img.shields.io/npm/v/slimclaw)](https://www.npmjs.com/package/slimclaw)
[![CI](https://github.com/evansantos/slimclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/evansantos/slimclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Token optimization plugin for OpenClaw. Tracks cache hits, measures savings, provides real-time metrics, and integrates intelligent model routing via [ClawRouter](https://github.com/BlockRunAI/clawrouter).

**0 vulnerabilities** · **Node 22+**

## Features

- **Metrics Tracking** — Input/output tokens, cache reads/writes, estimated savings
- **Cache Breakpoint Injection** — Optimizes Anthropic's prompt caching
- **Intelligent Model Routing** — Hybrid ClawRouter + heuristic classification for cost optimization
- **Dashboard** — Dark theme web UI at `http://localhost:3333`
- **Shadow Mode** — Measures without modifying requests (safe to run)

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
  "metrics": {
    "enabled": true,
    "logLevel": "summary"
  },
  "cacheBreakpoints": {
    "enabled": true,
    "minContentLength": 1000
  },
  "dashboard": {
    "enabled": true,
    "port": 3333
  }
}
```

## Usage

### Command

```
/slimclaw
```

Shows current metrics: requests, tokens, cache hits, savings.

### Dashboard

When `dashboard.enabled: true`, access the web UI at:

```
http://localhost:3333
```

Or from your network: `http://<your-ip>:3333`

### API Endpoints

- `GET /metrics/optimizer` — Current metrics summary
- `GET /metrics/history?period=hour&limit=24` — Historical data

## How It Works

SlimClaw hooks into OpenClaw's LLM request/response cycle:

1. **llm_input** — Estimates input tokens before request
2. **llm_output** — Captures actual usage from API response (input, output, cache read/write)
3. **Calculates savings** — Cache reads are 90% cheaper than regular input

The savings percentage shows how much you're benefiting from Anthropic's prompt caching.

## ClawRouter Integration

SlimClaw integrates with [ClawRouter](https://github.com/BlockRunAI/clawrouter) for intelligent model routing via a hybrid approach: ClawRouter as primary classifier with a built-in heuristic fallback.

### Features

- **Hybrid Routing** — ClawRouter primary classification with heuristic fallback for reliability
- **Circuit Breaker Behavior** — Graceful fallback to original model on classification failures
- **Combined Savings** — Windowing optimizations plus intelligent routing reduce costs by 30-60%

### Model Tier Mapping

| Complexity | Model | Use Cases |
|------------|-------|-----------|
| `simple` | Claude 3 Haiku | Basic Q&A, simple tasks, casual chat |
| `mid` | Claude 4 Sonnet | General development, analysis, writing |
| `complex` | Claude 4 Opus | Architecture, complex debugging, research |
| `reasoning` | Claude 4 Opus | Multi-step logic, planning, deep analysis |

### Configuration

Add routing config to `slimclaw.config.json` (see [Configuration](#configuration) for full options):

```json
{
  "enabled": true,
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
    "reasoningBudget": 10000
  }
}
```

### API Usage

The routing system implements the `IRoutingProvider` interface:

```typescript
import { HybridRouter } from 'slimclaw/routing/hybrid-router';
import { ClawRouterAdapter } from 'slimclaw/routing/clawrouter-adapter';
import { HeuristicProvider } from 'slimclaw/routing/heuristic-provider';

// Create hybrid router (ClawRouter primary, heuristic fallback)
const router = new HybridRouter(
  new ClawRouterAdapter(),
  new HeuristicProvider()
);

// Get routing decision
const decision = router.route('Explain quantum computing', 5000);
console.log(`Model: ${decision.model}, Tier: ${decision.tier}`);
console.log(`Confidence: ${decision.confidence}, Savings: ${decision.savings}%`);
```

### Routing Behavior

1. **Classification** — Messages analyzed by ClawRouter (or heuristic fallback) to determine complexity tier
2. **Confidence Check** — Low confidence (< 0.4) keeps original model
3. **Override Processing** — Headers, pinned models, and config overrides respected
4. **Model Selection** — Tier mapped to configured model with downgrade protection
5. **Fallback** — Errors gracefully fall back to original model

### Custom Pricing

Override default model pricing in `slimclaw.config.json` to keep costs accurate as providers update rates:

```json
{
  "routing": {
    "enabled": true,
    "pricing": {
      "anthropic/claude-sonnet-4-20250514": { "inputPer1k": 0.003, "outputPer1k": 0.015 },
      "anthropic/claude-3-haiku-20240307": { "inputPer1k": 0.00025, "outputPer1k": 0.00125 }
    }
  }
}
```

> **Note:** `@blockrun/clawrouter` pulls `viem` as a transitive dependency (~50 packages). This doesn't affect functionality but adds to `node_modules` size. See [BlockRunAI/clawrouter#1](https://github.com/BlockRunAI/clawrouter/issues/1) for tracking.

## Status

- **v0.1.0** published on [npm](https://www.npmjs.com/package/slimclaw)
- **Observation mode** — routing classifies and logs recommendations without mutating model selection
- **Active mode blocked** — waiting for OpenClaw `historyMessages` mutation support ([#20416](https://github.com/openclaw/openclaw/issues/20416))
- **9 open issues** — see [issues](https://github.com/evansantos/slimclaw/issues)
- **8 PRs merged** — including ClawRouter integration, routing classification, GitSniff fixes

## Contributing

PRs welcome! The project uses branch protection — all changes go through PR with CI + [GitSniff](https://gitsniff.ai) review.

```bash
git clone https://github.com/evansantos/slimclaw
cd slimclaw
npm install
npm test
```

## License

MIT
