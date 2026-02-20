# SlimClaw Provider Proxy Design (Sidecar Pattern)

> **Date:** 2026-02-21  
> **Status:** Draft  
> **Author:** arch (subagent)  
> **Depends on:** openclaw/openclaw#22268 (mutable hooks — alternative path)  
> **Supersedes:** Shadow-only observation mode (current)

---

## 1. Problem Statement

SlimClaw currently operates in **shadow mode**: it observes `llm_input`/`llm_output` hooks, classifies prompts, and logs what routing decisions it _would_ make — but cannot actually reroute requests because those hooks are **read-only (void return)**. We've opened openclaw/openclaw#22268 requesting mutable hooks, but there's no ETA.

The proxy provider pattern gives us **active routing today** using an existing, stable API surface: `api.registerProvider()`.

## 2. High-Level Architecture

```
                     User config: model = slimclaw/auto
                                    │
                                    ▼
                  ┌──────────────────────────────────┐
                  │      SlimClaw ProviderPlugin      │
                  │         (id: "slimclaw")          │
                  │                                    │
                  │  1. Parse virtual model name        │
                  │  2. classifyWithRouter() → tier     │
                  │  3. budgetTracker.check(tier)       │
                  │  4. abTestManager.assign(tier)      │
                  │  5. resolveModel(tier) → real model  │
                  │  6. resolveProvider() → endpoint     │
                  │  7. HTTP fetch() to real provider    │
                  │  8. Stream response back to OpenClaw │
                  │  9. Track metrics + outcomes         │
                  └──────────┬───────────────────────────┘
                             │
                             ▼
                  Real provider API
                  (Anthropic, OpenRouter, Ollama, …)
```

### How It Fits Into Existing SlimClaw Modules

```
slimclaw/src/
├── index.ts                    ← registers provider via api.registerProvider()
├── provider/                   ← NEW: proxy provider implementation
│   ├── slimclaw-provider.ts    ← ProviderPlugin object + model definitions
│   ├── request-forwarder.ts    ← HTTP forwarding to downstream providers
│   └── virtual-models.ts      ← slimclaw/auto, /budget, /fast, /pinned-*
├── routing/
│   ├── routing-decision.ts     ← makeRoutingDecision() — REUSED as-is
│   ├── model-router.ts         ← resolveModel() — REUSED as-is
│   ├── provider-resolver.ts    ← resolveProvider() — REUSED as-is
│   ├── budget-tracker.ts       ← BudgetTracker — REUSED as-is
│   ├── ab-testing.ts           ← ABTestManager — REUSED as-is
│   ├── latency-tracker.ts      ← LatencyTracker — REUSED as-is
│   ├── pricing.ts              ← cost estimation — REUSED as-is
│   └── shadow-router.ts        ← still used for logging/comparison
├── classifier/                 ← classifyWithRouter() — REUSED as-is
└── config.ts                   ← extended with proxy-specific config
```

**Key insight:** The routing decision pipeline (`classifyWithRouter` → `makeRoutingDecision` → `resolveModel` → `resolveProvider`) is already fully built. The proxy provider is a thin shell that:
1. Intercepts model requests addressed to `slimclaw/*`
2. Runs the existing routing pipeline
3. Forwards the resolved request via HTTP to the real provider

## 3. ProviderPlugin Interface Analysis

From `openclaw/dist/plugin-sdk/plugins/types.d.ts`:

```typescript
type ProviderPlugin = {
  id: string;                              // "slimclaw"
  label: string;                           // "SlimClaw Router"
  docsPath?: string;                       // Optional docs path
  aliases?: string[];                      // e.g., ["sc"]
  envVars?: string[];                      // env vars for API keys
  models?: ModelProviderConfig;            // Model definitions
  auth: ProviderAuthMethod[];              // Auth methods
  formatApiKey?: (cred) => string;         // Optional key formatting
  refreshOAuth?: (cred) => Promise<cred>;  // Optional OAuth refresh
};
```

Where `ModelProviderConfig` (from `types.models.d.ts`):

