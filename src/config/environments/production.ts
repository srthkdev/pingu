import { AppConfig } from '../index';

export const productionConfig: Partial<AppConfig> = {
  // Production-specific overrides
  logging: {
    level: 'info',
    toFile: true,
    filePath: './logs/app.log',
  },
  
  rateLimiting: {
    github: {
      requestsPerHour: 4500, // Conservative limit for production
      retryDelay: 2000, // Longer delays in production
      maxRetries: 5,
    },
    discord: {
      requestsPerSecond: 40, // Conservative limit
      burstLimit: 5,
    },
  },
  
  database: {
    path: './data/pingu.db',
    busyTimeout: 60000, // Longer timeout for production
  },
  
  server: {
    port: 3000,
    host: '0.0.0.0',
    basePath: '/api',
    baseUrl: process.env.WEBHOOK_BASE_URL || 'https://your-domain.com',
    healthPort: 3001,
  },
  
  eventProcessing: {
    filterBotIssues: true,
  },
};