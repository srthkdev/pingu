import { DatabaseConnection, DatabaseConfig } from './connection';
import { MigrationManager } from './migrations';
import * as path from 'path';

export class DatabaseManager {
  private connection: DatabaseConnection;
  private migrationManager: MigrationManager;
  private static instance: DatabaseManager | null = null;

  constructor(config: DatabaseConfig) {
    this.connection = new DatabaseConnection(config);
    this.migrationManager = new MigrationManager(this.connection);
  }

  static getInstance(config?: DatabaseConfig): DatabaseManager {
    if (!DatabaseManager.instance) {
      if (!config) {
        throw new Error('Database config required for first initialization');
      }
      DatabaseManager.instance = new DatabaseManager(config);
    }
    return DatabaseManager.instance;
  }

  async initialize(): Promise<void> {
    await this.connection.initialize();
    await this.migrationManager.migrate();
  }

  async close(): Promise<void> {
    await this.connection.close();
    DatabaseManager.instance = null;
  }

  getConnection(): DatabaseConnection {
    return this.connection;
  }

  getMigrationManager(): MigrationManager {
    return this.migrationManager;
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.connection.isConnected()) {
        return false;
      }

      // Test database connectivity with a simple query
      await this.connection.get('SELECT 1');
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}

// Default configuration factory
export function createDatabaseConfig(environment: string = 'development'): DatabaseConfig {
  const dbPath = path.join(process.cwd(), 'data');
  
  // Ensure data directory exists
  const fs = require('fs');
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
  }

  const configs: Record<string, DatabaseConfig> = {
    development: {
      filename: path.join(dbPath, 'github-label-notifier-dev.db'),
      busyTimeout: 30000,
    },
    test: {
      filename: ':memory:', // In-memory database for tests
      busyTimeout: 5000,
    },
    production: {
      filename: path.join(dbPath, 'github-label-notifier.db'),
      busyTimeout: 60000,
    }
  };

  return configs[environment] || configs.development;
}