```typescript
type ModelProviderConfig = {
  baseUrl: string;              // Required — see discussion below
  apiKey?: string;              // Not applicable for proxy
  auth?: ModelProviderAuthMode; // "api-key" | "aws-sdk" | "oauth" | "token"
  api?: ModelApi;               // "openai-completions" | "anthropic-messages" | etc.
  headers?: Record<string, string>;
  authHeader?: boolean;
  models: ModelDefinitionConfig[];  // The virtual model definitions
};

type ModelDefinitionConfig = {
  id: string;           // "slimclaw/auto"
  name: string;         // "SlimClaw Auto Router"
  api?: ModelApi;       // API format — critical for forwarding
  reasoning: boolean;   // Whether model supports reasoning
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
  compat?: ModelCompatConfig;
};
```

### What We Need to Implement

| Field | Value | Notes |
|-------|-------|-------|
| `id` | `"slimclaw"` | Provider namespace — models become `slimclaw/auto`, `slimclaw/budget`, etc. |
| `label` | `"SlimClaw Router"` | Shown in UI/status |
| `aliases` | `["sc"]` | Optional shorthand |
| `envVars` | `[]` | No own API keys — uses downstream provider keys |
| `models` | See §4 | Virtual model definitions |
| `auth` | `[{ id: "none", label: "No auth needed", kind: "custom", run: async () => ({ profiles: [] }) }]` | Proxy doesn't need its own auth — it delegates to real providers |
| `models.baseUrl` | `"http://localhost:0"` | Placeholder — we intercept before HTTP; never actually hit |
| `models.api` | `"openai-completions"` | Default API format; overridden per-request based on target |

### The `baseUrl` Problem

`ModelProviderConfig.baseUrl` is **required** (not optional). Since SlimClaw is a proxy that doesn't have its own API server, we have two options:

1. **Dummy URL**: Set `baseUrl: "http://localhost:0"` — never used because we intercept the request
2. **Local sidecar server**: Start a tiny HTTP server (e.g., on the dashboard port) that receives the request and does the proxying internally

**Recommendation:** Option 2 — a local HTTP server. OpenClaw will format the request according to the declared `api` type and POST it to `baseUrl`. Our server receives the already-formatted request, applies routing logic, and forwards to the real provider. This is more robust than trying to intercept before HTTP.

**Alternative (Option 1):** If OpenClaw's pi-agent uses `resolveModel()` to get a `Model<Api>` object and calls it directly (not via HTTP), we may need to provide a custom model implementation. Investigation of `pi-embedded-runner/model.d.ts` shows `resolveModel(provider, modelId)` returns `{ model?: Model<Api> }` — this suggests OpenClaw constructs model objects from provider config and calls them. The HTTP server approach may be the cleanest way to intercept.

## 4. Virtual Model Mapping

### Static Virtual Models

| Model ID | Strategy | Description |
|----------|----------|-------------|
| `slimclaw/auto` | Full routing pipeline | classify → budget → A/B → resolveModel → forward |
| `slimclaw/budget` | Cost-minimizing | Pick cheapest model in the tier map that fits budget |
| `slimclaw/fast` | Latency-minimizing | Pick model with lowest p50 latency from LatencyTracker |
| `slimclaw/reasoning` | Force reasoning tier | Always use reasoning-tier model with thinking enabled |

### Dynamic Pinned Models

Pattern: `slimclaw/pinned-<provider>-<model>`

Examples:
- `slimclaw/pinned-anthropic-claude-sonnet-4-20250514`
- `slimclaw/pinned-openai-gpt-4.1-nano`

Pinned models pass through SlimClaw for **metrics tracking only** — no routing decision, just observation + budget + latency recording. The model is forwarded as-is to the resolved provider.

### Resolution Flow

