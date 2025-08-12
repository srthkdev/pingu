import express, { Express } from 'express';
import { Server } from 'http';
import { WebhookHandler } from '../handlers/webhook-handler';

export interface WebhookServerConfig {
  port: number;
  host: string;
  basePath: string;
}

export class WebhookServer {
  private app: Express;
  private server: Server | null = null;
  private webhookHandler: WebhookHandler;
  private config: WebhookServerConfig;

  constructor(webhookHandler: WebhookHandler, config?: Partial<WebhookServerConfig>) {
    this.webhookHandler = webhookHandler;
    this.config = {
      port: parseInt(process.env.WEBHOOK_PORT || '3000'),
      host: process.env.WEBHOOK_HOST || '0.0.0.0',
      basePath: process.env.WEBHOOK_BASE_PATH || '/api',
      ...config
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Trust proxy headers (important for getting real IP addresses)
    this.app.set('trust proxy', true);

    // Basic security headers
    this.app.use((_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });

    // Request logging
    this.app.use((req, _res, next) => {
      const timestamp = new Date().toISOString();
      console.log(`${timestamp} ${req.method} ${req.path} - ${req.ip}`);
      next();
    });

    // Error handling middleware
    this.app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('Express error:', error);
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    });
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Root health check
    this.app.get('/', (_req, res) => {
      res.json({
        service: 'Pingu Webhook Server',
        status: 'running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // Mount webhook routes
    console.log('Mounting webhook routes with basePath:', this.config.basePath);
    try {
      const router = this.webhookHandler.createRouter();
      console.log('Router created successfully, now mounting...');
      
      // Try mounting without basePath first to isolate the issue
      if (this.config.basePath === '/api') {
        console.log('Mounting with /api basePath...');
        this.app.use('/api', router);
      } else {
        console.log('Mounting with custom basePath:', this.config.basePath);
        this.app.use(this.config.basePath, router);
      }
      console.log('Router mounted successfully');
    } catch (error) {
      console.error('Error mounting webhook routes:', error);
      throw error;
    }

    // 404 handler - use a function instead of '*' pattern
    this.app.use((_req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      });
    });
  }

  /**
   * Start the webhook server
   */
  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, this.config.host, () => {
          console.log(`Webhook server listening on ${this.config.host}:${this.config.port}`);
          console.log(`Webhook endpoint: http://${this.config.host}:${this.config.port}${this.config.basePath}/webhook`);
          resolve();
        });

        this.server.on('error', (error) => {
          console.error('Webhook server error:', error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the webhook server
   */
  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          console.error('Error stopping webhook server:', error);
          reject(error);
        } else {
          console.log('Webhook server stopped');
          this.server = null;
          resolve();
        }
      });
    });
  }

  /**
   * Get server status
   */
  public getStatus(): {
    isRunning: boolean;
    config: WebhookServerConfig;
    address?: string;
  } {
    const address = this.server?.listening 
      ? `http://${this.config.host}:${this.config.port}`
      : undefined;

    return {
      isRunning: !!this.server?.listening,
      config: this.config,
      ...(address && { address })
    };
  }

  /**
   * Get the Express app instance (for testing)
   */
  public getApp(): Express {
    return this.app;
  }
}