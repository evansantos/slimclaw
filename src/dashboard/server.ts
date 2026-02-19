/**
 * SlimClaw Dashboard Server - Hono-based metrics visualization
 * Serves real-time optimization metrics via REST API and web dashboard
 */

// Dynamic imports for better test compatibility
import type { Hono } from 'hono';
import type { MetricsCollector } from '../metrics/index.js';
import type { Server } from 'node:http';
import { setupRoutes } from './routes.js';

export interface DashboardConfig {
  port: number;
  host: string;
  basePath: string;
}

export class DashboardServer {
  private app: Hono | null = null;
  private server: Server | null = null;
  private initialized: Promise<void>;

  private config: DashboardConfig;

  constructor(
    private collector: MetricsCollector,
    config: Partial<DashboardConfig> = {}
  ) {
    this.config = {
      port: 3001,
      host: '0.0.0.0',
      basePath: '',
      ...config
    };
    this.initialized = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Dynamic import but make app available immediately for testing
      const { Hono } = await import('hono');
      this.app = new Hono({ strict: false });
      
      // Setup routes first (synchronous)
      this.setupRoutes();
      
      // Then setup middleware (can be async)
      await this.setupMiddleware();
    } catch (error) {
      console.error('Failed to initialize dashboard server:', error);
      throw error;
    }
  }

  /**
   * Setup middleware (CORS, static files)
   */
  private async setupMiddleware(): Promise<void> {
    try {
      const { cors } = await import('hono/cors');
      const { serveStatic } = await import('@hono/node-server/serve-static');
      const { dirname, join } = await import('node:path');
      const { fileURLToPath } = await import('node:url');

      // Get current file's directory for serving static files
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const publicPath = join(__dirname, 'public');

      // Enable CORS for API calls
      this.app!.use('*', cors({
        origin: ['http://localhost:3000', 'http://localhost:3001'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowHeaders: ['Content-Type', 'Authorization'],
      }));

      // Serve static files (CSS, JS, assets)
      this.app!.use('/static/*', serveStatic({ 
        root: publicPath,
        rewriteRequestPath: (path: string) => path.replace(/^\/static/, ''),
      }));
    } catch (error) {
      console.warn('Failed to setup middleware, some features may not work:', error);
    }
  }

  /**
   * Setup routes using routes module
   */
  private setupRoutes(): void {
    if (!this.app) {
      throw new Error('Cannot setup routes: app not initialized');
    }
    const routes = setupRoutes(this.collector);
    this.app.route('/', routes);
  }

  /**
   * Start the dashboard server
   */
  async start(): Promise<void> {
    await this.initialized; // Wait for initialization to complete
    
    if (!this.app) {
      throw new Error('Dashboard app not initialized');
    }

    try {
      const { serve } = await import('@hono/node-server');
      const app = this.app;
      
      this.server = serve({
        fetch: app.fetch,
        port: this.config.port,
        hostname: this.config.host,
      }) as unknown as Server;

      // Handle EADDRINUSE gracefully instead of crashing
      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`⚠️ SlimClaw Dashboard: port ${this.config.port} already in use, skipping dashboard`);
          this.server = null;
        } else {
          console.error('SlimClaw Dashboard server error:', err);
        }
      });

      console.log(`🌟 SlimClaw Dashboard running at http://${this.config.host}:${this.config.port}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        console.warn(`⚠️ SlimClaw Dashboard: port ${this.config.port} already in use, skipping`);
        return;
      }
      console.error('Failed to start dashboard server:', error);
      throw error;
    }
  }

  /**
   * Stop the dashboard server
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log('📊 SlimClaw Dashboard stopped');
    }
  }

  /**
   * Get the Hono app instance (for testing)
   */
  async getApp(): Promise<Hono> {
    await this.initialized;
    if (!this.app) {
      throw new Error('Dashboard server not initialized');
    }
    return this.app;
  }

  /**
   * Get server URL
   */
  getURL(): string {
    return `http://${this.config.host}:${this.config.port}${this.config.basePath}`;
  }
}

/**
 * Helper function to create and start dashboard
 */
export async function startDashboard(
  collector: MetricsCollector,
  config?: Partial<DashboardConfig>
): Promise<DashboardServer> {
  const server = new DashboardServer(collector, { 
    port: 3001, 
    host: '0.0.0.0', 
    basePath: '',
    ...config 
  });
  
  await server.start();
  return server;
}