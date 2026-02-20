/**
 * Provider Resolution Engine
 * 
 * Maps model IDs to provider endpoints using tierProviders glob patterns.
 * This is the core logic for determining which provider (openrouter, anthropic, etc.)
 * should serve a given model when routing is active.
 */

/**
 * Result of provider resolution
 */
export interface ProviderResolution {
  /** The resolved provider name (e.g., "openrouter", "anthropic") */
  provider: string;
  /** Whether this was resolved via tierProviders config or is the default */
  source: "tierProviders" | "default" | "native";
  /** The glob pattern that matched (if tierProviders) */
  matchedPattern?: string;
}

/**
 * Match a model ID against a single glob pattern.
 * Supports:
 *   - Exact match: "openai/gpt-4.1-nano" 
 *   - Prefix glob: "openai/*"
 *   - Wildcard: "*" (matches everything)
 * 
 * Does NOT support complex globs (**, ?, []) — keep it simple.
 * 
 * @param modelId - Model ID to test
 * @param pattern - Glob pattern to match against
 * @returns true if pattern matches modelId
 */
export function matchTierProvider(modelId: string, pattern: string): boolean {
  // Exact match
  if (pattern === modelId) return true;
  
  // Wildcard match everything
  if (pattern === '*') return true;
  
  // Prefix glob: "openai/*" matches "openai/anything"
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2); // Remove /*
    return modelId.startsWith(prefix + '/');
  }
  
  return false;
}

/**
 * Infer provider from model ID prefix.
 * "openai/gpt-4.1-nano" → "openai"
 * "anthropic/claude-sonnet-4-20250514" → "anthropic"  
 * "my-custom-model" → "default"
 */
export function inferProviderFromModelId(modelId: string): string {
  const slashIndex = modelId.indexOf('/');
  if (slashIndex <= 0) return 'default';
  
  const prefix = modelId.slice(0, slashIndex);
  return prefix || 'default';
}

/**
 * Resolve which provider endpoint should serve a given model.
 * 
 * Resolution order:
 * 1. Check tierProviders globs for explicit mapping
 * 2. Infer from model ID prefix (anthropic/* → "anthropic", etc.)
 * 3. Fall back to "default" provider
 * 
 * @param modelId - Full model ID (e.g., "openai/gpt-4.1-nano")
 * @param tierProviders - Glob-to-provider mapping from config
 * @returns Provider resolution with source info
 */
export function resolveProvider(
  modelId: string,
  tierProviders?: Record<string, string>
): ProviderResolution {
  if (!tierProviders || Object.keys(tierProviders).length === 0) {
    // No tierProviders config - infer from prefix
    const provider = inferProviderFromModelId(modelId);
    return {
      provider,
      source: provider === 'default' ? 'default' : 'native'
    };
  }

  // Step 1: Check for exact match
  if (tierProviders[modelId]) {
    return {
      provider: tierProviders[modelId],
      source: 'tierProviders',
      matchedPattern: modelId
    };
  }

  // Step 2: Check for glob match
  for (const [pattern, provider] of Object.entries(tierProviders)) {
    if (matchTierProvider(modelId, pattern)) {
      return {
        provider,
        source: 'tierProviders',
        matchedPattern: pattern
      };
    }
  }

  // Step 3: Fall back to prefix inference
  const provider = inferProviderFromModelId(modelId);
  return {
    provider,
    source: provider === 'default' ? 'default' : 'native'
  };
}