```typescript
function resolveVirtualModel(
  virtualModelId: string,        // e.g., "auto", "budget", "fast", "pinned-..."
  messages: Message[],           // For classification
  config: SlimClawConfig,
  services: { budgetTracker, abTestManager, latencyTracker }
): { realModel: string; realProvider: string; tier: ComplexityTier; thinking: ThinkingConfig | null } {

  // 1. Pinned models — bypass routing
  if (virtualModelId.startsWith('pinned-')) {
    const realModel = parsePinnedModel(virtualModelId); // "anthropic/claude-sonnet-4-20250514"
    const provider = resolveProvider(realModel, config.routing.tierProviders);
    const tier = inferTierFromModel(realModel);
    return { realModel, realProvider: provider.provider, tier, thinking: null };
  }

  // 2. Classify the prompt
  const classification = classifyWithRouter(messages, { originalModel: 'slimclaw/' + virtualModelId });

  // 3. Strategy-specific routing
  switch (virtualModelId) {
    case 'auto':
      // Full pipeline: makeRoutingDecision handles budget + A/B
      const decision = makeRoutingDecision(classification, config, ctx, runId, services);
      return { realModel: decision.model, realProvider: decision.provider, ... };

    case 'budget':
      // Override: force cheapest available model
      return pickCheapestModel(classification.tier, config, services.budgetTracker);

    case 'fast':
      // Override: pick lowest-latency model from tracker
      return pickFastestModel(classification.tier, config, services.latencyTracker);

    case 'reasoning':
      // Override: force reasoning tier
      const reasoningModel = getTierModel('reasoning', config.routing);
      return { realModel: reasoningModel, ... , thinking: { type: 'enabled', budget_tokens: config.routing.reasoningBudget } };

    default:
      // Unknown virtual model — fall back to auto
      return resolveVirtualModel('auto', messages, config, services);
  }
}
```

### ModelDefinitionConfig for Virtual Models

Each virtual model needs a `ModelDefinitionConfig` entry. Since the actual capabilities depend on the downstream model, we declare **superset capabilities**:

```typescript
const VIRTUAL_MODELS: ModelDefinitionConfig[] = [
  {
    id: 'slimclaw/auto',
    name: 'SlimClaw Auto Router',
    api: 'openai-completions',   // Default; adapted per-request
    reasoning: true,              // May route to reasoning model
    input: ['text', 'image'],     // Superset — depends on target
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, // Dynamic — depends on target
    contextWindow: 200000,        // Max across all targets
    maxTokens: 16384,             // Conservative max
  },
  {
    id: 'slimclaw/budget',
    name: 'SlimClaw Budget Mode',
    api: 'openai-completions',
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0.00025, output: 0.00125, cacheRead: 0, cacheWrite: 0 }, // Haiku-level
    contextWindow: 200000,
    maxTokens: 16384,
  },
  {
    id: 'slimclaw/fast',
    name: 'SlimClaw Fast Mode',
    api: 'openai-completions',
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0.0001, output: 0.0004, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 16384,
  },
  {
    id: 'slimclaw/reasoning',
    name: 'SlimClaw Reasoning Mode',
    api: 'anthropic-messages',
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 0.015, output: 0.075, cacheRead: 0, cacheWrite: 0 }, // Opus-level
    contextWindow: 200000,
    maxTokens: 16384,
  },
];
```

## 5. Provider Forwarding — The Core Challenge

This is the hardest part of the design. OpenClaw uses `@mariozechner/pi-agent` under the hood, which has its own model abstraction (`Model<Api>`). When OpenClaw sees `model = slimclaw/auto`, it will:

1. Look up the provider config for `slimclaw`
2. Find the model definition for `slimclaw/auto`
3. Construct a request based on the declared `api` type (e.g., `openai-completions`)
4. Send it to `baseUrl`

### Strategy A: Local HTTP Sidecar (Recommended)

SlimClaw starts a local HTTP server (reusing the dashboard port or a new one) that acts as the provider endpoint:

```
OpenClaw ──POST /v1/chat/completions──► localhost:3334 (SlimClaw sidecar)
                                              │
                                    ┌─────────┴────────────┐
                                    │  1. Parse request     │
                                    │  2. Classify prompt   │
                                    │  3. Route decision    │
                                    │  4. Rewrite request   │
                                    │  5. Forward to real   │
                                    │     provider baseUrl  │
                                    └─────────┬────────────┘
                                              │
SlimClaw sidecar ──POST──► api.anthropic.com/v1/messages
                           (or openrouter.ai/api/v1/chat/completions)
```

