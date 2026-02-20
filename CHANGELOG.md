# Changelog

All notable changes to SlimClaw are documented here.

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
