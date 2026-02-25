# Changelog

All notable changes to SlimClaw are documented here.

## [0.4.0] — 2026-02-21

### Added

#### Provider Proxy Phase 1: Active Routing
- **Virtual Model System** — `slimclaw/auto` model with intelligent complexity-based routing
- **HTTP Sidecar Server** — Local proxy on port 3334, receives OpenAI-format requests
- **Request Forwarder** — OpenRouter integration with streaming, proper auth, timeout/abort
- **Provider Plugin** — Full `api.registerProvider()` integration with OpenClaw
- **Config Schema** — `proxy` section with Zod validation (port, virtualModels, providerOverrides, timeout)
- **Service Lifecycle** — Sidecar managed via `api.registerService()` (start/stop)
- **Pipeline Reuse** — 100% reuse of existing classifier, router, budget, and A/B testing components

### How It Works
1. Set `model: "slimclaw/auto"` in OpenClaw config
2. SlimClaw classifies prompt complexity → selects optimal tier model
3. Request forwards to real provider (OpenRouter) with streaming
4. Budget enforcement and A/B testing apply to proxied requests

---

## [0.3.0] — 2026-02-21

### Added

#### Phase 3a: Dynamic Pricing & Latency Tracking
- Dynamic pricing cache with OpenRouter API integration (6h TTL)
- Latency tracker with per-model/provider P50/P95/P99 percentile stats
- Sliding window latency data (configurable retention)

#### Phase 3b: Budget Enforcement & A/B Testing (Shadow Mode)
- **BudgetTracker** — daily/weekly spending caps per tier with sliding window resets
- Enforcement actions: `downgrade`, `block`, `alert-only` (configurable per tier)
- Alert thresholds with callback support (e.g., 80% budget warning)
- **ABTestManager** — deterministic hash-based experiment assignment
- Outcome tracking with statistical significance testing (chi-squared)
- Experiment lifecycle: active → concluded with winner selection
- Kahan summation for floating-point precision in cost accumulation
- Budget persistence foundation (`serialize`/`fromSnapshot`) for Phase 2b

### Changed
- Extended config schema with Zod validation for `budget` and `abTesting` sections
- `ROUTING_VERSION` bumped to `0.3.0`
- `DEFAULT_ROUTING_CONFIG` extended with budget + A/B testing defaults
- README rewritten with progressive installation and configuration guides

### Stats
- 706 tests across 48 test files (0 failures)
- Full review pipeline: BUG ✅ → ARCH ✅ (6 findings fixed) → SPEC ✅

## [0.2.0] — 2026-02-20

### Added

#### Phase 1: Cross-Provider Pricing
- Cross-provider model pricing for 12+ models (Anthropic + OpenRouter)
- Tier inference from model IDs (`openai/o4-mini` → reasoning, `google/gemini-2.5-pro` → complex)
- Tier-based downgrade detection across providers
- Pricing module (`src/routing/pricing.ts`) with hardcoded defaults and custom overrides

#### Phase 2a: Shadow Routing
- **Provider Resolver** — glob-pattern matching for `tierProviders` config (e.g., `openai/*` → openrouter)
- **Shadow Router** — generates routing recommendations without mutating requests
- **Routing Decision** orchestrator — full pipeline: classify → resolve provider → recommend → log
- OpenRouter header generation (`HTTP-Referer`, `X-Title`) for API compliance
- Shadow logging integrated into `llm_input`/`llm_output` hooks
- Config: `tierProviders`, `openRouterHeaders`, `shadowLogging` options
- Tightened `tierProviders` Zod validation (non-empty keys)

#### Phase 3a: Dynamic Pricing + Latency Tracking
- **Dynamic Pricing Cache** — live pricing from OpenRouter `/api/v1/models` with configurable TTL (default 6h)
- **Latency Tracker** — per-model circular buffer (default 100 samples) with P50/P95/avg/min/max/throughput stats
- Config: `dynamicPricing` and `latencyTracking` sections in routing config
- Outlier filtering for latency measurements (configurable threshold)

### Changed
- Consolidated `buildOpenRouterHeaders` in `routing-decision.ts` (removed duplication)
- Test count: 482 → 618 (43 test files)

## [0.1.1] — 2026-02-20

### Fixed
- Workflow permissions for GitHub Actions publish
- npm provenance signing for package integrity

### Changed
- README updated with npm badges, installation instructions, project status

### Dependencies
- Bumped `openclaw` peer dependency (2026.2.17 → 2026.2.19)

## [0.1.0] — 2026-02-19

### Added
- Initial release
- Token metrics tracking (input/output/cache)
- Cache breakpoint injection for Anthropic prompt caching
- Conversation windowing (smart context management)
- Intelligent model routing via ClawRouter (hybrid + heuristic fallback)
- Real-time dashboard (dark theme, port 3333)
- Shadow mode (observation-only routing)
- `/slimclaw` command for metrics display