**Implementation:**

```typescript
// provider/sidecar-server.ts
import { createServer } from 'node:http';

export function startSidecar(port: number, handler: RequestHandler): Promise<void> {
  const server = createServer(async (req, res) => {
    // Parse the incoming request (OpenAI-format from OpenClaw)
    const body = await readBody(req);
    const openaiRequest = JSON.parse(body);

    // Extract messages for classification
    const messages = openaiRequest.messages;

    // Run routing pipeline
    const routing = resolveVirtualModel(
      extractVirtualModelName(openaiRequest.model),
      messages,
      config,
      services
    );

    // Rewrite request for target provider
    const targetRequest = rewriteRequest(openaiRequest, routing);

    // Forward to real provider with streaming
    const targetUrl = getProviderBaseUrl(routing.realProvider);
    const targetResponse = await fetch(targetUrl + '/v1/chat/completions', {
      method: 'POST',
      headers: buildTargetHeaders(routing),
      body: JSON.stringify(targetRequest),
    });

    // Stream response back to OpenClaw
    res.writeHead(targetResponse.status, {
      'Content-Type': targetResponse.headers.get('content-type') || 'application/json',
      'Transfer-Encoding': 'chunked',
    });

    for await (const chunk of targetResponse.body) {
      res.write(chunk);
    }
    res.end();

    // Track metrics (async, non-blocking)
    trackRequestMetrics(routing, targetResponse);
  });

  return new Promise((resolve) => server.listen(port, resolve));
}
```

**Pros:**
- Clean separation — OpenClaw treats us like any other provider
- Full control over request/response lifecycle
- Streaming works naturally (pipe response chunks)
- No internal API dependencies

**Cons:**
- Extra port to manage
- Request format translation needed (OpenAI ↔ Anthropic)
- API key management for downstream providers
- Extra latency from local HTTP hop (negligible: ~1ms)

### Strategy B: Request Interception via `before_tool_call` Hook

Not viable — `before_tool_call` is for tool calls, not LLM requests.

### Strategy C: Abuse `message_sending` Hook

Not viable — fires for outgoing messages to channels, not LLM calls.

### Conclusion: Strategy A is the only viable approach.

### Request Format Translation

The sidecar receives requests in whatever format OpenClaw sends (based on `models.api` declaration). It must translate to the target provider's format:

| Source (declared api) | Target Provider | Translation Needed? |
|----------------------|-----------------|-------------------|
| `openai-completions` | Anthropic | Yes — OpenAI → Anthropic Messages |
| `openai-completions` | OpenRouter | No — OpenRouter is OpenAI-compatible |
| `openai-completions` | Ollama | No — Ollama is OpenAI-compatible |
| `anthropic-messages` | OpenAI/OpenRouter | Yes — Anthropic → OpenAI |

**Simplest approach:** Declare `api: "openai-completions"` for all virtual models. OpenClaw sends us OpenAI-format requests. Then:
- For OpenRouter targets: forward as-is
- For Anthropic targets: translate OpenAI → Anthropic Messages format
- For Ollama targets: forward as-is

This minimizes translation work since OpenAI format is the lingua franca.

### API Key Resolution

The sidecar needs API keys for downstream providers. Options:

