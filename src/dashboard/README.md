# SlimClaw Dashboard

Real-time metrics visualization dashboard for SlimClaw optimization performance.

## Overview

The SlimClaw Dashboard provides a web-based interface to visualize token savings, optimization performance, and system metrics in real-time. It includes interactive charts, live metrics cards, and historical data analysis.

## Features

- **Real-time Metrics**: Live updates every 30 seconds
- **Interactive Charts**: Token savings over time, optimization breakdown, complexity distribution
- **Performance Tracking**: Cache hit rates, latency metrics, cost savings
- **Historical Analysis**: View metrics by hour, day, or week
- **System Status**: Monitor buffer sizes, pending flushes, and system health

## Quick Start

### 1. Start the Dashboard

```typescript
import { MetricsCollector, startDashboard } from 'slimclaw';

const collector = new MetricsCollector(config);
const dashboard = await startDashboard(collector, { port: 3001 });

console.log(`Dashboard running at http://localhost:3001`);
```

### 2. Access the Dashboard

Open your browser to `http://localhost:3001` to view the dashboard.

## API Endpoints

The dashboard server provides several REST API endpoints:

### GET `/metrics/optimizer`

Returns current optimizer metrics summary:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "totalRequests": 1247,
  "tokensSaved": {
    "total": 45820,
    "average": 36.7,
    "percentage": 23.4
  },
  "cacheHitRate": 67,
  "breakdown": {
    "windowing": 45,
    "cache": 67,
    "routing": 23,
    "modelDowngrade": 12
  },
  "averageLatencyMs": 1240,
  "totalCostSaved": 2.34,
  "complexityDistribution": {
    "simple": 234,
    "mid": 567,
    "complex": 389,
    "reasoning": 57
  },
  "systemStatus": {
    "enabled": true,
    "bufferSize": 100,
    "pendingFlush": 3,
    "totalProcessed": 1247
  }
}
```

### GET `/metrics/history`

Returns historical metrics data with optional period parameter:

**Parameters:**
- `period`: `hour` | `day` | `week` (default: `hour`)
- `limit`: Maximum number of data points (default: `100`)

**Example:**
```bash
curl "http://localhost:3001/metrics/history?period=day&limit=7"
```

### GET `/metrics/raw`

Returns raw metrics data for debugging:

**Parameters:**
- `limit`: Maximum number of records (default: `20`)

### GET `/health`

Health check endpoint:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "metrics": {
    "enabled": true,
    "totalProcessed": 1247,
    "bufferSize": 100
  }
}
```

## Configuration

### Dashboard Configuration

```typescript
interface DashboardConfig {
  port: number;      // Server port (default: 3001)
  host: string;      // Server host (default: '0.0.0.0')
  basePath: string;  // Base path for routes (default: '')
}
```

### Example with Custom Config

```typescript
const dashboard = await startDashboard(collector, {
  port: 8080,
  host: 'localhost',
  basePath: '/slimclaw'
});
```

## Dashboard Components

### 1. Metrics Cards

Four main metric cards display:
- **Total Requests**: Number of requests processed
- **Tokens Saved**: Total and percentage of tokens saved
- **Cache Hit Rate**: Percentage of requests using cache
- **Cost Saved**: Total cost savings in USD

### 2. Token Savings Chart

Line chart showing token savings over time with:
- Primary axis: Tokens saved
- Secondary axis: Request count
- Time period selector (hour/day/week)

### 3. Optimization Breakdown

Doughnut chart showing distribution of optimization techniques:
- Windowing usage percentage
- Cache usage percentage  
- Routing usage percentage
- Other optimizations

### 4. Complexity Distribution

Bar chart showing request complexity distribution:
- Simple requests
- Mid-complexity requests
- Complex requests
- Reasoning requests

### 5. System Status Panel

Real-time system information:
- System enabled/disabled status
- Buffer size and pending flushes
- Average latency
- Feature usage percentages

## Customization

### Custom Styling

The dashboard uses Tailwind CSS with custom styles in `/static/style.css`. You can override styles by modifying this file or adding your own CSS.

### Custom Charts

Charts are created using Chart.js. You can modify chart configurations in `/static/charts.js`:

```javascript
// Example: Customize chart colors
const customColors = {
  primary: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444'
};
```

### Auto-refresh Rate

Modify the refresh rate in `charts.js`:

```javascript
class SlimClawDashboard {
  constructor() {
    this.refreshRate = 30000; // 30 seconds (change this)
  }
}
```

## Testing

Run the dashboard tests:

```bash
npm test src/dashboard
```

Test specific components:

```bash
# Test API routes
npm test src/dashboard/__tests__/routes.test.ts

# Test server functionality  
npm test src/dashboard/__tests__/server.test.ts
```

## Troubleshooting

### Dashboard Won't Start

1. **Port in use**: Try a different port or kill the process using the port
2. **Permission denied**: Use a port > 1024 or run with sudo (not recommended)
3. **Missing dependencies**: Run `npm install` to ensure all dependencies are installed

### No Data Showing

1. **Metrics not enabled**: Check that `config.metrics.enabled = true`
2. **No metrics collected**: Ensure SlimClaw is processing requests
3. **Browser cache**: Hard refresh the page (Ctrl+F5)

### Connection Errors

1. **CORS issues**: Check browser console for CORS errors
2. **Network restrictions**: Ensure firewall isn't blocking the port
3. **API endpoint issues**: Check server logs for API errors

## Architecture

```
src/dashboard/
├── server.ts      # Hono server setup
├── routes.ts      # API endpoint definitions  
├── views/
│   └── index.html # Main dashboard HTML
├── public/
│   ├── style.css  # Custom CSS styles
│   └── charts.js  # Chart.js integration
└── __tests__/     # Test files
```

## Dependencies

- **Hono**: Lightweight web framework
- **@hono/node-server**: Node.js adapter for Hono
- **Chart.js**: Charting library
- **Tailwind CSS**: Utility-first CSS framework

## Performance Notes

- Dashboard auto-refreshes every 30 seconds by default
- Metrics are served from in-memory ring buffer for fast access
- Historical data is grouped to reduce payload size
- Charts use efficient update methods to avoid full re-renders

## Security Considerations

- Dashboard binds to `0.0.0.0` by default - restrict host in production
- No authentication built-in - add reverse proxy with auth if needed
- CORS enabled for localhost development - review for production
- Consider HTTPS in production environments