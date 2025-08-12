import express, { Request, Response } from 'express';
import { healthMonitor } from '../utils/health-monitor';
import { logger } from '../utils/logger';

export class HealthEndpoints {
  private app: express.Application;
  private server?: any;
  private port: number;

  constructor(port: number = 3001) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Basic middleware
    this.app.use(express.json());
    
    // Request logging
    this.app.use((req, _res, next) => {
      logger.debug('Health endpoint request', {
        method: req.method,
        path: req.path,
        ip: req.ip
      });
      next();
    });

    // Error handling middleware
    this.app.use((error: Error, req: Request, res: Response, _next: any) => {
      logger.error('Health endpoint error', {
        method: req.method,
        path: req.path,
        error: error.message
      }, error);

      res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    });
  }

  private setupRoutes(): void {
    // Basic health check endpoint
    this.app.get('/health', async (_req: Request, res: Response) => {
      try {
        const healthResponse = await healthMonitor.getHealthEndpointResponse();
        res.status(healthResponse.status).json(healthResponse.body);
      } catch (error) {
        logger.error('Health check endpoint failed', {}, error instanceof Error ? error : new Error(String(error)));
        res.status(503).json({
          overall: 'unhealthy',
          message: 'Health check failed',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Liveness probe (simple check that the service is running)
    this.app.get('/health/live', (_req: Request, res: Response) => {
      res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: healthMonitor.getUptimeString()
      });
    });

    // Readiness probe (check if service is ready to handle requests)
    this.app.get('/health/ready', async (_req: Request, res: Response) => {
      try {
        const health = await healthMonitor.checkHealth();
        
        // Consider service ready if overall health is not unhealthy
        const isReady = health.overall !== 'unhealthy';
        const statusCode = isReady ? 200 : 503;

        res.status(statusCode).json({
          ready: isReady,
          overall: health.overall,
          timestamp: new Date().toISOString(),
          components: health.components.map(c => ({
            name: c.component,
            status: c.status
          }))
        });
      } catch (error) {
        logger.error('Readiness check failed', {}, error instanceof Error ? error : new Error(String(error)));
        res.status(503).json({
          ready: false,
          error: 'Readiness check failed',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Detailed health information
    this.app.get('/health/detailed', async (_req: Request, res: Response) => {
      try {
        const diagnostics = await healthMonitor.getDiagnosticInfo();
        res.status(200).json(diagnostics);
      } catch (error) {
        logger.error('Detailed health check failed', {}, error instanceof Error ? error : new Error(String(error)));
        res.status(500).json({
          error: 'Failed to retrieve detailed health information',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Metrics endpoint
    this.app.get('/metrics', (_req: Request, res: Response) => {
      try {
        const apiMetrics = healthMonitor.getAPIMetrics();
        const performanceMetrics = healthMonitor.getPerformanceMetrics();

        res.status(200).json({
          api: apiMetrics,
          performance: performanceMetrics,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Metrics endpoint failed', {}, error instanceof Error ? error : new Error(String(error)));
        res.status(500).json({
          error: 'Failed to retrieve metrics',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Prometheus-style metrics endpoint
    this.app.get('/metrics/prometheus', (_req: Request, res: Response) => {
      try {
        const apiMetrics = healthMonitor.getAPIMetrics();
        const performanceMetrics = healthMonitor.getPerformanceMetrics();

        // Generate Prometheus-style metrics
        const prometheusMetrics = [
          `# HELP github_api_requests_total Total number of GitHub API requests`,
          `# TYPE github_api_requests_total counter`,
          `github_api_requests_total ${apiMetrics.github.requestCount}`,
          ``,
          `# HELP github_api_errors_total Total number of GitHub API errors`,
          `# TYPE github_api_errors_total counter`,
          `github_api_errors_total ${apiMetrics.github.errorCount}`,
          ``,
          `# HELP discord_interactions_total Total number of Discord interactions`,
          `# TYPE discord_interactions_total counter`,
          `discord_interactions_total ${apiMetrics.discord.interactionCount}`,
          ``,
          `# HELP discord_errors_total Total number of Discord errors`,
          `# TYPE discord_errors_total counter`,
          `discord_errors_total ${apiMetrics.discord.errorCount}`,
          ``,
          `# HELP database_queries_total Total number of database queries`,
          `# TYPE database_queries_total counter`,
          `database_queries_total ${apiMetrics.database.queryCount}`,
          ``,
          `# HELP database_errors_total Total number of database errors`,
          `# TYPE database_errors_total counter`,
          `database_errors_total ${apiMetrics.database.errorCount}`,
          ``,
          `# HELP memory_usage_bytes Current memory usage in bytes`,
          `# TYPE memory_usage_bytes gauge`,
          `memory_usage_bytes ${performanceMetrics.memory.used * 1024 * 1024}`,
          ``,
          `# HELP memory_total_bytes Total memory available in bytes`,
          `# TYPE memory_total_bytes gauge`,
          `memory_total_bytes ${performanceMetrics.memory.total * 1024 * 1024}`,
          ``,
          `# HELP uptime_seconds Total uptime in seconds`,
          `# TYPE uptime_seconds counter`,
          `uptime_seconds ${Math.floor(performanceMetrics.uptime / 1000)}`,
          ``
        ].join('\n');

        res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.status(200).send(prometheusMetrics);
      } catch (error) {
        logger.error('Prometheus metrics endpoint failed', {}, error instanceof Error ? error : new Error(String(error)));
        res.status(500).send('# Error generating metrics\n');
      }
    });

    // Version/info endpoint
    this.app.get('/info', (_req: Request, res: Response) => {
      const packageJson = require('../../package.json');
      
      res.status(200).json({
        name: packageJson.name || 'pingu',
        version: packageJson.version || '1.0.0',
        description: packageJson.description || 'Pingu Discord Bot',
        uptime: healthMonitor.getUptimeString(),
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler - use a function instead of '*' pattern
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
        availableEndpoints: [
          '/health',
          '/health/live',
          '/health/ready',
          '/health/detailed',
          '/metrics',
          '/metrics/prometheus',
          '/info'
        ]
      });
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          logger.info(`Health endpoints server started on port ${this.port}`);
          resolve();
        });

        this.server.on('error', (error: Error) => {
          logger.error('Health endpoints server error', { port: this.port }, error);
          reject(error);
        });
      } catch (error) {
        logger.error('Failed to start health endpoints server', { port: this.port }, error instanceof Error ? error : new Error(String(error)));
        reject(error);
      }
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Health endpoints server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getPort(): number {
    return this.port;
  }

  public isRunning(): boolean {
    return this.server && this.server.listening;
  }
}