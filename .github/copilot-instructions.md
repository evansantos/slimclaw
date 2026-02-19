# SlimClaw - GitHub Copilot Instructions

## Project Summary

SlimClaw is a token optimization plugin for OpenClaw (AI assistant framework) that provides intelligent inference optimization through:

- **Context windowing** - Trimming old messages to reduce token usage
- **Cache breakpoint injection** - Leveraging Anthropic prompt caching for efficiency
- **Intelligent model routing** - Hybrid ClawRouter integration with heuristic fallback and circuit breaker
- **Metrics collection** - Dashboard visualization and performance analytics

**Tech Stack:** TypeScript, Node.js 22, Vitest (testing), Hono (dashboard server)  
**Package:** `slimclaw` - OpenClaw plugin with npm distribution

## Architecture & Layout

```
src/
├── middleware/       # Core optimizer pipeline
├── classifier/       # Complexity classification (heuristic + ClawRouter bridge)
├── routing/         # IRoutingProvider interface, ClawRouter adapter, hybrid router
├── metrics/         # OptimizerMetrics types, collector, reporter (ring buffer + JSONL)
├── dashboard/       # Hono server, routes, views (dark theme HTML)
├── logging/         # Structured logger with correlation IDs
├── windowing/       # Message trimming and summarization
├── cache/           # Cache breakpoint injection logic
└── config.ts        # Zod-validated config from slimclaw.config.json
openclaw.plugin.json # OpenClaw plugin manifest
```

**Key Interfaces:**
- `OptimizerMetrics` - Complete optimization metrics with token/cost tracking
- `IRoutingProvider` - Abstraction for routing providers (ClawRouter, heuristic)
- `RoutingDecision` - Model selection result with tier, confidence, reasoning
- `ClassificationResult` - Complexity analysis with scores and signals

## Build, Test, Lint Commands

```bash
npm install                                    # Install dependencies
npm run build                                 # tsc + copy assets (dashboard views/public)
npm test -- --run                            # vitest, all tests
npm test -- --run src/routing/__tests__/     # specific test directory
npm run dev                                   # tsc --watch for development
npm run test:coverage                         # vitest with coverage report
```

## Code Standards & Conventions

**TypeScript:**
- Strict mode enabled (`exactOptionalPropertyTypes: true`)
- No `any` types, no `as` casts unless justified with comments
- Use `undefined` explicitly for optional fields due to exactOptionalPropertyTypes

**Testing (TDD mandatory):**
- RED → GREEN → REFACTOR workflow
- Tests colocated in `__tests__/` directories
- Use vitest + vi.mock for mocking
- All async functions must have try/catch with graceful degradation

**Architecture:**
- Barrel exports in each directory's `index.ts`
- Structured logging with correlation IDs
- Configuration via local `slimclaw.config.json` (not OpenClaw schema)
- Error handling: graceful degradation, never crash the host

## CI/CD

- **GitHub Actions:** `.github/workflows/` - CI tests on Node.js 22 only
- **Publish workflow:** Includes `dry_run` option for safe releases
- **PR Reviews:** Copilot reviews all pull requests automatically

## Common Pitfalls

**External Dependencies:**
- `@blockrun/clawrouter` must be mocked in tests (external dependency)
- Mock must include `DEFAULT_ROUTING_CONFIG` export for routing tests
- ClawRouter integration requires proper error handling and circuit breaker

**Data Handling:**
- `RoutingDecision.tier` may be uppercase - always normalize with `.toLowerCase()`
- Dashboard tests need `MetricsReporter` passed to `MetricsCollector` constructor
- JSONL metrics files can be corrupted - handle JSON.parse errors gracefully

**Configuration:**
- `exactOptionalPropertyTypes` requires explicit `undefined` for optional fields
- Dashboard server handles port conflicts gracefully (EADDRINUSE)
- Config validation with Zod - provide meaningful error messages
- `routing.pricing` overrides merge with `DEFAULT_MODEL_PRICING` — user config wins
- Use `resetHybridRouter()` in tests to clear the singleton between test runs

## Review Checklist for PRs

**Build & Test:**
- [ ] All tests pass (`npm test -- --run`)
- [ ] Build passes (`npm run build`)
- [ ] No TypeScript errors or warnings

**Code Quality:**
- [ ] No new `any` types without justification
- [ ] New functions have corresponding tests
- [ ] Error handling includes graceful degradation
- [ ] Async functions wrapped in try/catch

**Metrics & Performance:**
- [ ] Metrics fields populated correctly in OptimizerMetrics
- [ ] Routing decisions include confidence scores
- [ ] Performance impact measured and acceptable
- [ ] Memory usage doesn't grow unbounded

**Integration:**
- [ ] ClawRouter integration handles failures gracefully
- [ ] Dashboard updates work with new metrics
- [ ] Plugin integrates cleanly with OpenClaw middleware

---

*For detailed examples and integration patterns, see `SKILL.md` and the test suites.*