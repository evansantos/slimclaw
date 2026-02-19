---
name: slimclaw
description: Token optimization plugin for OpenClaw. Use when monitoring inference costs, analyzing cache efficiency, viewing token savings, or configuring windowing/routing optimizations. Provides /slimclaw command for metrics and a dashboard for visualization.
---

# SlimClaw - Token Optimization Plugin

Inference optimization middleware for OpenClaw — windowing, routing, caching.

## Installation

```bash
npm install slimclaw
```

Or clone directly:
```bash
cd ~/.openclaw/plugins
git clone https://github.com/evansantos/slimclaw.git
cd slimclaw && npm install && npm run build
```

## Package

- **npm**: `slimclaw`
- **GitHub**: https://github.com/evansantos/slimclaw

## Commands

### `/slimclaw`

Shows current metrics:
- Total requests processed
- Input/output tokens
- Cache reads/writes  
- Cache hit rate (%)
- Estimated token savings
- Routing decisions and tier distribution
- Model downgrade percentage

Example output:
```
📊 SlimClaw Metrics
───────────────────
📊 Total requests: 42
📥 Input tokens: 15,230
📤 Output tokens: 8,450
💾 Cache reads: 12,500
✍️ Cache writes: 3,200
📈 Cache hit rate: 79.6%
💰 Est. savings: ~10,000 tokens
```

## Configuration

Create `~/.openclaw/plugins/slimclaw/slimclaw.config.json`:

```json
{
  "enabled": true,
  "mode": "shadow",
  "dashboard": {
    "enabled": true,
    "port": 3333
  },
  "windowing": {
    "enabled": true,
    "maxTokens": 100000,
    "preserveRecent": 10
  },
  "cache": {
    "enabled": true,
    "minContentLength": 1000
  },
  "routing": {
    "enabled": true,
    "defaultModel": "anthropic/claude-sonnet-4"
  }
}
```

### Config Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable/disable plugin |
| `mode` | `"shadow"` | `"shadow"` (observe only) or `"active"` (optimize) |
| `dashboard.enabled` | `true` | Enable web dashboard |
| `dashboard.port` | `3333` | Dashboard HTTP port |
| `windowing.enabled` | `true` | Enable context windowing |
| `windowing.maxTokens` | `100000` | Max tokens before windowing |
| `cache.enabled` | `true` | Enable cache breakpoint injection |
| `routing.enabled` | `false` | Enable ClawRouter model routing |
| `routing.allowDowngrade` | `true` | Allow routing to cheaper models |
| `routing.minConfidence` | `0.4` | Min confidence for routing decisions |
| `routing.pinnedModels` | `[]` | Models exempt from routing |
| `routing.tiers.*` | `haiku/sonnet/opus` | Model mapping by complexity tier |
| `routing.reasoningBudget` | `10000` | Thinking token budget for reasoning |
| `routing.pricing` | `undefined` | Custom model pricing overrides (per 1k tokens) |

## Dashboard

When enabled, access at `http://localhost:3333`

Features:
- Real-time metrics display
- Token savings chart over time
- Cache hit rate visualization
- Cost savings estimation
- Dark theme UI

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Dashboard HTML |
| `GET /api/metrics` | Current metrics JSON |
| `GET /api/stats` | Aggregated statistics |
| `GET /api/routing-stats` | Routing metrics and tier distribution |
| `GET /health` | Health check |

## Troubleshooting

### Plugin not loading

```bash
cd ~/.openclaw/plugins/slimclaw
npm run build
openclaw gateway restart
```

Verify with `/slimclaw` command.

### Dashboard not accessible

1. Check config: `dashboard.enabled: true`
2. Restart OpenClaw: `openclaw gateway restart`
3. Check port is free: `lsof -i :3333`
4. Try: `http://localhost:3333` or `http://<your-ip>:3333`

### Metrics showing zeros

- Metrics reset on restart
- Make some chat requests to populate data
- Check OpenClaw logs for SlimClaw hook activity

### Build errors

```bash
cd ~/.openclaw/plugins/slimclaw
rm -rf dist node_modules
npm install
npm run build
```

## Development

```bash
# Run tests
npm test

# Watch mode
npm run dev

# Build
npm run build
```

## Migration: Heuristic to Hybrid ClawRouter

SlimClaw now uses **hybrid routing** combining ClawRouter as primary classifier with heuristic fallback:

### What Changed

**Before** (Pure Heuristic):
- Simple keyword matching
- Basic message length thresholds
- Limited accuracy on edge cases

**After** (Hybrid ClawRouter):
- ClawRouter complexity scoring (primary)
- Heuristic fallback with circuit breaker
- Code pattern recognition
- Reasoning complexity detection
- Graceful fallback to heuristics

### Configuration Migration

Update your config to enable routing:

```json
{
  "routing": {
    "enabled": true,
    "minConfidence": 0.4,
    "allowDowngrade": true
  }
}
```

### Custom Pricing

Override built-in model pricing to keep cost estimates accurate:

```json
{
  "routing": {
    "enabled": true,
    "pricing": {
      "anthropic/claude-sonnet-4-20250514": { "inputPer1k": 0.003, "outputPer1k": 0.015 }
    }
  }
}
```

Custom pricing merges with defaults — only override what changed.

### Backward Compatibility

- All existing configs continue working
- `routing.enabled: false` preserves old behavior
- No breaking changes to API or commands

## Current Limitations

- **Shadow mode only**: `llm_input`/`llm_output` hooks are observation-only
- Active optimization blocked on [OpenClaw #20416](https://github.com/openclaw/openclaw/issues/20416)
- See [SlimClaw #1](https://github.com/evansantos/slimclaw/issues/1) for tracking
