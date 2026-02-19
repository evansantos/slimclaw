# SlimClaw - Token Optimization Plugin

Token metrics and cache optimization for OpenClaw.

## Commands

### `/slimclaw`
Shows current metrics:
- Total requests
- Input/output tokens
- Cache reads/writes
- Cache hit rate
- Estimated savings

## Configuration

Edit `~/.openclaw/plugins/slimclaw/slimclaw.config.json`:

```json
{
  "enabled": true,
  "dashboard": {
    "enabled": true,
    "port": 3333
  }
}
```

## Dashboard

When enabled, access at `http://localhost:3333`

Shows:
- Requests count
- Tokens saved
- Cache hit rate
- Cost saved
- Token savings chart over time

## Troubleshooting

### Plugin not loading
```bash
cd ~/.openclaw/plugins/slimclaw
npm run build
openclaw gateway restart
```

### Dashboard not accessible
1. Check `slimclaw.config.json` has `dashboard.enabled: true`
2. Restart OpenClaw
3. Check port 3333 is free: `lsof -i :3333`

### Metrics showing 0
Metrics reset on restart. Make some requests to see data.
