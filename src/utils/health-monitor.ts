import { logger } from './logger';
import { errorHandler } from './error-handler';
import { DatabaseManager } from '../database/manager';
import { GitHubService } from '../services/github-service';
import { Client } from 'discord.js';

export interface HealthCheckResult {
  component: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message: string;
  details?: Record<string, any>;
  timestamp: string;
  responseTime?: number;
}

export interface SystemHealth {
  overall: 'healthy' | 'unhealthy' | 'degraded';
  components: HealthCheckResult[];
  timestamp: string;
  uptime: number;
}

export interface PerformanceMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
  uptime: number;
  eventLoop: {
    delay: number;
  };
  gc?: {
    collections: number;
    duration: number;
  };
}

export interface APIMetrics {
  github: {
    requestCount: number;
    errorCount: number;
    averageResponseTime: number;
    rateLimitRemaining: number;
    rateLimitReset: number;
  };
  discord: {
    interactionCount: number;
    errorCount: number;
    averageResponseTime: number;
  };
  database: {
    queryCount: number;
    errorCount: number;
    averageResponseTime: number;
    connectionCount: number;
  };
}

export class HealthMonitor {
  private static instance: HealthMonitor;
  private startTime: number;
  private healthChecks: Map<string, () => Promise<HealthCheckResult>> = new Map();
  private metrics: {
    github: { requests: number; errors: number; totalTime: number; };
    discord: { interactions: number; errors: number; totalTime: number; };
    database: { queries: number; errors: number; totalTime: number; };
  } = {
    github: { requests: 0, errors: 0, totalTime: 0 },
    discord: { interactions: 0, errors: 0, totalTime: 0 },
    database: { queries: 0, errors: 0, totalTime: 0 }
  };

  private constructor() {
    this.startTime = Date.now();
    this.setupDefaultHealthChecks();
    this.startPeriodicHealthChecks();
  }

