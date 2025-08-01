import dotenv from 'dotenv';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

export interface AppConfig {
  // Environment
  nodeEnv: string;
  isDevelopment: boolean;
  isProduction: boolean;
  isTest: boolean;

  // Discord Configuration
  discord: {
    token: string;
    clientId: string;
  };

  // GitHub Configuration
  github: {
    token: string | undefined;
    webhookSecret: string | undefined;
  };

  // Database Configuration
  database: {
    path: string;
    busyTimeout: number;
  };

  // Server Configuration
  server: {
    port: number;
    host: string;
    basePath: string;
    baseUrl: string;
    healthPort: number;
  };

  // Event Processing Configuration
  eventProcessing: {
    filterBotIssues: boolean;
  };

  // Logging Configuration
  logging: {
    level: string;
    toFile: boolean;
    filePath: string | undefined;
  };

  // Rate Limiting Configuration
  rateLimiting: {
    github: {
      requestsPerHour: number;
      retryDelay: number;
      maxRetries: number;
    };
    discord: {
      requestsPerSecond: number;
      burstLimit: number;
    };
  };

  // Security Configuration
  security: {
    encryptionKey: string;
    webhookSecret: string;
  };
}

class ConfigManager {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  private loadConfiguration(): AppConfig {
    const nodeEnv = process.env.NODE_ENV || 'development';
    
    return {
      // Environment
      nodeEnv,
      isDevelopment: nodeEnv === 'development',
      isProduction: nodeEnv === 'production',
      isTest: nodeEnv === 'test',

      // Discord Configuration
      discord: {
        token: this.getRequiredEnvVar('DISCORD_TOKEN'),
        clientId: this.getRequiredEnvVar('DISCORD_CLIENT_ID'),
      },

      // GitHub Configuration
      github: {
        token: process.env.GITHUB_TOKEN,
        webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
      },

      // Database Configuration
      database: {
        path: process.env.DATABASE_PATH || './data/pingu.db',
        busyTimeout: parseInt(process.env.DATABASE_BUSY_TIMEOUT || '30000', 10),
      },

      // Server Configuration
      server: {
        port: parseInt(process.env.PORT || process.env.WEBHOOK_PORT || '3000', 10),
        host: process.env.WEBHOOK_HOST || '0.0.0.0',
        basePath: process.env.WEBHOOK_BASE_PATH || '/api',
        baseUrl: process.env.WEBHOOK_BASE_URL || 'http://localhost:3000',
        healthPort: parseInt(process.env.HEALTH_PORT || '3001', 10),
      },

      // Event Processing Configuration
      eventProcessing: {
        filterBotIssues: process.env.FILTER_BOT_ISSUES?.toLowerCase() === 'true',
      },

      // Logging Configuration
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        toFile: process.env.LOG_TO_FILE?.toLowerCase() === 'true',
        filePath: process.env.LOG_FILE_PATH,
      },

      // Rate Limiting Configuration
      rateLimiting: {
        github: {
          requestsPerHour: parseInt(process.env.GITHUB_RATE_LIMIT_PER_HOUR || '5000', 10),
          retryDelay: parseInt(process.env.GITHUB_RETRY_DELAY || '1000', 10),
          maxRetries: parseInt(process.env.GITHUB_MAX_RETRIES || '3', 10),
        },
        discord: {
          requestsPerSecond: parseInt(process.env.DISCORD_RATE_LIMIT_PER_SECOND || '50', 10),
          burstLimit: parseInt(process.env.DISCORD_BURST_LIMIT || '5', 10),
        },
      },

      // Security Configuration
      security: {
        encryptionKey: process.env.ENCRYPTION_KEY || this.generateDefaultEncryptionKey(),
        webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || this.generateDefaultWebhookSecret(),
      },
    };
  }

  private getRequiredEnvVar(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Required environment variable ${name} is not set`);
    }
    return value;
  }

  private generateDefaultEncryptionKey(): string {
    if (this.config?.isProduction) {
      throw new Error('ENCRYPTION_KEY must be set in production environment');
    }
    
    // Generate a simple key for development (not secure for production)
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  private generateDefaultWebhookSecret(): string {
    if (this.config?.isProduction) {
      logger.warn('GITHUB_WEBHOOK_SECRET not set in production - using generated secret');
    }
    
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  private validateConfiguration(): void {
    const errors: string[] = [];

    // Validate Discord configuration
    if (!this.config.discord.token) {
      errors.push('Discord token is required');
    }
    if (!this.config.discord.clientId) {
      errors.push('Discord client ID is required');
    }

    // Validate server configuration
    if (this.config.server.port < 1 || this.config.server.port > 65535) {
      errors.push('Server port must be between 1 and 65535');
    }
    if (this.config.server.healthPort < 1 || this.config.server.healthPort > 65535) {
      errors.push('Health port must be between 1 and 65535');
    }

    // Validate webhook base URL in production
    if (this.config.isProduction && !this.config.server.baseUrl.startsWith('https://')) {
      errors.push('Webhook base URL must use HTTPS in production');
    }

    // Validate logging configuration
    const validLogLevels = ['error', 'warn', 'info', 'debug'];
    if (!validLogLevels.includes(this.config.logging.level)) {
      errors.push(`Log level must be one of: ${validLogLevels.join(', ')}`);
    }

    // Validate rate limiting configuration
    if (this.config.rateLimiting.github.requestsPerHour < 1) {
      errors.push('GitHub rate limit must be at least 1 request per hour');
    }
    if (this.config.rateLimiting.discord.requestsPerSecond < 1) {
      errors.push('Discord rate limit must be at least 1 request per second');
    }

    // Production-specific validations
    if (this.config.isProduction) {
      if (!this.config.github.token) {
        logger.warn('GitHub token not set - some features may not work');
      }
      if (!process.env.ENCRYPTION_KEY) {
        errors.push('ENCRYPTION_KEY must be explicitly set in production');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  public getConfig(): AppConfig {
    return { ...this.config }; // Return a copy to prevent mutations
  }

  public get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  public isDev(): boolean {
    return this.config.isDevelopment;
  }

  public isProd(): boolean {
    return this.config.isProduction;
  }

  public isTest(): boolean {
    return this.config.isTest;
  }

  public logSanitizedConfig(): void {
    const sanitized = {
      nodeEnv: this.config.nodeEnv,
      discord: {
        clientId: this.config.discord.clientId,
        token: this.config.discord.token ? '[SET]' : '[NOT SET]',
      },
      github: {
        token: this.config.github.token ? '[SET]' : '[NOT SET]',
        webhookSecret: this.config.github.webhookSecret ? '[SET]' : '[NOT SET]',
      },
      database: {
        path: this.config.database.path,
        busyTimeout: this.config.database.busyTimeout,
      },
      server: this.config.server,
      eventProcessing: this.config.eventProcessing,
      logging: this.config.logging,
      rateLimiting: this.config.rateLimiting,
      security: {
        encryptionKey: this.config.security.encryptionKey ? '[SET]' : '[NOT SET]',
        webhookSecret: this.config.security.webhookSecret ? '[SET]' : '[NOT SET]',
      },
    };

    logger.info('Application configuration loaded', sanitized);
  }
}

// Export singleton instance
export const config = new ConfigManager();
export default config;
