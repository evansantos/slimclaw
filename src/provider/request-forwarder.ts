/**
 * Request forwarding logic for SlimClaw proxy provider
 * 
 * Handles HTTP forwarding of OpenAI-format requests to downstream providers
 * with streaming support and proper error handling.
 */

export interface ProviderCredentials {
  baseUrl: string;
  apiKey: string;
}

export interface ForwardingConfig {
  timeout: number; // Request timeout in milliseconds
  providerCredentials: Map<string, ProviderCredentials>;
}

export interface ForwardingRequest {
  body: any; // OpenAI-format request body
  headers: Record<string, string>; // Additional headers to forward
  targetProvider: string; // Provider to forward to (e.g., 'openrouter')
  targetModel: string; // Model name to use at target provider
}

/**
 * Handles forwarding of requests to downstream providers
 */
export class RequestForwarder {
  constructor(private config: ForwardingConfig) {}

  /**
   * Forward a request to the specified provider
   */
  async forwardRequest(request: ForwardingRequest): Promise<Response> {
    const credentials = this.config.providerCredentials.get(request.targetProvider);
    if (!credentials) {
      throw new Error(`Unknown provider: ${request.targetProvider}`);
    }

    // Build target URL
    const targetUrl = `${credentials.baseUrl}/v1/chat/completions`;

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${credentials.apiKey}`,
      ...request.headers, // Include any provider-specific headers
    };

    // Create request body with target model
    const requestBody = {
      ...request.body,
      model: request.targetModel,
    };

    // Create AbortController for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), this.config.timeout);

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);
      return response;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.timeout}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Get provider credentials for a given provider
   */
  getProviderCredentials(provider: string): ProviderCredentials | null {
    return this.config.providerCredentials.get(provider) || null;
  }

  /**
   * Check if a provider is supported
   */
  isProviderSupported(provider: string): boolean {
    return this.config.providerCredentials.has(provider);
  }
}