import { DatabaseConnection, DatabaseConfig } from './connection';
import { MigrationManager } from './migrations';
import { config } from '../config';
import * as path from 'path';
import * as fs from 'fs';

export class DatabaseManager {
  private connection: DatabaseConnection;
  private migrationManager: MigrationManager;
  private static instance: DatabaseManager | null = null;

  constructor(dbConfig: DatabaseConfig) {
    this.connection = new DatabaseConnection(dbConfig);
    this.migrationManager = new MigrationManager(this.connection);
  }

  static getInstance(dbConfig?: DatabaseConfig): DatabaseManager {
    if (!DatabaseManager.instance) {
      if (!dbConfig) {
        // Use configuration from config manager
        dbConfig = createDatabaseConfig();
      }
      DatabaseManager.instance = new DatabaseManager(dbConfig);
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

// Configuration factory using the centralized config
export function createDatabaseConfig(): DatabaseConfig {
  const appConfig = config.getConfig();
  const dbPath = path.dirname(appConfig.database.path);
  
  // Ensure database directory exists (unless using in-memory database)
  if (appConfig.database.path !== ':memory:' && !fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
  }

  return {
    filename: appConfig.database.path,
    busyTimeout: appConfig.database.busyTimeout,
  };
}

// Legacy function for backward compatibility
export function createDatabaseConfigLegacy(environment: string = 'development'): DatabaseConfig {
  const dbPath = path.join(process.cwd(), 'data');
  
  // Ensure data directory exists
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
  }

  const configs: Record<string, DatabaseConfig> = {
    development: {
      filename: path.join(dbPath, 'pingu-dev.db'),
      busyTimeout: 30000,
    },
    test: {
      filename: ':memory:', // In-memory database for tests
      busyTimeout: 5000,
    },
    production: {
      filename: path.join(dbPath, 'pingu.db'),
      busyTimeout: 60000,
    }
  };

  return configs[environment] || configs.development;
}