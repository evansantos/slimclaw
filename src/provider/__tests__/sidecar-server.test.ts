import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { SidecarServer, RequestHandler } from '../sidecar-server.js';

describe('SidecarServer', () => {
  let server: SidecarServer;

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  describe('constructor', () => {
    it('should create server with handler', () => {
      const handler = vi.fn();
      server = new SidecarServer(handler);
      
      expect(server).toBeInstanceOf(SidecarServer);
    });
  });

  describe('listen', () => {
    it('should start server and return port', async () => {
      const handler = vi.fn();
      server = new SidecarServer(handler);
      
      const port = await server.listen(0);
      
      expect(typeof port).toBe('number');
      expect(port).toBeGreaterThan(0);
    });

    it('should start server on specific port', async () => {
      const handler = vi.fn();
      server = new SidecarServer(handler);
      
      const port = await server.listen(0);
      await server.close();
      
      // Create a new server instance for the second listen call
      const server2 = new SidecarServer(handler);
      const actualPort = await server2.listen(port + 1);
      
      expect(actualPort).toBe(port + 1);
      await server2.close();
    });
  });

  describe('close', () => {
    it('should close server', async () => {
      const handler = vi.fn();
      server = new SidecarServer(handler);
      
      await server.listen(0);
      await expect(server.close()).resolves.toBeUndefined();
    });
  });

  describe('HTTP endpoints', () => {
    let port: number;
    const mockHandler: RequestHandler = vi.fn();

    beforeEach(async () => {
      mockHandler.mockClear();
      server = new SidecarServer(mockHandler);
      port = await server.listen(0);
    });

    describe('GET /health', () => {
      it('should return 200 OK', async () => {
        const response = await fetch(`http://localhost:${port}/health`);
        
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('OK');
      });
    });

    describe('POST /v1/chat/completions', () => {
      it('should call handler with parsed request and stream response', async () => {
        const mockResponse = new Response('Hello world', {
          headers: { 'content-type': 'text/plain' }
        });
        mockHandler.mockResolvedValue(mockResponse);

        const requestBody = { messages: [{ role: 'user', content: 'Hello' }] };
        
        const response = await fetch(`http://localhost:${port}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/plain');
        expect(await response.text()).toBe('Hello world');
        
        expect(mockHandler).toHaveBeenCalledWith({
          body: requestBody,
          headers: { 'content-type': 'application/json' }
        });
      });

      it('should handle streaming responses', async () => {
        const chunks = ['chunk1', 'chunk2', 'chunk3'];
        const stream = new ReadableStream({
          start(controller) {
            chunks.forEach(chunk => controller.enqueue(new TextEncoder().encode(chunk)));
            controller.close();
          }
        });
        
        const mockResponse = new Response(stream, {
          headers: { 'content-type': 'text/plain' }
        });
        mockHandler.mockResolvedValue(mockResponse);

        const response = await fetch(`http://localhost:${port}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: [] })
        });

        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).toBe('chunk1chunk2chunk3');
      });

      it('should return 400 for malformed JSON', async () => {
        const response = await fetch(`http://localhost:${port}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: 'invalid json'
        });

        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Invalid JSON');
        expect(mockHandler).not.toHaveBeenCalled();
      });

      it('should return 500 for handler errors', async () => {
        mockHandler.mockRejectedValue(new Error('Handler error'));

        const response = await fetch(`http://localhost:${port}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: [] })
        });

        expect(response.status).toBe(500);
        expect(await response.text()).toBe('Internal server error');
      });
    });

    describe('unknown routes', () => {
      it('should return 404 for unknown GET routes', async () => {
        const response = await fetch(`http://localhost:${port}/unknown`);
        
        expect(response.status).toBe(404);
        expect(await response.text()).toBe('Not found');
      });

      it('should return 404 for unknown POST routes', async () => {
        const response = await fetch(`http://localhost:${port}/unknown`, {
          method: 'POST'
        });
        
        expect(response.status).toBe(404);
        expect(await response.text()).toBe('Not found');
      });

      it('should return 405 for unsupported methods on /health', async () => {
        const response = await fetch(`http://localhost:${port}/health`, {
          method: 'POST'
        });
        
        expect(response.status).toBe(405);
        expect(await response.text()).toBe('Method not allowed');
      });

      it('should return 405 for unsupported methods on /v1/chat/completions', async () => {
        const response = await fetch(`http://localhost:${port}/v1/chat/completions`, {
          method: 'GET'
        });
        
        expect(response.status).toBe(405);
        expect(await response.text()).toBe('Method not allowed');
      });
    });
  });
});