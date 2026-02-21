// Create src/provider/virtual-models.ts

/**
 * Local definition of ModelDefinitionConfig since it doesn't exist in plugin-sdk yet
 */
export interface ModelDefinitionConfig {
  id: string;
  name: string;
  api: string;
  reasoning?: boolean;
  input?: string[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
}

/**
 * Configuration for which virtual models are enabled
 */
export interface VirtualModelConfig {
  auto?: { enabled: boolean };
  // Future phases will add: budget, fast, reasoning, pinned-*
}

/**
 * Static virtual model definitions for Phase 1 MVP
 * 
 * Each virtual model declares superset capabilities since actual capabilities
 * depend on the downstream model selected by the routing pipeline.
 */
export const VIRTUAL_MODELS: ModelDefinitionConfig[] = [
  {
    id: 'slimclaw/auto',
    name: 'SlimClaw Auto Router',
    api: 'openai-completions',   // OpenAI format for OpenRouter compatibility
    reasoning: true,             // May route to reasoning-capable models
    input: ['text', 'image'],    // Superset of input types across all targets
    cost: { 
      input: 0,                  // Dynamic - depends on routed target
      output: 0, 
      cacheRead: 0, 
      cacheWrite: 0 
    },
    contextWindow: 200000,       // Max context window across all potential targets
    maxTokens: 16384,           // Conservative max output tokens
    // No provider-specific headers needed - handled by sidecar
  },
];

/**
 * Get virtual model definitions filtered by configuration
 */
export function getVirtualModelDefinitions(config?: VirtualModelConfig): ModelDefinitionConfig[] {
  if (!config) {
    return [...VIRTUAL_MODELS]; // Return all models if no config
  }

  return VIRTUAL_MODELS.filter(model => {
    switch (model.id) {
      case 'slimclaw/auto':
        return config.auto?.enabled !== false; // Default enabled
      default:
        return false; // Unknown models disabled by default
    }
  });
}

/**
 * Check if a model ID represents a SlimClaw virtual model
 */
export function isVirtualModel(modelId: string): boolean {
  try {
    const parsed = parseVirtualModelId(modelId);
    return parsed.provider === 'slimclaw' && parsed.isVirtual;
  } catch {
    return false; // Invalid format should return false, not throw
  }
}

/**
 * Parse a model ID into provider and model name components
 */
export function parseVirtualModelId(modelId: string): {
  provider: string;
  modelName: string;
  isVirtual: boolean;
} {
  if (!modelId.includes('/')) {
    throw new Error(`Invalid model ID format: ${modelId}`);
  }

  const [provider, modelName] = modelId.split('/', 2);
  
  if (!provider || !modelName) {
    throw new Error(`Invalid model ID format: ${modelId}`);
  }

  return {
    provider,
    modelName,
    isVirtual: provider === 'slimclaw'
  };
}