export interface RoutingDecision {
  model: string;
  tier: string;
  confidence: number;
  savings: number;
  costEstimate: number;
}

export interface IRoutingProvider {
  name: string;
  route(text: string, contextTokens: number, config?: Record<string, unknown>): RoutingDecision;
  isAvailable(): boolean;
}