1. **Read from OpenClaw config** — `api.config` is available in `register()`, which includes `models.providers` with API keys
2. **Environment variables** — `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, etc.
3. **Auth profiles** — OpenClaw's auth profile system stores credentials

**Recommendation:** Use `api.config` to read provider configs. At registration time, extract `baseUrl` and `apiKey` from known providers:

```typescript
function extractProviderCredentials(config: OpenClawConfig): Map<string, { baseUrl: string; apiKey: string }> {
  const providers = config.models?.providers || {};
  const creds = new Map();
  
  for (const [id, providerConfig] of Object.entries(providers)) {
    creds.set(id, {
      baseUrl: providerConfig.baseUrl,
      apiKey: providerConfig.apiKey || process.env[`${id.toUpperCase()}_API_KEY`] || '',
    });
  }
  
  return creds;
}
```

## 6. Configuration

### New Config Fields in `slimclaw.config.json`

```jsonc
{
  // ... existing config ...
  "proxy": {
    "enabled": true,
    "port": 3334,                      // Sidecar server port
    "defaultApi": "openai-completions", // Default API format for virtual models
    "virtualModels": {
      "auto": { "enabled": true },
      "budget": { "enabled": true },
      "fast": { "enabled": true },
      "reasoning": { "enabled": true }
    },
    "providerOverrides": {
      // Override baseUrl/apiKey for specific providers when proxying
      // Falls back to reading from OpenClaw main config
      "anthropic": {
        "baseUrl": "https://api.anthropic.com",
        "apiKeyEnv": "ANTHROPIC_API_KEY"
      },
      "openrouter": {
        "baseUrl": "https://openrouter.ai/api",
        "apiKeyEnv": "OPENROUTER_API_KEY"
      }
    },
    "requestTimeout": 120000,          // 2 min timeout for forwarded requests
    "retryOnError": false,             // Whether to retry with fallback model on error
    "fallbackModel": null              // Model to use if routing fails entirely
  }
}
```

### Zod Schema Extension

```typescript
// In config.ts, add to SlimClawConfigSchema:
proxy: z.object({
  enabled: z.boolean().default(false),
  port: z.number().int().min(1024).max(65535).default(3334),
  defaultApi: z.enum(['openai-completions', 'anthropic-messages']).default('openai-completions'),
  virtualModels: z.object({
    auto: z.object({ enabled: z.boolean().default(true) }).default({}),
    budget: z.object({ enabled: z.boolean().default(true) }).default({}),
    fast: z.object({ enabled: z.boolean().default(true) }).default({}),
    reasoning: z.object({ enabled: z.boolean().default(true) }).default({}),
  }).default({}),
  providerOverrides: z.record(z.object({
    baseUrl: z.string().optional(),
    apiKeyEnv: z.string().optional(),
    apiKey: z.string().optional(),
  })).default({}),
  requestTimeout: z.number().int().min(5000).default(120000),
  retryOnError: z.boolean().default(false),
  fallbackModel: z.string().nullable().default(null),
}).default({}),
```

### User-Facing Configuration

In `openclaw.json`:

```jsonc
{
  "defaultModel": "slimclaw/auto",  // Use SlimClaw for all agents
  "agents": {
    "main": {
      "model": "slimclaw/auto"       // Or per-agent
    },
    "arch": {
      "model": "slimclaw/reasoning"  // Force reasoning for arch agent
    }
  }
}
```

## 7. Registration Flow

```typescript
// In src/index.ts register() method:

