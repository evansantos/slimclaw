// Create src/provider/slimclaw-provider.ts
import type { SlimClawConfig } from '../config.js';
import type { SidecarRequest } from './sidecar-server.js';
import { getVirtualModelDefinitions, parseVirtualModelId, type VirtualModelConfig } from './virtual-models.js';
import { RequestForwarder, type ProviderCredentials, type ForwardingRequest } from './request-forwarder.js';
import { classifyWithRouter } from '../classifier/index.js';
import { makeRoutingDecision } from '../routing/index.js';
import type { BudgetTracker } from '../routing/budget-tracker.js';
import type { ABTestManager } from '../routing/ab-testing.js';
import type { LatencyTracker } from '../routing/latency-tracker.js';

// Local interfaces (since openclaw/plugin-sdk doesn't exist in this context)
export interface ProviderPlugin {
  id: string;
  label: string;
  aliases: string[];
  envVars: string[];
  models: ModelProviderConfig;
  auth: AuthConfig[];
}

export interface ModelProviderConfig {
  baseUrl: string;
  api: string;
  models: ModelDefinition[];
}

export interface ModelDefinition {
  id: string;
  name: string;
  api: string;
  reasoning?: boolean;
  input?: string[];
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow?: number;
  maxTokens?: number;
}

export interface AuthConfig {
  id: string;
  label: string;
  kind: 'custom' | 'apiKey' | 'oauth';
  run?: () => Promise<AuthResult>;
}

export interface AuthResult {
  profiles: any[];
  notes?: string[];
}

/**
 * Configuration for SlimClaw provider
 */
export interface SlimClawProviderConfig {
  port: number;
  virtualModels: VirtualModelConfig;
  providerCredentials: Map<string, ProviderCredentials>;
  slimclawConfig: SlimClawConfig;
  timeout: number;
  services: {
    budgetTracker?: BudgetTracker;
    abTestManager?: ABTestManager;
    latencyTracker?: LatencyTracker;
  };
}

/**
 * Request handler for sidecar server
 */
export type SidecarRequestHandler = (request: SidecarRequest) => Promise<Response>;

/**
 * Create SlimClaw provider plugin definition
 */
export function createSlimClawProvider(config: SlimClawProviderConfig): ProviderPlugin {
  const virtualModels = getVirtualModelDefinitions(config.virtualModels);

  const modelProvider: ModelProviderConfig = {
    baseUrl: `http://localhost:${config.port}/v1`,
    api: 'openai-completions',
    models: virtualModels,
    // No authHeader needed since we handle auth in the sidecar
  };

  return {
    id: 'slimclaw',
    label: 'SlimClaw Router',
    aliases: ['sc'],
    envVars: [], // No own API keys - delegates to downstream providers
    models: modelProvider,
    auth: [{
      id: 'none',
      label: 'No authentication needed (proxy)',
      kind: 'custom',
      run: async () => ({
        profiles: [],
        notes: ['SlimClaw proxies through configured providers'],
      }),
    }],
  };
}

/**
 * Create request handler for the sidecar server
 */
export function createSidecarRequestHandler(config: SlimClawProviderConfig): SidecarRequestHandler {
  const forwarder = new RequestForwarder({
    timeout: config.timeout,
    providerCredentials: config.providerCredentials,
  });

  return async (request: SidecarRequest): Promise<Response> => {
    try {
      // Extract model and messages from request body
      const { model: requestedModel, messages } = request.body;

      // Validate this is a virtual model request
      const parsed = parseVirtualModelId(requestedModel);
      if (!parsed.isVirtual) {
        throw new Error(`Expected SlimClaw virtual model, got: ${requestedModel}`);
      }

      // Phase 1: Only support auto model
      if (parsed.modelName !== 'auto') {
        throw new Error(`Unsupported virtual model: ${requestedModel} (Phase 1 supports only slimclaw/auto)`);
      }

      // Run classification on the request messages
      const classification = classifyWithRouter(messages, { 
        originalModel: requestedModel 
      });

      // Make routing decision using existing pipeline
      const routingDecision = makeRoutingDecision(
        classification,
        config.slimclawConfig,
        {
          originalModel: requestedModel,
          headers: request.headers,
        },
        `sidecar-${Date.now()}`, // Generate unique runId
        config.services
      );

      // Forward to the resolved provider
      const forwardingRequest: ForwardingRequest = {
        body: request.body,
        headers: routingDecision.headers,
        targetProvider: routingDecision.provider,
        targetModel: routingDecision.model,
      };

      const response = await forwarder.forwardRequest(forwardingRequest);
      
      // TODO: Track metrics and latency (Phase 1 scope - basic forwarding only)
      
      return response;

    } catch (error) {
      console.error('[SlimClaw] Sidecar request error:', error);
      
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  };
}