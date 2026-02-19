# SlimClaw 🦞

Token optimization plugin for OpenClaw. Tracks cache hits, measures savings, and provides real-time metrics.

## Features

- **Metrics Tracking** — Input/output tokens, cache reads/writes, estimated savings
- **Cache Breakpoint Injection** — Optimizes Anthropic's prompt caching
- **Dashboard** — Dark theme web UI at `http://localhost:3333`
- **Shadow Mode** — Measures without modifying requests (safe to run)

## Installation

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

## Coming Soon

- **ClawRouter Integration** — Use ClawRouter's 15-dimension scorer for model routing
- **Active Mode** — Actually apply optimizations (pending OpenClaw hook mutation support)

## License

MIT