register(api: OpenClawPluginApi) {
  // ... existing setup ...

  if (pluginConfig.proxy?.enabled) {
    // 1. Start sidecar HTTP server
    const sidecarPort = pluginConfig.proxy.port || 3334;
    const sidecar = startSidecar(sidecarPort, {
      config: fullConfig,
      budgetTracker,
      abTestManager,
      latencyTracker,
      providerCredentials: extractProviderCredentials(api.config),
      logger: api.logger,
    });

    // 2. Register as provider
    api.registerProvider({
      id: 'slimclaw',
      label: 'SlimClaw Router',
      aliases: ['sc'],
      envVars: [],  // No own keys
      models: {
        baseUrl: `http://localhost:${sidecarPort}/v1`,
        api: 'openai-completions',
        models: buildVirtualModelDefinitions(pluginConfig),
      },
      auth: [{
        id: 'none',
        label: 'No authentication needed (proxy)',
        kind: 'custom',
        run: async () => ({ profiles: [], notes: ['SlimClaw proxies through configured providers'] }),
      }],
    });

    api.logger.info(`[SlimClaw] Provider proxy registered on port ${sidecarPort}`);
    api.logger.info(`[SlimClaw] Available models: ${VIRTUAL_MODELS.map(m => m.id).join(', ')}`);
  }

  // ... existing hooks (llm_input/llm_output) still work for non-proxy requests ...
}
```

## 8. Limitations & Risks

### What the Proxy Can Do

| Capability | Status | Notes |
|-----------|--------|-------|
| Model routing (tier-based) | ✅ Full | Core use case |
| Budget enforcement | ✅ Full | Pre-request check before forwarding |
| A/B testing | ✅ Full | Assignment before forwarding |
| Latency tracking | ✅ Full | Measure round-trip through sidecar |
| Cost tracking | ✅ Full | Track per-request costs |
| Streaming responses | ✅ Full | Pipe upstream chunks back to OpenClaw |
| Cache breakpoints | ⚠️ Partial | Can inject before forwarding to Anthropic |
| Tool calls | ⚠️ Partial | See below |
| Multi-turn agent loops | ⚠️ Partial | See below |
| Image inputs | ✅ Full | Forward multimodal content as-is |

### Known Limitations

#### 1. Tool Calls in Agent Loops

In an agent loop, OpenClaw sends multiple LLM requests per turn (prompt → tool call → tool result → continuation). Each request goes through the proxy independently. The proxy **cannot**:
- Maintain conversation state across requests in the same loop
- Change models mid-loop (each request is independently routed)
- Observe tool results before they're sent to the LLM

**Mitigation:** For `slimclaw/auto`, classify only on the first request of a loop. Cache the routing decision by session/agent and reuse it for subsequent requests in the same loop. This avoids flip-flopping between models mid-conversation.

#### 2. API Format Translation Overhead

Translating between OpenAI and Anthropic message formats is non-trivial:
- System prompt handling differs (Anthropic: separate `system` field; OpenAI: system role message)
- Tool call format differs (function_call vs tool_use blocks)
- Image encoding differs (base64 blocks vs URLs)
- Streaming SSE format differs (`data: [DONE]` vs `event: message_stop`)

**Mitigation:** Use a well-tested translation library, or keep `api: "openai-completions"` and route only to OpenAI-compatible endpoints (OpenRouter covers most models). For direct Anthropic API, build a focused translator for the subset of features we use.

#### 3. Double Metrics

With the proxy active, both the proxy AND the existing `llm_input`/`llm_output` hooks will fire. The hooks see `model: "slimclaw/auto"` (the virtual model), while the proxy knows the real model.

**Mitigation:** When proxy is enabled, have `llm_input`/`llm_output` hooks detect `provider === "slimclaw"` and skip metrics collection — let the proxy handle it. Or better: use the hooks to correlate proxy-side metrics with OpenClaw-side metrics for validation.

#### 4. Authentication/Key Management

The proxy needs API keys for all downstream providers. These must be sourced from:
- OpenClaw's config (`models.providers[x].apiKey`)
- Environment variables
- Auth profiles

If a required key is missing, the proxy request fails. Unlike mutable hooks (which would inherit the original request's auth), the proxy must independently authenticate.

**Mitigation:** At startup, validate that all configured tier providers have accessible API keys. Log clear warnings for missing keys.

#### 5. Extra Latency

Every request adds ~1-3ms for the local HTTP hop. Negligible for LLM calls (typically 1-60 seconds), but it's overhead that mutable hooks wouldn't have.

### What Mutable Hooks Could Do That Proxy Cannot

| Capability | Proxy | Mutable Hooks |
|-----------|-------|---------------|
| Zero-config for existing setups | ❌ Requires model change | ✅ Transparent |
| No API key re-management | ❌ Needs own key access | ✅ Inherits existing auth |
| Per-request model override | ✅ | ✅ |
| Modify system prompt | ❌ | ✅ (if hook exposes it) |
| Inject context/instructions | ❌ | ✅ |
| Zero extra latency | ❌ (+1-3ms) | ✅ |
| Works with all models | ❌ Only slimclaw/* | ✅ All models transparently |

## 9. Migration Path: Proxy → Mutable Hooks

When openclaw/openclaw#22268 lands with mutable `llm_input` hooks:

### Phase 1: Coexistence (Immediate)

Both approaches can coexist:
- `slimclaw/auto` → uses proxy path (explicit opt-in)
- Any other model (e.g., `anthropic/claude-opus-4-6`) → uses mutable hook for transparent routing

```typescript
// In register():
if (hasMutableHooks(api)) {
  // New path: transparent routing via hook
  api.on('llm_input', (event, ctx) => {
    const routing = makeRoutingDecision(...);
    return { model: routing.model, provider: routing.provider };  // Hook mutation
  });
}

