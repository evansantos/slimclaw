import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSlimClawProvider, createSidecarRequestHandler, SidecarServer } from '../provider/index.js';
import { getVirtualModelDefinitions } from '../provider/virtual-models.js';
import type { SlimClawConfig } from '../config.js';

// Wrapper class to provide the expected API interface for testing
class SidecarServerWrapper {
  private server: SidecarServer;
  private port: number | null = null;

  constructor(config: { port: number; timeout: number; handler: (request: any) => Promise<Response> }) {
    // Ignore port and timeout for actual SidecarServer construction
    this.server = new SidecarServer(config.handler);
  }

  async start(): Promise<void> {
    this.port = await this.server.listen(0); // Use random port
  }

  async stop(): Promise<void> {
    await this.server.close();
    this.port = null;
  }

  isRunning(): boolean {
    return this.port !== null;
  }

  getPort(): number {
    if (this.port === null) {
      throw new Error('Server not started');
    }
    return this.port;
  }
}

describe('SlimClaw Proxy Integration', () => {
  let sidecarServer: SidecarServerWrapper;

  afterEach(async () => {
    if (sidecarServer?.isRunning()) {
      await sidecarServer.stop();
    }
  });

  test('provider plugin creation', () => {
    const provider = createSlimClawProvider({
      port: 3334,
      virtualModels: { auto: { enabled: true } },
      providerCredentials: new Map(),
      slimclawConfig: {} as SlimClawConfig,
      timeout: 30000,
      services: {}
    });

    expect(provider.id).toBe('slimclaw');
    expect(provider.label).toBe('SlimClaw Router');
    expect(provider.models?.baseUrl).toBe('http://localhost:3334/v1');
    expect(provider.models?.api).toBe('openai-completions');
    expect(provider.models?.models).toHaveLength(1);
    expect(provider.models?.models[0].id).toBe('slimclaw/auto');
  });

  test('health check endpoint', async () => {
    const handler = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 })
    );

    sidecarServer = new SidecarServerWrapper({
      port: 0, // Random port
      timeout: 30000,
      handler
    });

    await sidecarServer.start();
    const port = sidecarServer.getPort();

    const response = await fetch(`http://localhost:${port}/health`);
    expect(response.status).toBe(200);

    const text = await response.text();
    expect(text).toBe('OK');
  });

  test('sidecar server lifecycle', async () => {
    const handler = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 })
    );

    sidecarServer = new SidecarServerWrapper({
      port: 0,
      timeout: 30000,
      handler
    });

    expect(sidecarServer.isRunning()).toBe(false);
    await sidecarServer.start();
    expect(sidecarServer.isRunning()).toBe(true);
    
    const port = sidecarServer.getPort();
    expect(port).toBeGreaterThan(0);
    
    await sidecarServer.stop();
    expect(sidecarServer.isRunning()).toBe(false);
  });

  test('rejects non-POST requests to completions endpoint', async () => {
    const handler = vi.fn();

    sidecarServer = new SidecarServerWrapper({
      port: 0,
      timeout: 30000,
      handler
    });

    await sidecarServer.start();
    const port = sidecarServer.getPort();

    const response = await fetch(`http://localhost:${port}/v1/chat/completions`, {
      method: 'GET'
    });

    expect(response.status).toBe(405);
    expect(handler).not.toHaveBeenCalled();
  });

  test('virtual model definitions include auto', () => {
    const models = getVirtualModelDefinitions();
    
    const auto = models.find((m: any) => m.id === 'slimclaw/auto');
    expect(auto).toBeDefined();
    expect(auto.name).toContain('Auto');
  });
});