# SlimClaw 🔥

[![npm version](https://img.shields.io/npm/v/@openclaw/slimclaw.svg)](https://www.npmjs.com/package/@openclaw/slimclaw)
[![Build Status](https://img.shields.io/github/actions/workflow/status/evansantos/slimclaw/ci.yml)](https://github.com/evansantos/slimclaw/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Token optimization plugin for OpenClaw** — Reduce AI inference costs by 60-80% through intelligent windowing, caching, and model routing.

## Overview

SlimClaw is an OpenClaw plugin that measures and optimizes token usage for AI inference requests. Currently running in **shadow mode** (measurement only), it provides detailed metrics on potential savings without modifying your actual requests.

### Current Status: Shadow Mode MVP
- 📊 **Token savings measurement**: Track potential optimizations across all requests
- 📈 **Real-time metrics**: Monitor cache hits, windowing opportunities, and routing recommendations
- 🔍 **Observability**: Detailed logging and optional dashboard for visualization
- 🚧 **Non-intrusive**: Measures savings without modifying requests (shadow mode)

### Expected Savings: 60-80% Total
| Optimization | Potential Savings | Status |
|--------------|-------------------|--------|
| **Windowing** | ~61% | 📊 Measured |
| **Cache Injection** | ~10-15% | ✅ Active |
| **Model Routing** | ~20-30% | 📊 Measured |

*Note: Cache injection is active and provides real savings. Windowing and routing are measured but not yet applied to actual requests.*

## Installation

### Option A: Git Clone (Recommended)

```bash
# Navigate to OpenClaw plugins directory
cd ~/.openclaw/plugins

# Clone the repository
git clone https://github.com/evansantos/slimclaw.git

# Install dependencies and build
cd slimclaw
npm install
npm run build
```

### Option B: npm (Coming Soon)

```bash
# Global installation (future)
npm install -g @openclaw/slimclaw

# Or in plugins directory
cd ~/.openclaw/plugins
npm install @openclaw/slimclaw
```

## Configuration

### 1. Enable Plugin in OpenClaw

Add SlimClaw to your OpenClaw configuration:

```json
{
  "plugins": {
    "load": {
      "paths": [
        "~/.openclaw/plugins/slimclaw"
      ]
    }
  }
}
```

The plugin will be auto-discovered via `openclaw.plugin.json` manifest.

### 2. Plugin Configuration

Configure SlimClaw behavior (optional - defaults work for most use cases):

```json
{
  "plugins": {
    "config": {
      "slimclaw": {
        "enabled": true,
        "mode": "shadow",
        "metrics": {
          "enabled": true,
          "logLevel": "summary"
        },
        "cacheBreakpoints": {
          "enabled": true,
          "minContentLength": 1000,
          "provider": "anthropic"
        },
        "dashboard": {
          "enabled": false,
          "port": 3333
        }
      }
    }
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable SlimClaw plugin |
| `mode` | string | `"shadow"` | Plugin mode: `"shadow"` or `"active"` |
| `metrics.enabled` | boolean | `true` | Enable metrics collection |
| `metrics.logLevel` | string | `"summary"` | Log level: `"silent"`, `"summary"`, `"verbose"` |
| `cacheBreakpoints.enabled` | boolean | `true` | Enable cache breakpoint injection |
| `cacheBreakpoints.minContentLength` | number | `1000` | Minimum content length for caching |
| `dashboard.enabled` | boolean | `false` | Enable metrics dashboard |
| `dashboard.port` | number | `3333` | Dashboard server port |

## Usage

### 1. Restart OpenClaw Gateway

After installation, restart the OpenClaw gateway to load the plugin:

```bash
openclaw gateway restart
```

### 2. Verify Plugin Registration

Check the logs for successful plugin registration:

```bash
# Check gateway logs
tail -f ~/.openclaw/logs/gateway.log | grep -i slimclaw
```

You should see:
```
SlimClaw registered - metrics: true, cache: true
SlimClaw cache breakpoint injection enabled
SlimClaw ready - /slimclaw for metrics
```

### 3. Monitor Metrics

SlimClaw provides several ways to monitor token optimization:

#### Command Line Status
```bash
# In any OpenClaw chat, use:
/slimclaw
```

This shows current metrics:
- Total requests processed
- Token usage statistics
- Cache hit rates
- Estimated savings
- Configuration status

#### Log Output
Based on your `logLevel` setting:

- **`summary`**: Shows cache hits and significant savings
- **`verbose`**: Detailed per-request metrics
- **`silent`**: No automatic logging

Example log output:
```
[SlimClaw] Cache hit: 1,200 tokens (~15% savings)
[SlimClaw] claude-sonnet-4 | In: 8000 | Out: 450 | Cache R/W: 1200/800 | Savings: 15.0%
```

#### Optional Dashboard
Enable the web dashboard for real-time visualization:

```json
{
  "dashboard": {
    "enabled": true,
    "port": 3333
  }
}
```

Then visit `http://localhost:3333` for charts and metrics.

## Current Limitations

### Shadow Mode Only
- **Measurement without mutation**: SlimClaw currently measures potential savings but doesn't modify actual requests
- **Cache injection exception**: Only cache breakpoints are actively applied (real savings)
- **Full optimization pending**: Requires OpenClaw core changes for complete active mode

### Model Routing
- **Recommendations only**: Plugin can suggest better models but cannot override the model selected by OpenClaw
- **No cost enforcement**: Cannot prevent expensive model usage, only measure and recommend

### OpenClaw Integration
- **Plugin API constraints**: Limited by current OpenClaw plugin hook system
- **Requires core PR**: Full active optimization needs deeper OpenClaw integration

## Roadmap

### Phase 1: Active Optimization Mode ⏳
- **Active windowing**: Actually reduce conversation history
- **Smart model routing**: Automatically route simple requests to cheaper models
- **Cost controls**: Set token budgets and model usage policies
- **Requires**: OpenClaw core plugin API enhancements

### Phase 2: Enhanced Distribution 📦
- **npm package**: Published as `@openclaw/slimclaw`
- **Auto-installation**: One-command setup
- **Version management**: Automatic updates and compatibility checking

### Phase 3: Advanced Features 🚀
- **Multi-session caching**: Share cache across conversations
- **LLM-powered summaries**: Optional Claude-based conversation summarization
- **Cost analytics**: Detailed cost breakdown and budgeting
- **Team dashboards**: Organization-wide optimization metrics

## Troubleshooting

### Plugin Not Loading
1. Verify file permissions: `ls -la ~/.openclaw/plugins/slimclaw/`
2. Check build output: `npm run build` in plugin directory
3. Restart gateway: `openclaw gateway restart`
4. Check logs: `tail -f ~/.openclaw/logs/gateway.log`

### No Metrics Showing
1. Ensure `metrics.enabled: true` in configuration
2. Make some AI requests to generate data
3. Use `/slimclaw` command to check status
4. Verify log level is not set to `"silent"`

### Dashboard Not Accessible
1. Check `dashboard.enabled: true` and `port` configuration
2. Ensure port is not in use by another application
3. Check firewall settings for the specified port

## Contributing

SlimClaw is open source! Contributions welcome:

1. Fork the repository: https://github.com/evansantos/slimclaw
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Run tests: `npm test`
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Built for [OpenClaw](https://openclaw.ai)** • Reduce AI costs intelligently 🔥