if (pluginConfig.proxy?.enabled) {
  // Old path: proxy provider (still works)
  api.registerProvider(slimclawProvider);
}
```

### Phase 2: Gradual Migration

- Default new installs to hook-based routing
- Keep proxy available for users who prefer explicit `slimclaw/*` model names
- Proxy becomes optional — useful for:
  - Users who want per-agent routing strategies (main uses `slimclaw/auto`, arch uses `slimclaw/reasoning`)
  - Testing/comparison: run hook-based and proxy-based side by side

### Phase 3: Proxy as Premium Feature

Once hooks are stable, the proxy transforms from "workaround" to "advanced feature":
- Named routing strategies (`slimclaw/budget`, `slimclaw/fast`) remain useful even with hooks
- Hooks handle the common case (transparent routing)
- Proxy handles the explicit case (per-agent strategies)

### Detection of Mutable Hooks

```typescript
function hasMutableHooks(api: OpenClawPluginApi): boolean {
  // Check if llm_input handler return type is used (non-void)
  // This could be feature-flagged or version-checked
  try {
    const version = api.runtime?.version || '0.0.0';
    return semver.gte(version, '1.x.y'); // Version that adds mutable hooks
  } catch {
    return false;
  }
}
```

## 10. Comparison Table

| Dimension | Proxy Provider | Mutable Hooks (openclaw#22268) |
|-----------|---------------|-------------------------------|
| **Availability** | Now (uses existing API) | Blocked on upstream PR |
| **User experience** | Must change model to `slimclaw/*` | Transparent — works with any model |
| **API key management** | Must independently source keys | Inherits from existing config |
| **Streaming** | ✅ Full (pipe-through) | ✅ Full (native) |
| **Tool calls** | ✅ Works (independent per-request) | ✅ Works (native) |
| **Latency overhead** | +1-3ms (local HTTP) | ~0ms |
| **Format translation** | Required (OpenAI ↔ Anthropic) | Not needed |
| **Per-agent strategies** | ✅ Natural (different model per agent) | Possible but less ergonomic |
| **Metrics accuracy** | ✅ Full control | ✅ Full control |
| **System prompt modification** | ❌ Cannot | ✅ If hook exposes |
| **Implementation complexity** | Medium (HTTP server + translation) | Low (hook return value) |
| **Maintenance burden** | Higher (format translation, key mgmt) | Lower |
| **Failure mode** | Sidecar crash = no LLM calls | Hook error = fallback to original |
| **Testing** | Easy (HTTP endpoint = standard testing) | Harder (hook lifecycle) |
| **Coexistence** | ✅ Can run alongside hooks | ✅ Can run alongside proxy |

## 11. Implementation Plan

### Phase 1: Minimal Viable Proxy (Week 1)

1. **`provider/virtual-models.ts`** — Define virtual model configs
2. **`provider/sidecar-server.ts`** — HTTP server accepting OpenAI-format requests
3. **`provider/request-forwarder.ts`** — Forward to OpenRouter (OpenAI-compatible only)
4. **`provider/slimclaw-provider.ts`** — ProviderPlugin definition
5. **Update `index.ts`** — Register provider when `proxy.enabled`
6. **Config schema** — Add `proxy` section to Zod schema

Scope: Only `slimclaw/auto` → OpenRouter forwarding (no format translation needed).

### Phase 2: Full Virtual Models (Week 2)

1. **`slimclaw/budget`** — Cheapest model selection
2. **`slimclaw/fast`** — Lowest latency selection
3. **`slimclaw/reasoning`** — Force reasoning tier
4. **`slimclaw/pinned-*`** — Passthrough with tracking
5. **Anthropic format translation** — For direct Anthropic API routing

### Phase 3: Hardening (Week 3)

1. **Error handling** — Retry logic, fallback models
2. **Health checks** — Sidecar liveness, provider reachability
3. **Double-metrics dedup** — Coordinate proxy + hook metrics
4. **Session-sticky routing** — Cache routing decision per session
5. **Dashboard integration** — Show proxy-specific metrics

### Phase 4: Hook Migration Prep (When openclaw#22268 Merges)

1. **Detect mutable hooks** — Version/feature check
2. **Dual-mode support** — Hook-based for transparent, proxy for explicit
3. **Deprecation path** — Warn if proxy-only with hooks available

## 12. Open Questions

1. **Does OpenClaw's pi-agent actually HTTP POST to `baseUrl`, or does it construct `Model<Api>` objects?** — Need to verify by testing. If it constructs objects, we may need a different interception strategy.

2. **Can we register dynamic models?** — `slimclaw/pinned-*` is a pattern, not a fixed list. Does OpenClaw support wildcard model IDs, or must we enumerate all pinned models at registration time?

3. **Port conflicts** — What if port 3334 is in use? Should we use a random port and dynamically set `baseUrl`? Or reuse the dashboard port (3333) with path-based routing?

4. **Cold start** — The sidecar server needs to be running before any LLM request. If the server starts asynchronously, there's a brief window where requests to `slimclaw/*` would fail. Need a readiness gate.

5. **Graceful shutdown** — When OpenClaw stops, the sidecar server must also stop. Register cleanup via `api.registerService()` with a `stop()` handler.

---

## Appendix A: Existing Module Reuse Map

| Existing Module | Used By Proxy? | How |
|----------------|---------------|-----|
| `classifyWithRouter()` | ✅ | Classify prompt from incoming request |
| `makeRoutingDecision()` | ✅ | Full routing pipeline (tier → model → provider) |
| `resolveModel()` | ✅ | Tier-to-model mapping |
| `resolveProvider()` | ✅ | Model-to-provider resolution |
| `BudgetTracker` | ✅ | Pre-request budget check |
| `ABTestManager` | ✅ | Variant assignment |
| `LatencyTracker` | ✅ | Record latency, power `slimclaw/fast` |
| `estimateModelCost()` | ✅ | Cost tracking for budget |
| `buildShadowRecommendation()` | ✅ | Logging/comparison (proxy logs what shadow WOULD have done too) |
| `DashboardServer` | ✅ | Potentially share port with sidecar |
| `llm_input`/`llm_output` hooks | ⚠️ Modified | Skip metrics when `provider === "slimclaw"` |

## Appendix B: Sequence Diagram — Full Request Lifecycle

```
User ──────────────────────────────────── OpenClaw ──────────── SlimClaw Sidecar ──────── Real Provider
  │                                          │                        │                        │
  │  "Write a hello world in Rust"           │                        │                        │
  │─────────────────────────────────────────►│                        │                        │
  │                                          │  model=slimclaw/auto   │                        │
  │                                          │  POST /v1/chat/comp.   │                        │
  │                                          │───────────────────────►│                        │
  │                                          │                        │  classify → "simple"   │
  │                                          │                        │  budget → OK           │
  │                                          │                        │  A/B → control         │
  │                                          │                        │  route → haiku         │
  │                                          │                        │                        │
  │                                          │                        │  POST api.anthropic..  │
  │                                          │                        │───────────────────────►│
  │                                          │                        │                        │
  │                                          │                        │  SSE stream chunks     │
  │                                          │  SSE stream chunks     │◄───────────────────────│
  │                                          │◄───────────────────────│                        │
  │  Streaming response                      │                        │  track metrics         │
  │◄─────────────────────────────────────────│                        │  record latency        │
  │                                          │                        │  record budget spend   │
  │                                          │                        │                        │
```
