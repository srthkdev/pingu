import { AppConfig } from '../index';

export const developmentConfig: Partial<AppConfig> = {
  // Development-specific overrides
  logging: {
    level: 'debug',
    toFile: false,
    filePath: undefined,
  },
  
  rateLimiting: {
    github: {
      requestsPerHour: 5000,
      retryDelay: 500, // Faster retries in development
      maxRetries: 2,
    },
    discord: {
      requestsPerSecond: 50,
      burstLimit: 10,
    },
  },
  
  database: {
    path: './data/pingu-dev.db',
    busyTimeout: 10000, // Shorter timeout for development
  },
  
  server: {
    port: 3000,
    host: '0.0.0.0',
    basePath: '/api',
    baseUrl: 'http://localhost:3000',
    healthPort: 3001,
  },
  
  eventProcessing: {
    filterBotIssues: true,
  },
};
