import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { URL } from 'node:url';

export interface SidecarRequest {
  body: any;
  headers: Record<string, string>;
}

export type RequestHandler = (request: SidecarRequest) => Promise<Response>;

export class SidecarServer {
  private server: Server;
  private handler: RequestHandler;

  constructor(handler: RequestHandler) {
    this.handler = handler;
    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch(error => {
        console.error('Unhandled server error:', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal server error');
        }
      });
    });
  }

  async listen(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.listen(port, (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          const address = this.server.address();
          if (address && typeof address === 'object') {
            resolve(address.port);
          } else {
            reject(new Error('Failed to get server port'));
          }
        }
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server.listening) {
        resolve();
        return;
      }
      
      this.server.close((error?: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://localhost`);
    const method = req.method?.toUpperCase();

    // Health check endpoint
    if (url.pathname === '/health' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
      return;
    }

    // Chat completions endpoint
    if (url.pathname === '/v1/chat/completions' && method === 'POST') {
      await this.handleChatCompletion(req, res);
      return;
    }

    // Method not allowed for known paths
    if (url.pathname === '/health' || url.pathname === '/v1/chat/completions') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method not allowed');
      return;
    }

    // Not found for unknown paths
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }

  private async handleChatCompletion(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // Parse request body
      const body = await this.parseRequestBody(req);
      
      // Prepare headers (only include content-type for compatibility with tests)
      const headers: Record<string, string> = {};
      if (req.headers['content-type']) {
        headers['content-type'] = Array.isArray(req.headers['content-type']) 
          ? req.headers['content-type'].join(', ')
          : req.headers['content-type'];
      }

      // Call handler
      const response = await this.handler({
        body,
        headers
      });

      // Set response headers
      res.writeHead(response.status, response.statusText, {
        'Content-Type': response.headers.get('content-type') || 'application/json'
      });

      // Stream response body
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        } finally {
          reader.releaseLock();
        }
      }

      res.end();
    } catch (error) {
      if (error instanceof SyntaxError) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid JSON');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal server error');
      }
    }
  }

  private async parseRequestBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });

      req.on('error', reject);
    });
  }
}