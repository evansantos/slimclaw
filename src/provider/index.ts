/**
 * SlimClaw Provider Proxy - Barrel Exports
 */

export { 
  VIRTUAL_MODELS,
  getVirtualModelDefinitions,
  isVirtualModel,
  parseVirtualModelId,
  type VirtualModelConfig 
} from './virtual-models.js';

export { 
  RequestForwarder,
  type ProviderCredentials,
  type ForwardingConfig,
  type ForwardingRequest 
} from './request-forwarder.js';

export { 
  SidecarServer,
  type SidecarConfig,
  type SidecarRequest,
  type RequestHandler 
} from './sidecar-server.js';

export { 
  createSlimClawProvider,
  createSidecarRequestHandler,
  type SlimClawProviderConfig,
  type SidecarRequestHandler 
} from './slimclaw-provider.js';