  public static getInstance(): HealthMonitor {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor();
    }
    return HealthMonitor.instance;
  }

  private githubService?: GitHubService;
  private discordClient?: Client;

  /**
   * Sets up default health checks for core components
   */
  private setupDefaultHealthChecks(): void {
    // Database health check
    this.addHealthCheck('database', async () => {
      const startTime = Date.now();
      try {
        const dbManager = DatabaseManager.getInstance();
        const connection = dbManager.getConnection();
        
        // Simple query to test database connectivity
        await connection.get('SELECT 1');

        const responseTime = Date.now() - startTime;
        return {
          component: 'database',
          status: 'healthy' as const,
          message: 'Database connection is healthy',
          responseTime,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        const responseTime = Date.now() - startTime;
        return {
          component: 'database',
          status: 'unhealthy' as const,
          message: `Database connection failed: ${error instanceof Error ? error.message : String(error)}`,
          responseTime,
          timestamp: new Date().toISOString()
        };
      }
    });

    // Memory health check
    this.addHealthCheck('memory', async () => {
      const memUsage = process.memoryUsage();
      const totalMemory = memUsage.heapTotal;
      const usedMemory = memUsage.heapUsed;
      const memoryPercentage = (usedMemory / totalMemory) * 100;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = 'Memory usage is normal';

      if (memoryPercentage > 90) {
        status = 'unhealthy';
        message = 'Memory usage is critically high';
      } else if (memoryPercentage > 75) {
        status = 'degraded';
        message = 'Memory usage is elevated';
      }

      return {
        component: 'memory',
        status,
        message,
        details: {
          used: Math.round(usedMemory / 1024 / 1024),
          total: Math.round(totalMemory / 1024 / 1024),
          percentage: Math.round(memoryPercentage * 100) / 100
        },
        timestamp: new Date().toISOString()
      };
    });

    // Event loop health check
    this.addHealthCheck('eventloop', async () => {
      const startTime = process.hrtime.bigint();
      
      return new Promise<HealthCheckResult>((resolve) => {
        setImmediate(() => {
          const delay = Number(process.hrtime.bigint() - startTime) / 1000000; // Convert to milliseconds
          
          let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
          let message = 'Event loop is responsive';

          if (delay > 100) {
            status = 'unhealthy';
            message = 'Event loop is severely blocked';
          } else if (delay > 50) {
            status = 'degraded';
            message = 'Event loop is experiencing delays';
          }

          resolve({
            component: 'eventloop',
            status,
            message,
            details: { delay: Math.round(delay * 100) / 100 },
            timestamp: new Date().toISOString()
          });
        });
      });
    });

    // GitHub service health check
    this.addHealthCheck('github', async () => {
      const startTime = Date.now();
      try {
        if (!this.githubService) {
          return {
            component: 'github',
            status: 'degraded' as const,
            message: 'GitHub service not initialized',
            timestamp: new Date().toISOString()
          };
        }

        const rateLimitStatus = this.githubService.getRateLimitStatus();
        const responseTime = Date.now() - startTime;

        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        let message = 'GitHub API is accessible';

        if (rateLimitStatus.remaining < 100) {
          status = 'degraded';
          message = 'GitHub API rate limit is low';
        } else if (rateLimitStatus.remaining === 0) {
          status = 'unhealthy';
          message = 'GitHub API rate limit exceeded';
        }

        return {
          component: 'github',
          status,
          message,
          details: {
            rateLimitRemaining: rateLimitStatus.remaining,
            rateLimitReset: new Date(rateLimitStatus.reset * 1000).toISOString(),
            queueLength: rateLimitStatus.queueLength
          },
          responseTime,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        const responseTime = Date.now() - startTime;
        return {
          component: 'github',
          status: 'unhealthy' as const,
          message: `GitHub service error: ${error instanceof Error ? error.message : String(error)}`,
          responseTime,
          timestamp: new Date().toISOString()
        };
      }
    });

    // Discord client health check
    this.addHealthCheck('discord', async () => {
      try {
        if (!this.discordClient) {
          return {
            component: 'discord',
            status: 'degraded' as const,
            message: 'Discord client not initialized',
            timestamp: new Date().toISOString()
          };
        }

        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        let message = 'Discord client is connected';

        if (!this.discordClient.isReady()) {
          status = 'unhealthy';
          message = 'Discord client is not ready';
        } else if (this.discordClient.ws.ping > 200) {
          status = 'degraded';
          message = 'Discord connection has high latency';
        }

        return {
          component: 'discord',
          status,
          message,
          details: {
            ready: this.discordClient.isReady(),
            ping: this.discordClient.ws.ping,
            guilds: this.discordClient.guilds.cache.size,
            uptime: this.discordClient.uptime
          },
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return {
          component: 'discord',
          status: 'unhealthy' as const,
          message: `Discord client error: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date().toISOString()
        };
      }
    });
  }

  /**
   * Sets the GitHub service for health monitoring
   */
  public setGitHubService(service: GitHubService): void {
    this.githubService = service;
  }

  /**
   * Sets the Discord client for health monitoring
   */
  public setDiscordClient(client: Client): void {
    this.discordClient = client;
  }

  /**
   * Adds a custom health check
   */
  public addHealthCheck(name: string, check: () => Promise<HealthCheckResult>): void {
    this.healthChecks.set(name, check);
    logger.debug(`Added health check: ${name}`);
  }

  /**
   * Removes a health check
   */
  public removeHealthCheck(name: string): void {
    this.healthChecks.delete(name);
    logger.debug(`Removed health check: ${name}`);
  }

  /**
   * Runs all health checks and returns system health status
   */
  public async checkHealth(): Promise<SystemHealth> {
    const results: HealthCheckResult[] = [];
    
    for (const [name, check] of this.healthChecks) {
      try {
        const result = await check();
        results.push(result);
        logger.logHealthCheck(name, result.status === 'healthy' ? 'healthy' : 'unhealthy', result.details);
      } catch (error) {
        const errorResult: HealthCheckResult = {
          component: name,
          status: 'unhealthy',
          message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date().toISOString()
        };
        results.push(errorResult);
        logger.logHealthCheck(name, 'unhealthy', { error: errorResult.message });
      }
    }

    // Determine overall health
    const unhealthyCount = results.filter(r => r.status === 'unhealthy').length;
    const degradedCount = results.filter(r => r.status === 'degraded').length;
    
    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (unhealthyCount > 0) {
      overall = 'unhealthy';
    } else if (degradedCount > 0) {
      overall = 'degraded';
    }

    return {
      overall,
      components: results,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Gets performance metrics
   */
  public getPerformanceMetrics(): PerformanceMetrics {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        total: Math.round(memUsage.heapTotal / 1024 / 1024),
        percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 10000) / 100
      },
      cpu: {
        usage: Math.round(((cpuUsage.user + cpuUsage.system) / 1000000) * 100) / 100
      },
      uptime: Date.now() - this.startTime,
      eventLoop: {
        delay: 0 // This would need to be calculated separately
      }
    };
  }

  /**
   * Gets API usage metrics
   */
  public getAPIMetrics(): APIMetrics {
    return {
      github: {
        requestCount: this.metrics.github.requests,
        errorCount: this.metrics.github.errors,
        averageResponseTime: this.metrics.github.requests > 0 
          ? Math.round(this.metrics.github.totalTime / this.metrics.github.requests)
          : 0,
        rateLimitRemaining: 0, // Would need to be updated by GitHubService
        rateLimitReset: 0
      },
      discord: {
        interactionCount: this.metrics.discord.interactions,
        errorCount: this.metrics.discord.errors,
        averageResponseTime: this.metrics.discord.interactions > 0
          ? Math.round(this.metrics.discord.totalTime / this.metrics.discord.interactions)
          : 0
      },
      database: {
        queryCount: this.metrics.database.queries,
        errorCount: this.metrics.database.errors,
        averageResponseTime: this.metrics.database.queries > 0
          ? Math.round(this.metrics.database.totalTime / this.metrics.database.queries)
          : 0,
        connectionCount: 1 // SQLite typically has one connection
      }
    };
  }

  /**
   * Records GitHub API metrics
   */
  public recordGitHubAPICall(duration: number, success: boolean): void {
    this.metrics.github.requests++;
    this.metrics.github.totalTime += duration;
    if (!success) {
      this.metrics.github.errors++;
    }
  }

  /**
   * Records Discord interaction metrics
   */
  public recordDiscordInteraction(duration: number, success: boolean): void {
    this.metrics.discord.interactions++;
    this.metrics.discord.totalTime += duration;
    if (!success) {
      this.metrics.discord.errors++;
    }
  }

  /**
   * Records database operation metrics
   */
  public recordDatabaseOperation(duration: number, success: boolean): void {
    this.metrics.database.queries++;
    this.metrics.database.totalTime += duration;
    if (!success) {
      this.metrics.database.errors++;
    }
  }

  /**
   * Starts periodic health checks
   */
  private startPeriodicHealthChecks(): void {
    // Run health checks every 5 minutes
    setInterval(async () => {
      try {
        const health = await this.checkHealth();
        
        if (health.overall === 'unhealthy') {
          logger.warn('System health check failed', {
            overall: health.overall,
            unhealthyComponents: health.components
              .filter(c => c.status === 'unhealthy')
              .map(c => c.component)
          });
        } else if (health.overall === 'degraded') {
          logger.info('System health is degraded', {
            overall: health.overall,
            degradedComponents: health.components
              .filter(c => c.status === 'degraded')
              .map(c => c.component)
          });
        } else {
          logger.debug('System health check passed', { overall: health.overall });
        }
      } catch (error) {
        logger.error('Periodic health check failed', {}, error instanceof Error ? error : new Error(String(error)));
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Log metrics every 10 minutes
    setInterval(() => {
      const metrics = this.getAPIMetrics();
      const performance = this.getPerformanceMetrics();
      
      logger.info('System metrics', {
        api: metrics,
        performance: {
          memory: performance.memory,
          uptime: Math.round(performance.uptime / 1000 / 60) // minutes
        }
      });
    }, 10 * 60 * 1000); // 10 minutes
  }

  /**
   * Creates a health check endpoint response
   */
  public async getHealthEndpointResponse(): Promise<{
    status: number;
    body: SystemHealth;
  }> {
    const health = await this.checkHealth();
    
    let statusCode = 200;
    if (health.overall === 'degraded') {
      statusCode = 200; // Still operational
    } else if (health.overall === 'unhealthy') {
      statusCode = 503; // Service unavailable
    }

    return {
      status: statusCode,
      body: health
    };
  }

  /**
   * Gets diagnostic information for troubleshooting
   */
  public async getDiagnosticInfo(): Promise<{
    health: SystemHealth;
    metrics: APIMetrics;
    performance: PerformanceMetrics;
    errors: { errorType: string; count: number; lastOccurrence: number }[];
    environment: Record<string, string | undefined>;
  }> {
    const health = await this.checkHealth();
    const metrics = this.getAPIMetrics();
    const performance = this.getPerformanceMetrics();
    const errors = errorHandler.getErrorStats();

    return {
      health,
      metrics,
      performance,
      errors,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        LOG_LEVEL: process.env.LOG_LEVEL,
        DATABASE_PATH: process.env.DATABASE_PATH,
        WEBHOOK_BASE_URL: process.env.WEBHOOK_BASE_URL
      }
    };
  }

  /**
   * Resets all metrics (useful for testing or periodic cleanup)
   */
  public resetMetrics(): void {
    this.metrics = {
      github: { requests: 0, errors: 0, totalTime: 0 },
      discord: { interactions: 0, errors: 0, totalTime: 0 },
      database: { queries: 0, errors: 0, totalTime: 0 }
    };
    
    errorHandler.clearErrorStats();
    logger.info('System metrics reset');
  }

  /**
   * Gets uptime in a human-readable format
   */
  public getUptimeString(): string {
    const uptime = Date.now() - this.startTime;
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Global health monitor instance
export const healthMonitor = HealthMonitor.getInstance();