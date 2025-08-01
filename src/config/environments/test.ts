import { AppConfig } from '../index';

export const testConfig: Partial<AppConfig> = {
  // Test-specific overrides
  logging: {
    level: 'error', // Minimal logging during tests
    toFile: false,
    filePath: undefined,
  },
  
  rateLimiting: {
    github: {
      requestsPerHour: 1000,
      retryDelay: 100, // Fast retries for tests
      maxRetries: 1,
    },
    discord: {
      requestsPerSecond: 100,
      burstLimit: 20,
    },
  },
  
  database: {
    path: ':memory:', // In-memory database for tests
    busyTimeout: 5000,
  },
  
  server: {
    port: 0, // Random available port for tests
    host: '127.0.0.1',
    basePath: '/api',
    baseUrl: 'http://localhost:3000',
    healthPort: 0, // Random available port for tests
  },
  
  eventProcessing: {
    filterBotIssues: false, // Don't filter in tests
  },
};
